// Dependency-tree tests, run against node_modules trees built in a temp directory.
//
// Why: the tree hash is what tells dependency drift apart from a server change. It has to move
// when any installed version moves, and it must not move when npm merely lays the same packages
// out differently, or every hoisting change would be reported as drift.
//
// Run: npm test
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dependencyTree, directDependencies, dependencyResolution } from '../src/sandbox.js';

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push([true, name]);
    console.log(`  ok   ${name}`);
  } catch (e) {
    results.push([false, name]);
    console.log(`  FAIL ${name}\n       ${e.message.split('\n')[0]}`);
  }
}

// files: { 'relative/dir': {name, version, ...} } -> a sandbox prefix with those package.jsons.
const made = [];
function tree(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deptree-'));
  made.push(dir);
  for (const [rel, pkg] of Object.entries(files)) {
    fs.mkdirSync(path.join(dir, rel), { recursive: true });
    fs.writeFileSync(path.join(dir, rel, 'package.json'), JSON.stringify(pkg));
  }
  return dir;
}

const SERVER = { npm_package: '@acme/mcp' };
const server = { name: '@acme/mcp', version: '1.0.0', dependencies: { zod: '^4.3.6', '@modelcontextprotocol/sdk': '^1.27.1' } };

console.log('dependency tree\n');

test('every package is recorded, scoped and nested included; dot-directories are not', () => {
  const dir = tree({
    'node_modules/@acme/mcp': server,
    'node_modules/zod': { name: 'zod', version: '4.4.0' },
    'node_modules/@modelcontextprotocol/sdk': { name: '@modelcontextprotocol/sdk', version: '1.30.0' },
    'node_modules/@modelcontextprotocol/sdk/node_modules/zod': { name: 'zod', version: '3.25.0' },
    'node_modules/.bin/whatever': { name: 'not-a-package', version: '0.0.0' },
  });
  const t = dependencyTree(dir);
  assert.deepEqual(t.packages, ['@acme/mcp@1.0.0', '@modelcontextprotocol/sdk@1.30.0', 'zod@3.25.0', 'zod@4.4.0']);
  assert.equal(t.count, 4);
  assert.match(t.hash, /^[0-9a-f]{64}$/);
});

test('a different hoisting of the same versions is not drift', () => {
  const hoisted = tree({
    'node_modules/@acme/mcp': server,
    'node_modules/zod': { name: 'zod', version: '4.4.0' },
    'node_modules/@modelcontextprotocol/sdk': { name: '@modelcontextprotocol/sdk', version: '1.30.0' },
  });
  const nested = tree({
    'node_modules/@acme/mcp': server,
    'node_modules/@acme/mcp/node_modules/zod': { name: 'zod', version: '4.4.0' },
    'node_modules/@modelcontextprotocol/sdk': { name: '@modelcontextprotocol/sdk', version: '1.30.0' },
  });
  assert.equal(dependencyTree(hoisted).hash, dependencyTree(nested).hash);
});

test('one transitive version moving moves the hash', () => {
  const august = tree({ 'node_modules/@acme/mcp': server, 'node_modules/zod': { name: 'zod', version: '4.4.0' } });
  const october = tree({ 'node_modules/@acme/mcp': server, 'node_modules/zod': { name: 'zod', version: '4.6.7' } });
  assert.notEqual(dependencyTree(august).hash, dependencyTree(october).hash);
});

test('an aliased install is recorded under both names', () => {
  const dir = tree({ 'node_modules/zod-v3': { name: 'zod', version: '3.25.0' } });
  assert.deepEqual(dependencyTree(dir).packages, ['zod-v3=zod@3.25.0']);
});

test('direct dependencies resolve the way node resolves them: nearest first', () => {
  const dir = tree({
    'node_modules/@acme/mcp': server,
    'node_modules/@acme/mcp/node_modules/zod': { name: 'zod', version: '4.6.7' },
    'node_modules/zod': { name: 'zod', version: '3.25.0' },
  });
  assert.deepEqual(directDependencies(SERVER, dir), {
    '@modelcontextprotocol/sdk': { declared: '^1.27.1', resolved: null },
    zod: { declared: '^4.3.6', resolved: '4.6.7' },
  });
});

test('resolution defaults to the moment the cohort was pinned', () => {
  const cohort = { built_at: '2026-08-11T02:17:26.746Z' };
  assert.deepEqual(dependencyResolution(cohort, undefined), { policy: 'as-of', before: '2026-08-11T02:17:26.746Z' });
  assert.deepEqual(dependencyResolution(cohort, 'float'), { policy: 'float', before: null });
  // Normalised, so two spellings of one instant cannot produce two config hashes.
  assert.deepEqual(dependencyResolution(cohort, '2026-08-13T02:08:34.891+00:00'), { policy: 'as-of', before: '2026-08-13T02:08:34.891Z' });
  assert.throws(() => dependencyResolution(cohort, 'last tuesday'));
});

for (const d of made) fs.rmSync(d, { recursive: true, force: true });
const failed = results.filter(([ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
