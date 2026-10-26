// Orchestrator. One pass over the cohort -> one run header + one record per server,
// appended to results/runs.jsonl. Nothing is ever overwritten.
import os from 'node:os';
import path from 'node:path';
import { ROOT, HARNESS_VERSION, readJSON, readJSONL, appendJSONL, nowISO, sha256, stableStringify, runId, takenRunIds, mcpClientStack } from './lib.js';
import { install, resolveEntry, buildLaunch, makeCanary, cleanup, sandboxDir, acquireRunLock, SANDBOX_MODEL,
         dependencyResolution, versionOverrides, dependencyTree, directDependencies, npmVersion } from './sandbox.js';
import { session, detectEra, MODERN_PROTOCOL } from './probe.js';
import { analyze } from './analyze.js';
import { scoreServer, cohortCollisions } from './score.js';
import { classifyFailure, FAILURE_SPEC } from './classify.js';

const COHORT = process.env.COHORT || 'dev-tooling-v1';
// Bumping this moves the config hash, so runs under 1.1.0 are not comparable to the 1.0.0
// lineage in the reproducibility log. Nothing measured changed between the two rubrics — the
// dimensions, bands and signals are identical and only the reading of them differs — but the
// hash covers the rubric wholesale rather than trying to decide which parts of it are inert,
// which is the safer error. Re-establishing the lineage is one unattended pair.
const RUBRIC = process.env.RUBRIC || 'rubric-v1.1.1.json';
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : null;
// Comma-separated npm package names. For re-testing specific servers after a harness change
// without re-sweeping the cohort. Does not affect the config hash; the run just covers fewer rows.
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',').map((x) => x.trim())) : null;
// VERSION_OVERRIDE="pkg@ver,..." probes those servers at a version other than their pin; see
// versionOverrides() in sandbox.js. Unlike ONLY it changes what is measured, so it is in the
// config hash. Without ONLY, the run covers just the overridden servers.
const KEEP = process.env.KEEP_SANDBOX === '1';
const NOTE = process.env.RUN_NOTE || null;
const RESULTS = path.join(ROOT, 'results', 'runs.jsonl');
// Full trees, one record per distinct tree hash. Server records carry only the hash, so a sweep
// that installs the same trees as the last one adds nothing here.
const TREES = path.join(ROOT, 'results', 'dependency-trees.jsonl');

// Everything that could change a number. Two runs are only comparable if this matches.
function configHash(cohort, rubric, deps, overrides) {
  return sha256(stableStringify({
    // Only present when set, so a run without overrides hashes exactly as it did before they existed.
    ...(overrides.length ? { version_overrides: overrides.map(({ npm_package, version, dependencies }) => ({ npm_package, version, dependencies })) } : {}),
    harness: HARNESS_VERSION,
    rubric: `${rubric.rubric_id}@${rubric.version}`,
    tokenizer: rubric.measurement_contract.tokenizer,
    cohort: cohort.selection_hash,
    sandbox: SANDBOX_MODEL,
    // Before harness 0.1.5 this was not an input at all: every install floated, so two runs on
    // different days could install different code under one hash and the same-day pair could
    // never notice.
    dependencies: deps,
    node_major: process.versions.node.split('.')[0],
    platform: `${process.platform}-${process.arch}`,
    // Which client stack connected is part of how a number was produced. Harmless to omit while
    // there was one client; an uncontrolled input the moment there are two, since two runs could
    // differ in the library that measured them and still hash identically.
    mcp_clients: mcpClientStack(),
    probe: {
      connect_ms: Number(process.env.CONNECT_MS || 45000),
      call_ms: Number(process.env.CALL_MS || 20000),
      discover_ms: Number(process.env.DISCOVER_MS || 15000),
    },
  }));
}

async function probeOne(server, canary, rubric, deps, trees, override) {
  // pinned_version stays the cohort's pin; an override is recorded beside it, never in its place.
  const base = { server: { registry_name: server.registry_name, npm_package: server.npm_package, pinned_version: server.pinned_version, ...(override ? { version_override: override.version } : {}), downloads_last_week: server.downloads_last_week ?? null } };

  const inst = override
    ? await install({ ...server, pinned_version: override.version }, { before: override.dependencies.before })
    : await install(server, { before: deps.before });
  if (!inst.ok) {
    return { ...base, status: 'install_failed', install: { ok: false, ms: inst.ms, error: inst.error }, signals: {}, score: null };
  }

  // Read before launch, so the record describes what was installed rather than anything the
  // server wrote into its own directory once it was running.
  const tree = dependencyTree(inst.dir);
  if (!trees.has(tree.hash)) trees.set(tree.hash, tree.packages);
  const dependency_tree = { hash: tree.hash, packages: tree.count, direct: directDependencies(server, inst.dir) };

  const entry = resolveEntry(server, inst.dir);
  if (!entry.ok) {
    return { ...base, status: 'entry_unresolved', install: { ok: true, ms: inst.ms, dependency_tree }, detail: entry, signals: {}, score: null };
  }

  const launch = buildLaunch(server, entry.entry, canary);

  // The 2026-07-28 spec retired initialize. Probe server/discover first and fall back, which is
  // the order the spec specifies for stdio, so a server that has migrated is measured rather than
  // blamed for not answering a handshake that no longer exists.
  const era = await detectEra(launch);
  const eraForSession = era.handshake === 'modern' ? 'modern' : 'legacy';
  const sess = await session(launch, { collectErrors: true, canary, era: eraForSession });
  const sess2 = sess.ok ? await session(launch, { collectErrors: false, canary, era: eraForSession }) : null;

  // Recorded per server, not just counted: this is the running record of who migrated when.
  const handshake = {
    answered: era.handshake === 'modern' ? 'modern' : sess.ok ? 'legacy' : 'none',
    probe_order: 'server/discover -> initialize',
    modern_protocol: MODERN_PROTOCOL,
    negotiated_version: sess.protocol_version ?? era.negotiated_version ?? null,
    discover: era.discover,
    discover_probe_error: era.probe_error,
  };

  const { signals, fault_checks, per_tool_tokens } = analyze({ server, install: inst, launch, sess, sess2, canary, rubric });

  return {
    ...base,
    status: sess.ok ? 'probed' : 'connect_failed',
    handshake,
    install: { ok: true, ms: inst.ms, installed_version: entry.pkg_version, dependency_tree },
    launch: { entry: path.relative(sandboxDir(server), entry.entry), argv_extra: launch.args.length - 1, declared_secrets: launch.declared_secrets },
    server_info: sess.server_info ?? null,
    protocol_version: sess.protocol_version ?? null,
    session_error: sess.error ?? null,
    failure_class: sess.ok ? null : classifyFailure(sess.stderr_sample, sess.error, handshake),
    unsatisfied: { env: launch.unset_required_env, args: launch.unsatisfied_required_args },
    signals,
    fault_checks,
    per_tool_tokens,
    error_probes: sess.error_probes ?? [],
    stderr: { bytes: sess.stderr_bytes, lines: sess.stderr_lines, sample: sess.stderr_sample },
  };
}

async function main() {
  const cohort = readJSON(path.join(ROOT, 'data', `cohort-${COHORT}.json`));
  const rubric = readJSON(path.join(ROOT, 'rubric', RUBRIC));
  const deps = dependencyResolution(cohort);
  const overrides = await versionOverrides(cohort);
  const overrideOf = new Map(overrides.map((o) => [o.npm_package, o]));
  const cfg = configHash(cohort, rubric, deps, overrides);
  const started = nowISO();
  const rid = runId(started, cfg, takenRunIds(RESULTS));
  const canary = makeCanary(rid);
  const releaseLock = acquireRunLock(rid);

  let servers = ONLY ? cohort.servers.filter((s) => ONLY.has(s.npm_package))
    : overrides.length ? cohort.servers.filter((s) => overrideOf.has(s.npm_package))
    : cohort.servers;
  if (LIMIT) servers = servers.slice(0, LIMIT);
  console.log(`run ${rid}  cohort=${cohort.cohort_id} n=${servers.length} rubric=${rubric.version} config=${cfg.slice(0, 12)} deps=${deps.before ?? deps.policy}`);
  for (const o of overrides) console.log(`  override ${o.npm_package} ${o.pinned_version} -> ${o.version}  deps=${o.dependencies.before ?? o.dependencies.policy}`);

  const records = [];
  const trees = new Map();
  for (let i = 0; i < servers.length; i++) {
    const s = servers[i];
    const o = overrideOf.get(s.npm_package);
    process.stdout.write(`[${String(i + 1).padStart(3)}/${servers.length}] ${s.npm_package}@${o ? `${o.version} (override; pin ${s.pinned_version})` : s.pinned_version} ... `);
    let rec;
    try {
      rec = await probeOne(s, canary, rubric, deps, trees, o);
    } catch (e) {
      rec = { server: { registry_name: s.registry_name, npm_package: s.npm_package, pinned_version: s.pinned_version, ...(o ? { version_override: o.version } : {}) }, status: 'harness_error', error: String(e.message || e).slice(0, 500), signals: {}, score: null };
    }
    if (!KEEP) { try { await cleanup(s); } catch { /* best effort */ } }
    // Crash insurance. Collision risk and scoring need the whole cohort, so the canonical
    // record cannot be finalised until the sweep ends; this side file means a sweep that dies
    // at server 49 still leaves 48 real measurements on disk.
    appendJSONL(path.join(ROOT, 'results', 'partial', `${rid}.jsonl`), { record_type: 'server_unscored', run_id: rid, config_hash: cfg, ...rec });
    records.push(rec);
    const t = rec.signals?.tool_definition_tokens;
    console.log(rec.status === 'probed' ? `${rec.signals.tool_count} tools, ${t} tok` : rec.status);
  }

  // Collision risk needs the whole cohort, so it is filled in after the sweep and before scoring.
  const collisions = cohortCollisions(records);
  for (const rec of records) {
    Object.assign(rec.signals, collisions.get(rec.server.registry_name) || {});
    rec.score = rec.status === 'probed' ? scoreServer(rec.signals, rubric) : null;
  }

  const probed = records.filter((r) => r.status === 'probed');
  const toks = probed.map((r) => r.signals.tool_definition_tokens).filter((n) => typeof n === 'number');
  const header = {
    record_type: 'run',
    run_id: rid,
    started_at: started,
    finished_at: nowISO(),
    harness_version: HARNESS_VERSION,
    rubric: `${rubric.rubric_id}@${rubric.version}`,
    cohort_id: cohort.cohort_id,
    cohort_selection_hash: cohort.selection_hash,
    config_hash: cfg,
    sandbox_model: SANDBOX_MODEL,
    dependency_resolution: deps,
    // Per server: the pin, the version actually probed, when it was published, and how its
    // dependencies resolved (which replaces dependency_resolution for that server).
    version_overrides: overrides.length ? overrides : null,
    mcp_clients: mcpClientStack(),
    // A sweep narrowed by ONLY or LIMIT is a spot check, not an index, and so is any run that
    // probed a version other than the pin. Recorded so a reader of the log can tell them apart
    // without counting rows, and so the report never publishes one.
    partial_sweep: Boolean(ONLY || LIMIT || overrides.length),
    tokenizer: rubric.measurement_contract.tokenizer,
    env: { node: process.versions.node, npm: npmVersion(), platform: process.platform, arch: process.arch, cpus: os.cpus().length },
    note: NOTE,
    counts: {
      attempted: records.length,
      probed: probed.length,
      install_failed: records.filter((r) => r.status === 'install_failed').length,
      entry_unresolved: records.filter((r) => r.status === 'entry_unresolved').length,
      connect_failed: records.filter((r) => r.status === 'connect_failed').length,
      harness_error: records.filter((r) => r.status === 'harness_error').length,
    },
    failure_classes: records.filter((r) => r.failure_class).reduce((acc, r) => {
      const k = `${r.failure_class.attribution}:${r.failure_class.id}`;
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {}),
    failure_classes_spec: FAILURE_SPEC,
    // Migration rate across the cohort, and the reason the index can be trusted not to be
    // measuring a retired protocol. 'none' means the process answered neither handshake.
    handshakes: records.reduce((acc, r) => {
      const k = r.handshake?.answered || 'not_reached';
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {}),
    token_spread: toks.length ? {
      min: Math.min(...toks), max: Math.max(...toks),
      ratio: Math.round((Math.max(...toks) / Math.max(1, Math.min(...toks))) * 10) / 10,
      total_if_all_installed: toks.reduce((a, b) => a + b, 0),
    } : null,
  };

  appendJSONL(RESULTS, [header, ...records.map((r) => ({ record_type: 'server', run_id: rid, config_hash: cfg, ...r }))]);
  const known = new Set(readJSONL(TREES).map((t) => t.tree_hash));
  const fresh = [...trees].filter(([h]) => !known.has(h))
    .map(([tree_hash, packages]) => ({ record_type: 'dependency_tree', tree_hash, first_seen_run_id: rid, packages }));
  if (fresh.length) appendJSONL(TREES, fresh);
  releaseLock();
  console.log(`\nappended ${records.length + 1} records to results/runs.jsonl`);
  console.log(`probed ${probed.length}/${records.length}; token spread ${JSON.stringify(header.token_spread)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
