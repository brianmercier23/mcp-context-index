// Latest full remote sweep -> docs/index-<cohort>.md, grouped by implementation.
// Every number is read from results/remote-runs.jsonl; nothing is typed.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readJSON, readJSONL } from './lib.js';

const COHORT = process.env.COHORT || 'commerce-mcp-v1';
const num = (n) => (typeof n === 'number' ? n.toLocaleString('en-US') : '—');
const PROTOCOL_LABEL = { ucp: 'UCP', pap: 'PAP', shopify: 'Shopify native' };

// Who a failure belongs to. auth_required is not a defect: PAP permits gating tools/list behind a
// session token, and a merchant may keep an API-key endpoint private. It is reported, not scored.
const FAILURE_READING = {
  auth_required: ['by design', 'Requires credentials before tools/list. Permitted by the protocols; the tool surface is not visible to an anonymous agent.'],
  rate_limited: ['environment', 'HTTP 429 on both passes, several seconds apart.'],
  not_an_mcp_endpoint: ['server', 'The endpoint advertised in the store manifest answers with a web page, not MCP.'],
  invalid_protocol_version: ['server', 'initialize returns a protocolVersion no MCP client recognises, so a spec-following client refuses the session.'],
  invalid_tool_schema: ['server', 'tools/list answers, but its result fails MCP schema validation in the client.'],
  no_handshake_response: ['server', 'Answers JSON-RPC but implements neither the 2026-07-28 nor the 2025 handshake.'],
};

export function loadRemote(cohortId = COHORT) {
  const log = readJSONL(path.join(ROOT, 'results', 'remote-runs.jsonl'));
  const full = log.filter((r) => r.record_type === 'run' && r.cohort_id === cohortId && !r.partial_sweep);
  if (full.length < 1) throw new Error(`no full sweep of ${cohortId} in results/remote-runs.jsonl`);
  const H = full[full.length - 1];
  const prev = full.length > 1 ? full[full.length - 2] : null;
  const recsOf = (rid) => log.filter((r) => r.record_type === 'server' && r.run_id === rid);
  const recs = recsOf(H.run_id);

  // Reproducibility: the two most recent full sweeps under the same config hash, server by server.
  let repro = null;
  if (prev && prev.config_hash === H.config_hash) {
    const before = new Map(recsOf(prev.run_id).map((r) => [r.server.id, r]));
    let both = 0, stable = 0, gradeChanges = 0, statusChanges = 0;
    for (const r of recs) {
      const p = before.get(r.server.id);
      if (!p) continue;
      if (p.status !== r.status) { statusChanges++; continue; }
      if (r.status !== 'probed') continue;
      both++;
      if (p.tool_surface_hash === r.tool_surface_hash) stable++;
      if (p.score?.grade !== r.score?.grade) gradeChanges++;
    }
    repro = { compared: [prev.run_id, H.run_id], measured_in_both: both, byte_identical: stable, grade_changes: gradeChanges, status_changes: statusChanges };
  }
  return { H, recs, repro, cohort: readJSON(path.join(ROOT, 'data', `cohort-${cohortId}.json`)) };
}

export function byImplementation(recs) {
  const groups = new Map();
  for (const r of recs) {
    const k = r.server.implementation;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  return [...groups.entries()].map(([impl, rs]) => {
    const probed = rs.filter((r) => r.status === 'probed');
    const toks = probed.map((r) => r.signals.tool_definition_tokens);
    const inOnly = probed.map((r) => r.signals.tool_definition_tokens_input_only);
    const tools = probed.map((r) => r.signals.tool_count);
    const range = (a) => (a.length ? (Math.min(...a) === Math.max(...a) ? num(a[0]) : `${num(Math.min(...a))}–${num(Math.max(...a))}`) : '—');
    const worst = probed.map((r) => r.score).sort((a, b) => (a.overall_score ?? 0) - (b.overall_score ?? 0))[0] ?? null;
    return {
      implementation: impl,
      protocol: rs[0].server.protocol,
      endpoints: rs.length,
      probed: probed.length,
      distinct_surfaces: new Set(probed.map((r) => r.tool_surface_hash)).size,
      handshake: [...new Set(probed.map((r) => r.handshake.answered))].join('/') || null,
      protocol_version: [...new Set(probed.map((r) => r.protocol_version))].join('/') || null,
      tools: range(tools),
      tokens: range(toks),
      tokens_input_only: range(inOnly),
      max_tokens: toks.length ? Math.max(...toks) : null,
      heaviest_tool: probed.sort((a, b) => b.signals.tool_definition_tokens - a.signals.tool_definition_tokens)[0]?.signals.heaviest_tool ?? null,
      grade: worst?.grade ?? null,
      uncapped_grade: worst?.uncapped_grade ?? null,
      defect_ids: [...new Set(probed.flatMap((r) => r.score?.defects?.ids || []))],
      failures: [...new Set(rs.filter((r) => r.http_failure).map((r) => r.http_failure.class))],
    };
  });
}

function main() {
  const { H, recs, repro, cohort } = loadRemote();
  const impls = byImplementation(recs);
  const measured = impls.filter((i) => i.probed > 0).sort((a, b) => b.max_tokens - a.max_tokens);
  const unmeasured = impls.filter((i) => i.probed === 0);
  const probed = recs.filter((r) => r.status === 'probed');
  const multi = measured.filter((i) => i.probed > 1);
  const modernImpls = measured.filter((i) => i.handshake.includes('modern')).map((i) => i.implementation);

  const L = [];
  L.push(`# Commerce MCP index: ${cohort.cohort_id}`);
  L.push('');
  L.push(`Measured ${H.finished_at.slice(0, 10)} · run \`${H.run_id}\` · config \`${H.config_hash.slice(0, 8)}\` · rubric ${H.rubric.split('@')[1]} · tokenizer ${H.tokenizer.library} ${H.tokenizer.encoding}`);
  L.push('');
  L.push('The MCP servers that online stores expose to shopping agents, through the Universal Commerce Protocol (UCP) and the Personal Agent Protocol (PAP). Each store publishes a manifest naming its MCP endpoint; this index connects to that endpoint as an agent would and measures what the agent is handed before it does anything.');
  L.push('');
  L.push('| | |');
  L.push('|---|---|');
  L.push(`| Endpoints attempted | **${H.counts.attempted}** across **${impls.length}** implementations |`);
  L.push(`| Measured | **${probed.length}** endpoints, **${measured.length}** implementations |`);
  L.push(`| Cheapest tool surface | **${num(H.token_spread.min)}** tokens |`);
  L.push(`| Most expensive | **${num(H.token_spread.max)}** tokens |`);
  L.push(`| Spread | **${H.token_spread.ratio}x** |`);
  L.push(`| Answering the 2026-07-28 handshake | **${H.handshakes.modern ?? 0} of ${probed.length}** measured endpoints |`);
  if (repro) L.push(`| Reproducibility | **${repro.byte_identical} of ${repro.measured_in_both}** byte-identical across two full sweeps, ${repro.grade_changes} grade changes |`);
  L.push('');
  L.push('## Read the caveats first');
  L.push('');
  L.push('1. **Not a random sample.** Stores were picked from public adopter directories (ucpchecker.com, papchecker.com), one to three per platform. The unit being graded is the implementation, not the store.');
  const split = multi.filter((i) => i.distinct_surfaces > 1).map((i) => `\`${i.implementation}\``);
  L.push(`2. **Stores on one platform share one tool surface.** Of the ${multi.length} implementations probed on more than one store, ${multi.length - split.length} returned a byte-identical surface on every store${split.length ? `; ${split.join(', ')} differs between stores only by optional store-level tools, and its range is shown` : ''}. A grade here describes the platform or plugin, and every store on it inherits it.`);
  L.push('3. **Read-only, and so narrower than the dev-tooling index.** The probe performs the handshake and lists tools, prompts and resources. It never calls a tool, so no cart, checkout or account action is attempted. Error legibility is therefore unmeasured, and the scoring drops that dimension from the weighting rather than scoring it zero. Name collisions are not scored: shared tool names are the point of a shared protocol.');
  L.push('4. **Output schemas are counted.** The protocol ships them, so the rubric counts them. Some agent hosts inject only names, descriptions and input schemas; that lower bound is shown beside every figure.');
  L.push('5. **Credentialed endpoints are reported, not graded.** Endpoints that require a session token or API key before listing tools were not measured. Both protocols allow that.');
  L.push('');
  L.push('## Measured');
  L.push('');
  L.push('| Implementation | Protocol | Endpoints | Handshake | Tools | Tool-definition tokens | Input-only | Grade | Defects |');
  L.push('|---|---|---:|---|---:|---:|---:|---|---|');
  for (const i of measured) {
    const grade = i.uncapped_grade && i.uncapped_grade !== i.grade ? `**${i.grade}** (${i.uncapped_grade} uncapped)` : `**${i.grade}**`;
    const surfaces = i.probed > 1 && i.distinct_surfaces > 1 ? ` (${i.distinct_surfaces} surfaces)` : '';
    L.push(`| ${i.implementation} | ${PROTOCOL_LABEL[i.protocol] ?? i.protocol} | ${i.probed}${surfaces} | ${i.handshake} ${i.protocol_version} | ${i.tools} | ${i.tokens} | ${i.tokens_input_only} | ${grade} | ${i.defect_ids.join(', ') || '—'} |`);
  }
  L.push('');
  const outlier = measured[0];
  const typical = measured.slice(Math.floor(measured.length / 2))[0];
  if (outlier && typical) {
    L.push(`The heaviest surface, **${outlier.implementation}**, costs ${num(outlier.max_tokens)} tokens, ${Math.round(outlier.max_tokens / typical.max_tokens)}x the median implementation (${typical.implementation}, ${num(typical.max_tokens)}). Its heaviest single tool is \`${outlier.heaviest_tool}\`. Where an implementation shows more than one surface, the difference is store-level features (for example, retail-location tools on one store), not a different implementation.`);
    L.push('');
  }
  if (modernImpls.length) {
    L.push(`Implementations already answering the 2026-07-28 handshake: ${modernImpls.map((m) => `\`${m}\``).join(', ')}.`);
    L.push('');
  }
  L.push('## Not measured, and why');
  L.push('');
  L.push('| Implementation | Protocol | Endpoints | Reason | Attribution | Detail |');
  L.push('|---|---|---:|---|---|---|');
  for (const i of unmeasured) {
    for (const f of i.failures) {
      const [attr, detail] = FAILURE_READING[f] || ['unknown', ''];
      L.push(`| ${i.implementation} | ${PROTOCOL_LABEL[i.protocol] ?? i.protocol} | ${i.endpoints} | \`${f}\` | ${attr} | ${detail} |`);
    }
  }
  L.push('');
  if (cohort.ucp_without_mcp) {
    L.push('## Publishing UCP without an MCP transport');
    L.push('');
    L.push('These stores publish a UCP manifest that declares no MCP endpoint (REST or embedded checkout only), so there is nothing to probe. Recorded because it is part of the adoption picture.');
    L.push('');
    for (const [platform, stores] of Object.entries(cohort.ucp_without_mcp)) L.push(`- **${platform}**: ${stores.length} store${stores.length === 1 ? '' : 's'} checked`);
    L.push('');
  }
  if (cohort.not_covered) {
    L.push('## Not covered');
    L.push('');
    L.push(cohort.not_covered);
    L.push('');
  }
  L.push('## Reproduce');
  L.push('');
  L.push('```bash');
  L.push('cd harness');
  L.push(`COHORT=${cohort.cohort_id} node src/remote.js   # twice; about two minutes each, read-only`);
  L.push(`COHORT=${cohort.cohort_id} node src/remote-report.js`);
  L.push('```');
  L.push('');
  L.push('Every endpoint, store and manifest source is in the cohort file; every measurement is in `results/remote-runs.jsonl`.');
  L.push('');

  const out = path.join(ROOT, 'docs', `index-${cohort.cohort_id}.md`);
  fs.writeFileSync(out, L.join('\n'));
  console.log(`wrote ${path.relative(ROOT, out)}  (${measured.length} measured, ${unmeasured.length} unmeasured implementations)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) main();
