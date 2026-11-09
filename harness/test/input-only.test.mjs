// Rubric 1.2.0 grades on input-only definitions. Checks the probe's input-only figures, that an
// output schema moves the advertised figure but not the grade basis, and that a record made before
// the input-only signals existed is refused rather than scored with a dimension missing.
import assert from 'node:assert/strict';
import path from 'node:path';
import { ROOT, readJSON } from '../src/lib.js';
import { tokenizeTools } from '../src/probe.js';
import { scoreServer } from '../src/score.js';

const rubric = readJSON(path.join(ROOT, 'rubric', 'rubric-v1.2.0.json'));

const bare = { name: 'get_item', description: 'Fetch one item by id.', inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Item id' } }, required: ['id'] } };
const big = { type: 'object', properties: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`field_${i}`, { type: 'string', description: `Output field number ${i}` }])) };
const withOut = { ...bare, outputSchema: big };

const a = tokenizeTools([bare]);
const b = tokenizeTools([withOut]);
assert.equal(a.tool_definition_tokens, a.tool_definition_tokens_input_only, 'no outputSchema: both figures equal');
assert.equal(b.tool_definition_tokens_input_only, a.tool_definition_tokens_input_only, 'outputSchema does not move the input-only figure');
assert.ok(b.tool_definition_tokens > a.tool_definition_tokens, 'outputSchema moves the advertised figure');
assert.equal(b.output_schema_tool_count, 1);
assert.equal(b.per_tool[0].input_tokens, a.per_tool[0].tokens);
assert.equal(b.tokens_per_tool_median_input_only, a.tokens_per_tool_median);

// Advertised figure past the 25k cap, input-only under 10k: 1.2.0 must not cap the grade.
const signals = {
  tool_definition_tokens: 30000, tool_definition_tokens_input_only: 900,
  tokens_per_tool_median: 3000, tokens_per_tool_median_input_only: 90,
  context_injection_tokens_total: 30000, advertised_surface_tokens_input_only: 900,
  tool_count: 10, pct_tools_with_description: 1, pct_params_with_description: 1,
  pct_tools_with_valid_object_schema: 1, pct_tools_with_untyped_params: 0, mean_description_chars: 120,
  pct_tools_generic_name: 0, pct_tools_namespaced: 1, cohort_collision_count: null,
  imperative_directive_hits: 0, invisible_char_hits: 0, embedded_url_hits: 0, instructions_directive_hits: 0,
  secrets_via_argv: null, canary_leaked: false, starts_without_credentials: true, declared_secret_count: null,
};
const s = scoreServer(signals, rubric);
assert.deepEqual(s.caps_applied, [], 'no cap fires on the advertised figure alone');
assert.ok(!s.defects.ids.includes('tool_defs_over_10k'));
assert.ok(!s.defects.ids.includes('advertised_surface_over_12k'));

// Input-only over 25k: the D cap still fires.
const heavy = scoreServer({ ...signals, tool_definition_tokens_input_only: 26000, advertised_surface_tokens_input_only: 26000 }, rubric);
assert.equal(heavy.grade, 'D');

// A 0.1.6 record has no input-only keys: refused, not graded.
const old = { ...signals };
delete old.tool_definition_tokens_input_only;
delete old.tokens_per_tool_median_input_only;
delete old.advertised_surface_tokens_input_only;
assert.throws(() => scoreServer(old, rubric), /requires signals this record does not carry/);

// 1.1.1 is untouched: it still scores the advertised figure and has no requirement.
const r111 = readJSON(path.join(ROOT, 'rubric', 'rubric-v1.1.1.json'));
assert.equal(scoreServer(old, r111).grade, 'D', '1.1.1 still caps on the advertised figure');

console.log('input-only: ok');
