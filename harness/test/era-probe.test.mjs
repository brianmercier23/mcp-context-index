// Era-probe tests, run against local fixtures rather than cohort servers.
//
// Why fixtures: on 2026-08-13 every server in dev-tooling-v1 answered `initialize`, so a sweep
// exercises the legacy path 38 times and the modern path zero times. Publishing an index whose
// modern path had never run would be a hole in the method. These fixtures close it, and the
// parity case turns "both paths produce the same signal set" from a claim into a test.
//
// Run: npm test
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectEra, session } from '../src/probe.js';
import { classifyFailure } from '../src/classify.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const launchFor = (fixture) => ({
  command: process.execPath,
  args: [path.join(HERE, 'fixtures', fixture)],
  env: { ...process.env, NODE_ENV: 'test' },
  cwd: HERE,
});

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push([true, name]);
    console.log(`  ok   ${name}`);
  } catch (e) {
    results.push([false, name]);
    console.log(`  FAIL ${name}\n       ${e.message.split('\n')[0]}`);
  }
}

console.log('era probe\n');

await test('a modern-only server is measured, not blamed', async () => {
  const launch = launchFor('modern-only.mjs');
  const era = await detectEra(launch);
  assert.equal(era.handshake, 'modern', 'server/discover should have answered');
  assert.equal(era.negotiated_version, '2026-07-28');

  const sess = await session(launch, { era: 'modern' });
  assert.equal(sess.ok, true, `modern session failed: ${sess.error}`);
  assert.equal(sess.tool_count, 1);
  assert.ok(sess.tool_definition_tokens > 0);
});

await test('a legacy server still answers initialize', async () => {
  const launch = launchFor('legacy-only.mjs');
  const era = await detectEra(launch);
  assert.equal(era.handshake, null, 'a 2025 server must not report a modern handshake');

  const sess = await session(launch, { era: 'legacy' });
  assert.equal(sess.ok, true, `legacy session failed: ${sess.error}`);
  assert.equal(sess.tool_count, 1);
});

await test('both eras measure the same server identically', async () => {
  // One server, one tool registration, reached both ways. A difference here would mean the
  // measurement depends on which client connected, which would make the index incomparable
  // to itself the moment the cohort starts migrating.
  const launch = launchFor('dual-era.mjs');

  const era = await detectEra(launch);
  assert.equal(era.handshake, 'modern', 'a dual-era server should answer server/discover');

  const modern = await session(launch, { era: 'modern' });
  const legacy = await session(launch, { era: 'legacy' });
  assert.equal(modern.ok, true, `modern session failed: ${modern.error}`);
  assert.equal(legacy.ok, true, `legacy session failed: ${legacy.error}`);

  assert.equal(modern.tool_count, legacy.tool_count);
  assert.equal(
    modern.tool_definition_tokens,
    legacy.tool_definition_tokens,
    `token parity broken: modern ${modern.tool_definition_tokens} vs legacy ${legacy.tool_definition_tokens}`,
  );
  assert.equal(modern.tokens_per_tool_median, legacy.tokens_per_tool_median);
  assert.equal(modern.heaviest_tool, legacy.heaviest_tool);
});

await test('a server that answers neither handshake is attributed to the server', async () => {
  const launch = launchFor('refuses-both.mjs');
  const era = await detectEra(launch);
  assert.equal(era.handshake, null);

  const sess = await session(launch, { era: 'legacy' });
  assert.equal(sess.ok, false, 'initialize should not have succeeded');

  const handshake = { answered: 'none', discover_probe_error: era.probe_error };
  const cls = classifyFailure(sess.stderr_sample, sess.error, handshake);
  assert.equal(cls.id, 'no_handshake_response', `classified as ${cls.id}`);
  assert.equal(cls.attribution, 'server');
});

await test('a named stderr reason still outranks the handshake verdict', async () => {
  // Regression guard on ordering: a server that says why it will not start must be described by
  // that reason, not by the handshake it failed to complete.
  const cls = classifyFailure('Error: GITHUB_TOKEN is malformed (expected hex or base64)', 'timeout:connect', {
    answered: 'none',
    discover_probe_error: 'MethodNotFoundError: -32601 Method not found',
  });
  assert.equal(cls.id, 'refuses_placeholder_credentials');
});

const failed = results.filter(([ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
