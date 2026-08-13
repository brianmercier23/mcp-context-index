// Turn one probe session into the flat signal set the rubric scores.
// Pure function of the session output: no network, no clock, no randomness.
import { countTokens } from './lib.js';

const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u206A-\u206F\uFEFF]|[\u{E0000}-\u{E007F}]/u;  // zero-width, bidi override, invisible operators, and the Unicode tag plane
const URL_RE = /https?:\/\/[^\s"'<>)]+/gi;

function descOf(t) { return String(t.description ?? ''); }

function schemaSignals(tools) {
  if (!tools.length) return null;
  let withDesc = 0, validObj = 0, untyped = 0;
  let paramTotal = 0, paramDescribed = 0;
  const descLens = [];

  for (const t of tools) {
    const d = descOf(t).trim();
    if (d) withDesc++;
    descLens.push(d.length);

    const s = t.inputSchema || {};
    const props = s.properties || {};
    const keys = Object.keys(props);
    const isObj = s.type === 'object' || (!s.type && keys.length > 0);
    if (isObj || (s.type === 'object' && keys.length === 0)) validObj++;

    let hasUntyped = false;
    for (const k of keys) {
      paramTotal++;
      const p = props[k] || {};
      if (String(p.description ?? '').trim()) paramDescribed++;
      const bare = !p.type && !p.enum && !p.oneOf && !p.anyOf && !p.$ref && !p.const;
      const shapeless = (p.type === 'object' && !p.properties && p.additionalProperties !== false) ||
                        (p.type === 'array' && !p.items);
      if (bare || shapeless) hasUntyped = true;
    }
    if (hasUntyped) untyped++;
  }

  return {
    pct_tools_with_description: withDesc / tools.length,
    pct_params_with_description: paramTotal ? paramDescribed / paramTotal : 1,
    pct_tools_with_valid_object_schema: validObj / tools.length,
    pct_tools_with_untyped_params: untyped / tools.length,
    mean_description_chars: descLens.reduce((a, b) => a + b, 0) / descLens.length,
    param_count_total: paramTotal,
  };
}

function collisionSignals(tools, rubric) {
  if (!tools.length) return null;
  const generic = new Set(rubric.generic_name_corpus.map((s) => s.toLowerCase()));
  let g = 0, ns = 0;
  for (const t of tools) {
    const n = String(t.name || '').toLowerCase();
    if (generic.has(n)) g++;
    // A namespaced name carries a stable server-specific first segment.
    const parts = n.split(/[_.:-]/).filter(Boolean);
    if (parts.length >= 3 || (parts.length === 2 && !generic.has(parts[0]))) ns++;
  }
  return {
    pct_tools_generic_name: g / tools.length,
    pct_tools_namespaced: ns / tools.length,
    tool_names: tools.map((t) => String(t.name)),
  };
}

function injectionSignals(tools, instructions, rubric) {
  const pats = rubric.injection_directive_patterns.map((p) => new RegExp(p, 'i'));
  let directive = 0, invisible = 0, urls = 0;
  const examples = [];

  for (const t of tools) {
    const d = descOf(t);
    const hit = pats.find((p) => p.test(d));
    if (hit) { directive++; if (examples.length < 3) examples.push({ tool: t.name, pattern: hit.source, excerpt: d.slice(0, 200) }); }
    if (INVISIBLE.test(d)) invisible++;
    urls += (d.match(URL_RE) || []).length;
  }

  const instr = String(instructions || '');
  const instrHits = pats.filter((p) => p.test(instr)).length;
  if (INVISIBLE.test(instr)) invisible++;

  return {
    imperative_directive_hits: directive,
    invisible_char_hits: invisible,
    embedded_url_hits: urls,
    instructions_directive_hits: instrHits,
    injection_examples: examples,
  };
}

function errorSignals(probes) {
  if (!probes || !probes.length) return null;
  const n = probes.length;
  return {
    pct_errors_structured: probes.filter((p) => p.structured).length / n,
    pct_errors_naming_param: probes.filter((p) => p.names_param).length / n,
    pct_errors_raw_stacktrace: probes.filter((p) => p.has_stacktrace).length / n,
    mean_error_tokens: probes.reduce((a, p) => a + (p.tokens || 0), 0) / n,
    pct_errors_accepted_bad_input: probes.filter((p) => p.outcome === 'accepted').length / n,
    pct_errors_timeout: probes.filter((p) => p.outcome === 'timeout').length / n,
    pct_errors_leaking_path: probes.filter((p) => p.leaks_path).length / n,
  };
}

// Which of the paper's observable fault types this session actually exercised.
function faultChecks(sess, launch, install) {
  const tools = sess.tools || [];
  const names = tools.map((t) => String(t.name));
  const dupNames = names.length !== new Set(names).size;
  return {
    'Server Deployment': install.ok && sess.ok ? 'pass' : 'fail',
    'Server Dependency': install.ok ? 'pass' : 'fail',
    'Server Platform Incompatibility': sess.ok ? 'pass' : install.ok ? 'fail' : 'not-reached',
    'Server Logging': sess.ok ? (sess.stderr_bytes > 200000 ? 'fail' : 'pass') : 'not-reached',
    'Server Resource Synchronization': sess.same_session_list_stable === null ? 'unknown' : sess.same_session_list_stable ? 'pass' : 'fail',
    'Server Resource Handling': sess.ok ? 'pass' : 'not-reached',
    'Tool Discovery & Registration': !sess.ok ? 'not-reached' : tools.length === 0 ? 'fail' : dupNames ? 'fail' : 'pass',
    'Incorrect Tool Connection Setting': sess.ok ? 'pass' : 'fail',
    'Tool Authentication': sess.canary_leaked || sess.canary_in_stderr ? 'fail' : launch.secrets_via_argv > 0 ? 'fail' : 'pass',
    'Tool Call / Execution': (sess.error_probes || []).some((p) => p.outcome === 'timeout') ? 'fail'
      : (sess.error_probes || []).length ? 'pass' : 'unknown',
    'Tool Response Handling': (sess.error_probes || []).length
      ? ((sess.error_probes.filter((p) => p.structured).length / sess.error_probes.length) >= 0.5 ? 'pass' : 'fail')
      : 'unknown',
    'Host Connection Mismatch': sess.protocol_version ? 'pass' : 'unknown',
    Documentation: tools.length ? (tools.filter((t) => descOf(t).trim()).length / tools.length >= 0.9 ? 'pass' : 'fail') : 'unknown',
  };
}

export function analyze({ server, install, launch, sess, sess2, canary, rubric }) {
  const tools = sess.tools || [];
  const canaryLeaked = !!(sess.canary_in_stderr) ||
    (canary ? JSON.stringify(sess.error_probes || []).includes(canary) : false) ||
    (canary ? JSON.stringify(tools).includes(canary) : false);

  const signals = {
    // token_cost
    tool_definition_tokens: sess.tool_definition_tokens ?? null,
    tokens_per_tool_median: sess.tokens_per_tool_median ?? null,
    tokens_per_tool_max: sess.tokens_per_tool_max ?? null,
    context_injection_tokens_total: sess.context_injection_tokens_total ?? null,
    tool_count: sess.tool_count ?? null,
    instructions_tokens: sess.instructions_tokens ?? 0,
    heaviest_tool: sess.heaviest_tool ?? null,
    ...(schemaSignals(tools) || {}),
    ...(collisionSignals(tools, rubric) || {}),
    ...injectionSignals(tools, sess.instructions, rubric),
    ...(errorSignals(sess.error_probes) || {}),
    // auth_hygiene
    secrets_via_argv: launch.secrets_via_argv,
    declared_secret_count: launch.declared_secret_count,
    canary_leaked: canaryLeaked,
    starts_without_credentials: sess.ok === true,
  };

  // Intra-run stability: a second cold session against the same install.
  if (sess2) {
    signals.session2_tool_definition_tokens = sess2.tool_definition_tokens ?? null;
    signals.intra_run_stable = sess2.ok && sess.ok
      ? sess2.tool_definition_tokens === sess.tool_definition_tokens
      : null;
  }

  return {
    signals,
    fault_checks: faultChecks(sess, launch, install),
    per_tool_tokens: sess.per_tool || [],
  };
}
