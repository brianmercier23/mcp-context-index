// The go/no-go. Compares two runs of the same cohort under the same config and decides
// whether the instrument is reproducible enough to scale.
//
// Only runs with identical config_hash are comparable. A config change (rubric, cohort,
// tokenizer, sandbox model, dependency resolution date, node major, platform) makes the
// comparison meaningless, and this refuses rather than quietly producing a number.
import path from 'node:path';
import { ROOT, readJSON, readJSONL, appendJSONL, nowISO } from './lib.js';

const RESULTS = path.join(ROOT, 'results', 'runs.jsonl');
const OUT = path.join(ROOT, 'results', 'reproducibility.jsonl');
const METRIC = 'tool_definition_tokens';

function serverSet(all, runIdStr) {
  return all.filter((r) => r.record_type === 'server' && r.run_id === runIdStr)
    .map((r) => r.server.registry_name).sort().join('|');
}

function pickRuns(all, aId, bId) {
  const headers = all.filter((r) => r.record_type === 'run');
  if (aId && bId) {
    const a = headers.find((h) => h.run_id === aId);
    const b = headers.find((h) => h.run_id === bId);
    if (!a || !b) throw new Error('run id not found');
    return [a, b];
  }
  // Most recent pair sharing a config hash AND covering the identical set of servers.
  // Matching the config hash alone is not enough: LIMIT and ONLY are deliberately outside the
  // hash (they change coverage, not measurement), so two one-server runs of *different* servers
  // would otherwise pair up and produce a verdict over an empty overlap.
  for (let i = headers.length - 1; i > 0; i--) {
    for (let j = i - 1; j >= 0; j--) {
      if (headers[i].config_hash === headers[j].config_hash &&
          serverSet(all, headers[i].run_id) === serverSet(all, headers[j].run_id)) {
        return [headers[j], headers[i]];
      }
    }
  }
  throw new Error('no two comparable runs yet (need a matching config_hash and the same server set)');
}

// The rubric is read from the runs being compared, never from an env default. A comparator
// that can disagree with the runs about which rubric produced them will eventually stamp the
// wrong provenance onto an append-only record, and the log is the evidence — it has to be
// impossible for the verdict to name a rubric the measurement did not use.
function rubricFileFor(header) {
  const [id, version] = String(header.rubric || '').split('@');
  if (!id || !version) throw new Error(`run ${header.run_id} records no usable rubric ("${header.rubric}")`);
  return `rubric-v${version}.json`;
}

function main() {
  const all = readJSONL(RESULTS);
  const [A, B] = pickRuns(all, process.env.RUN_A, process.env.RUN_B);
  // Checked here and not only in pickRuns: naming two runs with RUN_A/RUN_B used to skip the
  // match that auto-pairing enforces, and the verdict would have carried A's hash for a pair B
  // never shared. A floating run against an as-of run is a question for the tree log, not a verdict.
  // Run ids are minute-resolution, so two short runs started in the same minute share one, and
  // every record of both would be read as one run compared with itself: a GO that tested nothing.
  if (A.run_id === B.run_id) throw new Error(`both sides of the pair are run ${A.run_id}; nothing to compare`);
  if (A.config_hash !== B.config_hash) {
    throw new Error(`runs have different config hashes (${A.config_hash.slice(0, 12)} vs ${B.config_hash.slice(0, 12)}); they are not comparable`);
  }
  if (A.rubric !== B.rubric) throw new Error(`runs used different rubrics (${A.rubric} vs ${B.rubric}); they are not comparable`);
  const rubric = readJSON(path.join(ROOT, 'rubric', rubricFileFor(A)));
  const gate = rubric.measurement_contract.reproducibility_gate;

  const byRun = (id) => new Map(all.filter((r) => r.record_type === 'server' && r.run_id === id).map((r) => [r.server.registry_name, r]));
  const a = byRun(A.run_id);
  const b = byRun(B.run_id);

  const names = [...new Set([...a.keys(), ...b.keys()])].sort();
  const rows = [];
  for (const n of names) {
    const ra = a.get(n), rb = b.get(n);
    const va = ra?.signals?.[METRIC] ?? null;
    const vb = rb?.signals?.[METRIC] ?? null;
    const statusChanged = (ra?.status ?? 'absent') !== (rb?.status ?? 'absent');

    let cls, deltaPct = null;
    if (va === null || vb === null) {
      cls = statusChanged ? 'status_changed' : 'not_measured';
    } else {
      deltaPct = va === 0 && vb === 0 ? 0 : (Math.abs(vb - va) / Math.max(va, 1)) * 100;
      cls = deltaPct <= gate.stable_if_delta_pct_lte ? 'stable'
        : deltaPct <= gate.tolerable_if_delta_pct_lte ? 'tolerable' : 'unstable';
    }

    rows.push({
      server: n,
      package: (ra || rb).server.npm_package,
      status_a: ra?.status ?? 'absent',
      status_b: rb?.status ?? 'absent',
      status_changed: statusChanged,
      [`${METRIC}_a`]: va,
      [`${METRIC}_b`]: vb,
      delta_pct: deltaPct === null ? null : Math.round(deltaPct * 1000) / 1000,
      classification: cls,
      tool_count_a: ra?.signals?.tool_count ?? null,
      tool_count_b: rb?.signals?.tool_count ?? null,
      grade_a: ra?.score?.grade ?? null,
      grade_b: rb?.score?.grade ?? null,
      intra_run_stable_a: ra?.signals?.intra_run_stable ?? null,
      intra_run_stable_b: rb?.signals?.intra_run_stable ?? null,
      // Null on records before harness 0.1.5, which did not hash the tree. A same-version server
      // whose number moved with its tree hash is a dependency-drift candidate; one whose number
      // moved while its tree held ran the same code, so the cause is the network, host or harness.
      dependency_tree_a: ra?.install?.dependency_tree?.hash ?? null,
      dependency_tree_b: rb?.install?.dependency_tree?.hash ?? null,
    });
  }

  const measured = rows.filter((r) => r.classification === 'stable' || r.classification === 'tolerable' || r.classification === 'unstable');
  const good = measured.filter((r) => r.classification !== 'unstable');
  const share = measured.length ? good.length / measured.length : 0;
  const pass = measured.length > 0 && share >= gate.cohort_pass_if_stable_or_tolerable_share_gte;
  // An empty overlap is not a failure of the servers, it is a failure to ask a question.
  // Never let it render as a clean NO-GO.
  const verdictLabel = measured.length === 0 ? 'INSUFFICIENT-DATA' : pass ? 'GO' : 'NO-GO';

  const gradeChanges = rows.filter((r) => r.grade_a && r.grade_b && r.grade_a !== r.grade_b);
  const treeChanges = rows.filter((r) => r.dependency_tree_a && r.dependency_tree_b && r.dependency_tree_a !== r.dependency_tree_b);

  const verdict = {
    record_type: 'reproducibility',
    evaluated_at: nowISO(),
    run_a: A.run_id,
    run_b: B.run_id,
    config_hash: A.config_hash,
    rubric: `${rubric.rubric_id}@${rubric.version}`,
    metric: METRIC,
    gate,
    counts: {
      servers_compared: rows.length,
      measured_in_both: measured.length,
      stable: measured.filter((r) => r.classification === 'stable').length,
      tolerable: measured.filter((r) => r.classification === 'tolerable').length,
      unstable: measured.filter((r) => r.classification === 'unstable').length,
      status_changed: rows.filter((r) => r.status_changed).length,
      not_measured_in_either: rows.filter((r) => r.classification === 'not_measured').length,
      grade_changed: gradeChanges.length,
      dependency_tree_changed: treeChanges.length,
    },
    stable_or_tolerable_share: Math.round(share * 10000) / 10000,
    verdict: verdictLabel,
    unstable_servers: measured.filter((r) => r.classification === 'unstable')
      .map((r) => ({ server: r.server, package: r.package, a: r[`${METRIC}_a`], b: r[`${METRIC}_b`], delta_pct: r.delta_pct, tool_count_a: r.tool_count_a, tool_count_b: r.tool_count_b })),
    status_flips: rows.filter((r) => r.status_changed).map((r) => ({ server: r.server, from: r.status_a, to: r.status_b })),
    grade_changes: gradeChanges.map((r) => ({ server: r.server, from: r.grade_a, to: r.grade_b })),
    rows,
  };

  appendJSONL(OUT, verdict);

  console.log(`${A.run_id}  vs  ${B.run_id}`);
  console.log(`config ${A.config_hash.slice(0, 12)}  rubric ${verdict.rubric}  metric ${METRIC}`);
  console.log(JSON.stringify(verdict.counts, null, 2));
  console.log(`stable-or-tolerable share ${(share * 100).toFixed(2)}%  (gate ${(gate.cohort_pass_if_stable_or_tolerable_share_gte * 100).toFixed(0)}%)`);
  console.log(`VERDICT: ${verdict.verdict}`);
  for (const u of verdict.unstable_servers) console.log(`  unstable: ${u.package}  ${u.a} -> ${u.b}  (${u.delta_pct}%)  tools ${u.tool_count_a}->${u.tool_count_b}`);
  for (const f of verdict.status_flips) console.log(`  flip: ${f.server}  ${f.from} -> ${f.to}`);
  for (const t of treeChanges) console.log(`  tree changed: ${t.package}  ${t.dependency_tree_a.slice(0, 12)} -> ${t.dependency_tree_b.slice(0, 12)}`);
}

main();
