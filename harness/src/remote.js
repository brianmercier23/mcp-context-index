// Remote cohort runner. Streamable HTTP endpoints instead of npm installs: nothing is installed
// or executed locally, so there is no sandbox, canary or argv to measure.
//
// Read-only by construction: handshake and list calls only, never tools/call. Results go to their
// own file, results/remote-runs.jsonl, because a remote run shares no config hash with the stdio
// lineage in runs.jsonl and must never be compared against it.
import os from 'node:os';
import path from 'node:path';
import { ROOT, HARNESS_VERSION, readJSON, appendJSONL, nowISO, sha256, stableStringify, runId, mcpClientStack, countTokens } from './lib.js';
import { session, detectEra, toolDefinitionPayload, MODERN_PROTOCOL } from './probe.js';
import { analyze } from './analyze.js';
import { scoreServer } from './score.js';

const COHORT = process.env.COHORT || 'commerce-mcp-v0';
const RUBRIC = process.env.RUBRIC || 'rubric-v1.1.1.json';
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',').map((x) => x.trim())) : null;
const PAUSE_MS = Number(process.env.PAUSE_MS || 1500);
const NOTE = process.env.RUN_NOTE || null;
const RESULTS = path.join(ROOT, 'results', 'remote-runs.jsonl');
// Self-identifying on purpose: the merchants this cohort covers are exactly the ones now asking
// automated clients to say what they are.
const HEADERS = { 'User-Agent': `mcp-probe/${HARNESS_VERSION} (read-only tools/list; +https://github.com/brianmercier23/mcp-context-index)` };

function configHash(cohort, rubric) {
  return sha256(stableStringify({
    harness: HARNESS_VERSION,
    rubric: `${rubric.rubric_id}@${rubric.version}`,
    tokenizer: rubric.measurement_contract.tokenizer,
    cohort: cohort.selection_hash,
    transport: 'streamable-http',
    node_major: process.versions.node.split('.')[0],
    platform: `${process.platform}-${process.arch}`,
    mcp_clients: mcpClientStack(),
    probe: {
      connect_ms: Number(process.env.CONNECT_MS || 45000),
      call_ms: Number(process.env.CALL_MS || 20000),
      discover_ms: Number(process.env.DISCOVER_MS || 15000),
    },
  }));
}

// What an HTTP failure says about the server. Read from both handshake attempts: the session error
// carries the response body, the discover error carries the status the SDK parsed out of it.
function httpFailure(sessionError, discoverError) {
  const e = `${sessionError || ''}\n${discoverError || ''}`;
  const status = Number((e.match(/\b(?:HTTP|status(?: code)?)\D{0,3}(\d{3})\b/i) || e.match(/<title>(\d{3})\b/) || [])[1]) || null;
  const cls = status === 401 || status === 403 || /unauthori[sz]ed|invalid_token|authentication required|session token/i.test(e) ? 'auth_required'
    : status === 429 || /too many requests/i.test(e) ? 'rate_limited'
    : /challenge/i.test(e) ? 'bot_challenge'
    // -32601 to initialize from a live JSON-RPC endpoint: the process answers but implements
    // neither handshake. Same evidence rule as the stdio no_handshake_response class.
    : /-32601/.test(sessionError || '') ? 'no_handshake_response'
    // The manifest advertises an MCP endpoint that answers with a web page (Tray: 302 to HTML).
    : /Unexpected content type: text\/html/i.test(e) ? 'not_an_mcp_endpoint'
    // initialize answered with a protocolVersion no client knows (Boutir sends "2.0", the
    // JSON-RPC version), so a spec-following client refuses the session.
    : /protocol version is not supported/i.test(e) ? 'invalid_protocol_version'
    // tools/list answered, but the result fails the client's MCP schema validation.
    : /"code":\s*"invalid_(value|type)"[\s\S]*"tools"/.test(sessionError || '') ? 'invalid_tool_schema'
    : status === 404 || status === 405 ? 'not_found'
    : status && status >= 500 ? 'server_error'
    : /timeout:/.test(e) ? 'timeout'
    : /ENOTFOUND|ECONNREFUSED|ECONNRESET|fetch failed|certificate/i.test(e) ? 'unreachable'
    : 'protocol_error';
  return { status, class: cls };
}

async function probeOne(server, rubric) {
  const launch = { url: server.url, headers: HEADERS };
  const era = await detectEra(launch);
  const eraForSession = era.handshake === 'modern' ? 'modern' : 'legacy';
  const sess = await session(launch, { collectErrors: false, era: eraForSession });
  const sess2 = sess.ok ? await session(launch, { collectErrors: false, era: eraForSession }) : null;

  const handshake = {
    answered: era.handshake === 'modern' ? 'modern' : sess.ok ? 'legacy' : 'none',
    probe_order: 'server/discover -> initialize',
    modern_protocol: MODERN_PROTOCOL,
    negotiated_version: sess.protocol_version ?? era.negotiated_version ?? null,
    discover: era.discover,
    discover_probe_error: era.probe_error,
  };

  // No install and no local process: the install-shaped inputs analyze() expects are constants,
  // and the auth-hygiene signals that depend on them are left unmeasured rather than faked.
  const { signals, fault_checks, per_tool_tokens } = analyze({
    server,
    install: { ok: true },
    launch: { secrets_via_argv: null, declared_secret_count: null },
    sess, sess2, canary: null, rubric,
  });
  // Shared tool names are the point of a protocol like UCP, so cross-implementation collisions
  // are not a defect here. Left unmeasured, which the defect report lists as not evaluable.
  signals.cohort_collision_count = null;
  // The rubric counts outputSchema because the protocol ships it. Some hosts inject only name,
  // description and inputSchema, so the lower bound is recorded beside it, never instead of it.
  if (sess.ok) {
    signals.tool_definition_tokens_input_only = countTokens(stableStringify(toolDefinitionPayload(sess.tools).map(({ outputSchema, ...rest }) => rest)));
  }

  return {
    server: { id: server.id, implementation: server.implementation, protocol: server.protocol, store: server.store, url: server.url },
    status: sess.ok ? 'probed' : 'connect_failed',
    handshake,
    server_info: sess.server_info ?? null,
    protocol_version: sess.protocol_version ?? null,
    session_error: sess.error ?? null,
    http_failure: sess.ok ? null : httpFailure(sess.error, era.probe_error),
    signals,
    fault_checks,
    per_tool_tokens,
    tool_surface_hash: sess.ok ? sha256(stableStringify(sess.tools.map((t) => ({ name: t.name, description: t.description ?? '', inputSchema: t.inputSchema ?? {}, ...(t.outputSchema ? { outputSchema: t.outputSchema } : {}) })).sort((a, b) => a.name.localeCompare(b.name)))).slice(0, 16) : null,
    score: sess.ok ? scoreServer(signals, rubric) : null,
  };
}

async function main() {
  const cohort = readJSON(path.join(ROOT, 'data', `cohort-${COHORT}.json`));
  const rubric = readJSON(path.join(ROOT, 'rubric', RUBRIC));
  const cfg = configHash(cohort, rubric);
  const started = nowISO();
  const rid = runId(started, cfg);
  const servers = ONLY ? cohort.servers.filter((s) => ONLY.has(s.id)) : cohort.servers;
  console.log(`remote run ${rid}  cohort=${cohort.cohort_id} n=${servers.length} rubric=${rubric.version} config=${cfg.slice(0, 12)}`);

  const records = [];
  for (let i = 0; i < servers.length; i++) {
    const s = servers[i];
    process.stdout.write(`[${String(i + 1).padStart(2)}/${servers.length}] ${s.id} ... `);
    let rec;
    try {
      rec = await probeOne(s, rubric);
    } catch (e) {
      rec = { server: { id: s.id, implementation: s.implementation, protocol: s.protocol, store: s.store, url: s.url }, status: 'harness_error', error: String(e.message || e).slice(0, 500), signals: {}, score: null };
    }
    records.push(rec);
    console.log(rec.status === 'probed'
      ? `${rec.signals.tool_count} tools, ${rec.signals.tool_definition_tokens} tok, ${rec.handshake.answered}, grade ${rec.score?.grade}`
      : `${rec.status} ${rec.http_failure ? `${rec.http_failure.class}${rec.http_failure.status ? ` ${rec.http_failure.status}` : ''}` : ''}`);
    if (i < servers.length - 1) await new Promise((r) => setTimeout(r, PAUSE_MS));
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
    transport: 'streamable-http',
    mcp_clients: mcpClientStack(),
    partial_sweep: Boolean(ONLY),
    tokenizer: rubric.measurement_contract.tokenizer,
    env: { node: process.versions.node, platform: process.platform, arch: process.arch, cpus: os.cpus().length },
    note: NOTE,
    counts: {
      attempted: records.length,
      probed: probed.length,
      connect_failed: records.filter((r) => r.status === 'connect_failed').length,
      harness_error: records.filter((r) => r.status === 'harness_error').length,
    },
    http_failures: records.filter((r) => r.http_failure).reduce((acc, r) => { acc[r.http_failure.class] = (acc[r.http_failure.class] || 0) + 1; return acc; }, {}),
    handshakes: records.reduce((acc, r) => { const k = r.handshake?.answered || 'not_reached'; acc[k] = (acc[k] || 0) + 1; return acc; }, {}),
    token_spread: toks.length ? { min: Math.min(...toks), max: Math.max(...toks), ratio: Math.round((Math.max(...toks) / Math.max(1, Math.min(...toks))) * 10) / 10 } : null,
  };

  appendJSONL(RESULTS, [header, ...records.map((r) => ({ record_type: 'server', run_id: rid, config_hash: cfg, ...r }))]);
  console.log(`\nappended ${records.length + 1} records to results/remote-runs.jsonl`);
  console.log(JSON.stringify({ counts: header.counts, http_failures: header.http_failures, handshakes: header.handshakes, token_spread: header.token_spread }));
}

main().catch((e) => { console.error(e); process.exit(1); });
