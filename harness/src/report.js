// Renders the latest run into a markdown index. The JSONL stays the record of truth;
// this is the readable face of it, regenerated from scratch every time.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readJSON, readJSONL } from './lib.js';
import { classifyFailure, FAILURE_SPEC } from './classify.js';

const RESULTS = path.join(ROOT, 'results', 'runs.jsonl');

function fmt(n) {
  return n === null || n === undefined ? '—' : typeof n === 'number' ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(n);
}

function main() {
  const all = readJSONL(RESULTS);
  const rubric = readJSON(path.join(ROOT, 'rubric', process.env.RUBRIC || 'rubric-v1.1.1.json'));
  const rubricKey = `${rubric.rubric_id}@${rubric.version}`;
  const headers = all.filter((r) => r.record_type === 'run');
  if (!headers.length) throw new Error('no runs yet');
  // Default to the newest FULL sweep. A run narrowed by ONLY or LIMIT is a spot check and must
  // never be published as an index. `partial_sweep` is recorded from harness 0.1.3 on; for older
  // records it is re-derived by comparing coverage against the widest sweep of the same cohort.
  let H;
  if (process.env.RUN_ID) {
    H = headers.find((h) => h.run_id === process.env.RUN_ID);
    if (!H) throw new Error(`no run ${process.env.RUN_ID}`);
  } else {
    const cohortOf = headers[headers.length - 1].cohort_id;
    const sameCohort = headers.filter((h) => h.cohort_id === cohortOf);
    const widest = Math.max(...sameCohort.map((h) => h.counts.attempted));
    const full = sameCohort.filter((h) => h.partial_sweep !== true && h.counts.attempted >= widest);
    if (!full.length) throw new Error(`no full sweep of ${cohortOf} in the log; pass RUN_ID to report a partial one`);
    H = full[full.length - 1];
  }
  const recs = all.filter((r) => r.record_type === 'server' && r.run_id === H.run_id);
  const probed = recs.filter((r) => r.status === 'probed').sort((a, b) => b.signals.tool_definition_tokens - a.signals.tool_definition_tokens);

  // Scores can come from a later rubric than the one the run was measured under. Measurement and
  // interpretation are separate files on purpose; the report always names which of each it used.
  const overlay = new Map(
    readJSONL(path.join(ROOT, 'results', 'scores.jsonl'))
      .filter((r) => r.record_type === 'scoring' && r.run_id === H.run_id && r.rubric === rubricKey)
      .map((r) => [r.registry_name, r.score])
  );
  const rescored = overlay.size > 0;
  const scoreOf = (r) => (rescored ? overlay.get(r.server.registry_name) ?? null : r.score ?? null);

  const repro = readJSONL(path.join(ROOT, 'results', 'reproducibility.jsonl'))
    .filter((v) => v.run_b === H.run_id || v.run_a === H.run_id).slice(-1)[0] || null;

  const L = [];
  L.push(`# MCP server index — ${H.cohort_id}`);
  L.push('');
  L.push(`Run \`${H.run_id}\` · measured under rubric \`${H.rubric}\` · scored under \`${rubricKey}\` · ${H.counts.probed}/${H.counts.attempted} servers probed · ${H.started_at.slice(0, 16).replace('T', ' ')} UTC`);
  L.push('');
  L.push('Measured by sandboxed execution, not by reading listings. Every number below is the');
  L.push(`output of a real MCP session against a pinned install, tokenised with \`${H.tokenizer.library}\` (\`${H.tokenizer.encoding}\`).`);
  if (rescored) {
    L.push('');
    L.push(`Grades and defect counts are re-scored from the append-only log under \`${rubricKey}\`; the`);
    L.push('measurements themselves are untouched and come from the run named above. Signals are raw');
    L.push('measurements and never change, so a rubric revision is a re-read rather than a re-measurement.');
  }
  L.push('');

  if (H.token_spread) {
    L.push('## The headline');
    L.push('');
    L.push(`| | |`);
    L.push(`|---|---|`);
    L.push(`| Cheapest server | **${fmt(H.token_spread.min)}** tokens of tool definitions |`);
    L.push(`| Most expensive | **${fmt(H.token_spread.max)}** tokens |`);
    L.push(`| Spread | **${H.token_spread.ratio}x** |`);
    L.push(`| All ${H.counts.probed} installed at once | **${fmt(H.token_spread.total_if_all_installed)}** tokens of context, before a single call |`);
    L.push('');
    L.push('That last figure is the one that sells an audit: it is the fixed tax a team pays on');
    L.push('every conversation, in every session, whether or not any tool is used.');
    L.push('');
  }

  L.push('## Cost of admission, by server');
  L.push('');
  L.push('| Server | npm | Tools | Tool-def tokens | Median/tool | Heaviest tool | Defects | Grade |');
  L.push('|---|---|---:|---:|---:|---|:--:|:--:|');
  for (const r of probed) {
    const s = r.signals;
    const sc = scoreOf(r);
    const d = sc?.defects;
    const dcell = d ? `${d.count}${d.major ? ` (${d.major} maj)` : ''}` : '—';
    const capped = (sc?.caps_applied || []).length ? ' †' : '';
    L.push(`| ${r.server.registry_name} | \`${r.server.npm_package}@${r.server.pinned_version}\` | ${s.tool_count} | ${fmt(s.tool_definition_tokens)} | ${fmt(s.tokens_per_tool_median)} | \`${s.heaviest_tool ?? '—'}\` | ${dcell} | ${sc?.grade ?? '—'}${capped} |`);
  }
  L.push('');
  const cappedRows = probed.filter((r) => (scoreOf(r)?.caps_applied || []).length);
  if (cappedRows.length) {
    L.push('† Grade capped by token cost. A weighted mean lets one bad dimension be washed out by five good');
    L.push('ones, which is how a server charging six figures of context tokens graded C on the first rubric.');
    L.push(`From \`${rubricKey}\`, token cost sets a ceiling instead of contributing a share:`);
    L.push('');
    L.push('| Server | Uncapped | Capped to | Rule | Measured |');
    L.push('|---|:--:|:--:|---|---:|');
    for (const r of cappedRows) {
      const sc = scoreOf(r);
      const worst = sc.caps_applied.reduce((a, b) => (['A', 'B', 'C', 'D', 'F'].indexOf(b.max_grade) > ['A', 'B', 'C', 'D', 'F'].indexOf(a.max_grade) ? b : a));
      L.push(`| ${r.server.registry_name} | ${sc.uncapped_grade} | ${sc.grade} | ${worst.label} | ${fmt(worst.value)} |`);
    }
    L.push('');
  }

  const failed = recs.filter((r) => r.status !== 'probed');
  if (failed.length) {
    L.push('## Did not run');
    L.push('');
    L.push('| Server | npm | Status | Detail |');
    L.push('|---|---|---|---|');
    for (const r of failed) {
      const d = (r.install?.error || r.session_error || r.detail?.reason || r.error || '').toString().replace(/\s+/g, ' ').slice(0, 140);
      L.push(`| ${r.server.registry_name} | \`${r.server.npm_package}@${r.server.pinned_version}\` | ${r.status} | ${d} |`);
    }
    L.push('');
    L.push(`**${failed.length} of ${recs.length} could not be measured at all.** A server that will not install or`);
    L.push('will not answer `tools/list` under a clean environment is a finding, not a gap in the data —');
    L.push('but only once the cause is attributed. The split:');
    L.push('');
    const byClass = {};
    for (const r of failed) {
      // Re-derived at render time against the current taxonomy, so improved patterns apply to
      // history without the append-only log ever being rewritten.
      const fc = r.status === 'install_failed'
        ? { id: 'install_failed', attribution: 'unknown', label: 'npm install did not complete' }
        : r.status === 'harness_error'
        ? { id: 'harness_error', attribution: 'harness', label: 'The harness itself threw before the server could be judged' }
        : r.status === 'entry_unresolved'
        ? { id: 'entry_unresolved', attribution: 'server', label: 'Package declares no runnable entrypoint' }
        : classifyFailure(r.stderr?.sample, r.session_error || r.error);
      const k = `${fc.attribution}|${fc.id}|${fc.label}`;
      (byClass[k] ??= []).push(r.server.npm_package);
    }
    L.push('| Attribution | Cause | Count | Servers |');
    L.push('|---|---|---:|---|');
    for (const [k, v] of Object.entries(byClass).sort((a, b) => b[1].length - a[1].length)) {
      const [attr, , label] = k.split('|');
      L.push(`| **${attr}** | ${label} | ${v.length} | ${v.map((x) => `\`${x}\``).join(', ')} |`);
    }
    L.push('');
    L.push("`harness` rows are caused by this harness's own choices and must not be reported as defects");
    L.push('of the server. `environment` rows are the host or the network, not either side.');
    L.push('');
    L.push(`Classified at render time against \`${FAILURE_SPEC}\`.`);
    L.push('');
  }

  // Grades
  const grades = {};
  for (const r of probed) {
    const g = scoreOf(r)?.grade ?? '—';
    grades[g] = (grades[g] || 0) + 1;
  }
  L.push('## Grade distribution');
  L.push('');
  L.push('| Grade | Count |');
  L.push('|---|---:|');
  for (const g of ['A', 'B', 'C', 'D', 'F']) if (grades[g]) L.push(`| ${g} | ${grades[g]} |`);
  L.push('');

  // Defects. Counted, never summed into the score, so a disagreement between the count and the
  // grade stays visible rather than being averaged away.
  const withDefects = probed.map((r) => ({ r, d: scoreOf(r)?.defects })).filter((x) => x.d);
  if (withDefects.length) {
    const counts = withDefects.map((x) => x.d.count).sort((a, b) => a - b);
    const any = withDefects.filter((x) => x.d.count > 0).length;
    const anyMajor = withDefects.filter((x) => x.d.major > 0).length;
    L.push('## Defect count');
    L.push('');
    L.push(`A grade is a summary, and summaries launder. Alongside it, ${rubric.scoring.defects.rules.length} deterministic predicates over`);
    L.push('the same signals, each one a condition a reviewer would file as an issue:');
    L.push('');
    L.push('| | |');
    L.push('|---|---:|');
    L.push(`| Servers with at least one defect | **${any} of ${withDefects.length}** (${((any / withDefects.length) * 100).toFixed(0)}%) |`);
    L.push(`| Servers with at least one major defect | ${anyMajor} of ${withDefects.length} |`);
    L.push(`| Median defects per server | ${counts[Math.floor(counts.length / 2)]} |`);
    L.push(`| Worst | ${counts[counts.length - 1]} |`);
    L.push(`| Clean | ${withDefects.length - any} |`);
    L.push('');
    L.push('**This is a floor, not a total.** These rules cover only what a black-box probe can observe');
    L.push('without credentials: nothing about output correctness, runtime behaviour, or anything behind');
    L.push('an auth wall. A server with zero defects here is one this instrument found nothing wrong with,');
    L.push('which is a narrower claim than a clean bill of health.');
    L.push('');

    const tally = {};
    for (const x of withDefects) for (const id of x.d.ids) tally[id] = (tally[id] || 0) + 1;
    const byId = Object.fromEntries(rubric.scoring.defects.rules.map((x) => [x.id, x]));
    L.push('### Most common defects in this cohort');
    L.push('');
    L.push('| Servers | Severity | Defect |');
    L.push('|---:|:--:|---|');
    for (const [id, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
      L.push(`| ${n} | ${byId[id]?.severity ?? '—'} | ${byId[id]?.label ?? id} |`);
    }
    L.push('');
    const never = rubric.scoring.defects.rules.filter((x) => !tally[x.id]);
    if (never.length) {
      L.push(`${never.length} of the ${rubric.scoring.defects.rules.length} rules did not fire on any server in this cohort: `
        + never.map((x) => `\`${x.id}\``).join(', ') + '.');
      L.push('');
    }
  }

  // Dimension means
  L.push('## Where the cohort is weak');
  L.push('');
  L.push('| Dimension | Weight | Mean score (1-5) |');
  L.push('|---|---:|---:|');
  for (const d of rubric.dimensions) {
    const vals = probed.map((r) => scoreOf(r)?.dimension_scores?.[d.id]).filter((v) => typeof v === 'number');
    const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    L.push(`| ${d.label} | ${d.weight} | ${mean === null ? '—' : mean.toFixed(2)} |`);
  }
  L.push('');

  // Fault checks
  const faultTally = {};
  for (const r of recs) {
    for (const [k, v] of Object.entries(r.fault_checks || {})) {
      faultTally[k] ??= { pass: 0, fail: 0, unknown: 0, 'not-reached': 0 };
      faultTally[k][v]++;
    }
  }
  L.push('## Fault taxonomy coverage');
  L.push('');
  L.push(`Against *${rubric.fault_taxonomy.source.paper}* (arXiv ${rubric.fault_taxonomy.source.arxiv}), ${rubric.fault_taxonomy.source.structure}.`);
  L.push('This harness observes the server-side types only; host-side types are out of scope for a server probe.');
  L.push('');
  L.push('| Fault type | Pass | Fail | Unknown / not reached |');
  L.push('|---|---:|---:|---:|');
  for (const [k, v] of Object.entries(faultTally)) {
    L.push(`| ${k} | ${v.pass} | ${v.fail} | ${v.unknown + v['not-reached']} |`);
  }
  L.push('');

  // Injection + collisions
  const inj = probed.filter((r) => (r.signals.imperative_directive_hits || 0) > 0 || (r.signals.invisible_char_hits || 0) > 0);
  L.push('## Prompt-injection surface');
  L.push('');
  if (!inj.length) L.push('No directive text or invisible characters found in any tool description in this cohort.');
  else {
    L.push('| Server | Directive hits | Invisible chars | Example |');
    L.push('|---|---:|---:|---|');
    for (const r of inj) {
      const ex = (r.signals.injection_examples || [])[0];
      L.push(`| ${r.server.registry_name} | ${r.signals.imperative_directive_hits} | ${r.signals.invisible_char_hits} | ${ex ? `\`${ex.tool}\`: ${ex.excerpt.replace(/\|/g, '\\|').slice(0, 90)}` : '—'} |`);
    }
  }
  L.push('');

  const coll = probed.filter((r) => (r.signals.cohort_collision_count || 0) > 0)
    .sort((a, b) => b.signals.cohort_collision_count - a.signals.cohort_collision_count);
  L.push('## Tool-name collisions inside the cohort');
  L.push('');
  if (!coll.length) L.push('No tool name in this cohort is exposed by more than one server.');
  else {
    L.push('| Server | Colliding names | Examples |');
    L.push('|---|---:|---|');
    for (const r of coll) L.push(`| ${r.server.registry_name} | ${r.signals.cohort_collision_count} | ${(r.signals.collision_examples || []).map((n) => `\`${n}\``).join(', ')} |`);
  }
  L.push('');

  // Which handshake each server answered. Recorded per server from harness 0.1.4 on, so the
  // index doubles as the running record of who migrated to the 2026-07-28 stateless core and when.
  const eraOf = (r) => r.handshake?.answered || null;
  const withEra = recs.filter((r) => eraOf(r));
  if (withEra.length) {
    const modern = withEra.filter((r) => eraOf(r) === 'modern');
    const legacy = withEra.filter((r) => eraOf(r) === 'legacy');
    // 'none' has two very different meanings and must never be reported as one number. A server
    // that answers JSON-RPC while implementing neither handshake is a protocol defect. A server
    // that refuses to start without credentials never got far enough to be asked, and some of
    // those failures are the harness's own doing. Collapsing them would report servers as
    // protocol-broken on the strength of a missing API key.
    const neither = withEra.filter((r) => r.failure_class?.id === 'no_handshake_response');
    const notAsked = withEra.filter((r) => eraOf(r) === 'none' && r.failure_class?.id !== 'no_handshake_response');
    L.push('## Protocol era');
    L.push('');
    L.push('The 2026-07-28 specification retired the `initialize` handshake and replaced it with per-request');
    L.push('metadata and a mandatory `server/discover` RPC. This harness probes `server/discover` first and falls');
    L.push('back to `initialize`, which is the order the specification gives for stdio, and records which one');
    L.push('answered. A server that has migrated is therefore measured rather than recorded as a failure.');
    L.push('');
    L.push('| Handshake answered | Servers |');
    L.push('|---|---:|');
    L.push(`| \`server/discover\` (2026-07-28 and later) | **${modern.length}** |`);
    L.push(`| \`initialize\` (2025-11-25 and earlier) | **${legacy.length}** |`);
    L.push(`| neither, while answering JSON-RPC | **${neither.length}** |`);
    L.push(`| did not start, so was never asked | **${notAsked.length}** |`);
    L.push('');
    if (notAsked.length) {
      L.push(`The last row is not a protocol finding. Those ${notAsked.length} servers failed before any handshake could`);
      L.push('complete — most refuse to start without live credentials or deployment details — and they are broken');
      L.push('out by owner under **Did not run** above. Counting them as protocol failures would report a server as');
      L.push('broken on the strength of a missing API key.');
      L.push('');
    }
    if (modern.length) {
      L.push('Migrated:');
      L.push('');
      for (const r of modern) L.push(`- \`${r.server.npm_package}@${r.server.pinned_version}\` — ${r.handshake.negotiated_version || 'version not reported'}`);
      L.push('');
    } else {
      L.push(`No server in this cohort had migrated when it was measured. The cohort is pinned to versions`);
      L.push('published before the specification was released, so this is a dated observation and not a');
      L.push('prediction: it is the baseline the next sweep is compared against.');
      L.push('');
    }
    if (neither.length) {
      L.push('Answered neither handshake while speaking JSON-RPC — unreachable by a conforming client of either era:');
      L.push('');
      for (const r of neither) L.push(`- \`${r.server.npm_package}@${r.server.pinned_version}\``);
      L.push('');
    }
  }

  if (repro) {
    L.push('## Reproducibility');
    L.push('');
    L.push(`\`${repro.run_a}\` vs \`${repro.run_b}\` on metric \`${repro.metric}\`:`);
    L.push('');
    L.push(`- stable (0% delta): **${repro.counts.stable}**`);
    L.push(`- tolerable (<= ${repro.gate.tolerable_if_delta_pct_lte}%): **${repro.counts.tolerable}**`);
    L.push(`- unstable: **${repro.counts.unstable}**`);
    L.push(`- status flips between runs: **${repro.counts.status_changed}**`);
    L.push(`- share stable or tolerable: **${(repro.stable_or_tolerable_share * 100).toFixed(2)}%** against a ${(repro.gate.cohort_pass_if_stable_or_tolerable_share_gte * 100).toFixed(0)}% gate`);
    L.push('');
    L.push(`**Verdict: ${repro.verdict}**`);
    L.push('');
    if (repro.unstable_servers.length) {
      L.push('Unstable servers:');
      L.push('');
      L.push('| Server | Run A | Run B | Delta | Tools A→B |');
      L.push('|---|---:|---:|---:|---|');
      for (const u of repro.unstable_servers) L.push(`| \`${u.package}\` | ${fmt(u.a)} | ${fmt(u.b)} | ${u.delta_pct}% | ${u.tool_count_a}→${u.tool_count_b} |`);
      L.push('');
    }
  }

  L.push('## Method, in one paragraph');
  L.push('');
  L.push(`Each server is installed from npm at a version pinned in \`data/cohort-${H.cohort_id}.json\`, into its own empty prefix,`);
  L.push('with `--ignore-scripts`. It is launched under a scrubbed environment with canary placeholders in every declared');
  L.push('credential slot, over stdio, by the official MCP client SDKs — both eras of them. The harness probes');
  L.push('`server/discover` and falls back to `initialize`, records which answered, paginates `tools/list`,');
  L.push('repeats the list in-session, reads `prompts/list` and `resources/list` where advertised, then makes deliberately');
  L.push('malformed calls against up to three read-only tools chosen by sorted name. A second cold session repeats the');
  L.push('measurement. Nothing is scored by a model: every number is a count or a ratio, so two runs of unchanged servers');
  L.push('must agree, and where they do not, the server is named.');
  L.push('');
  L.push('### Limits, stated plainly');
  L.push('');
  for (const x of rubric.explicitly_not_measured) L.push(`- ${x}`);
  L.push(`- ${H.sandbox_model.note}`);
  L.push('');

  const out = path.join(ROOT, 'docs', `index-${H.cohort_id}.md`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, L.join('\n'));
  console.log(`report -> ${out}`);
}

main();
