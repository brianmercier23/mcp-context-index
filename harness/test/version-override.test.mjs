// VERSION_OVERRIDE tests, against a stub registry so nothing touches npm.
//
// Why: an override is the only way to measure a version the drift watcher found, and it changes
// what is installed. Every way it could silently measure the wrong thing has to be refused, and
// its dependency date has to be fixed by the version, not by the day the run happens.
//
// Run: npm test
import assert from 'node:assert/strict';
import { versionOverrides } from '../src/sandbox.js';

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

const cohort = {
  cohort_id: 'test-v1',
  built_at: '2026-08-11T02:17:26.746Z',
  servers: [
    { npm_package: '@smartbear/mcp', pinned_version: '0.34.0' },
    { npm_package: 'sharedoc-mcp', pinned_version: '2.1.4' },
  ],
};
const REGISTRY = {
  '@smartbear/mcp@0.40.1': '2026-10-01T12:00:00.000Z',
  'sharedoc-mcp@2.2.0': '2026-09-15T08:30:00+00:00',
};
const registry = async (pkg, ver) => REGISTRY[`${pkg}@${ver}`] ?? null;

console.log('version override\n');

await test('no override means no overrides, so a plain run is untouched', async () => {
  assert.deepEqual(await versionOverrides(cohort, undefined, undefined, registry), []);
  assert.deepEqual(await versionOverrides(cohort, '  ', undefined, registry), []);
});

await test('dependencies resolve as of an hour after each version was published', async () => {
  // Not the publish second: a sibling package from the same release, published minutes later,
  // would be excluded and npm would refuse the install.
  const o = await versionOverrides(cohort, 'sharedoc-mcp@2.2.0, @smartbear/mcp@0.40.1', undefined, registry);
  assert.deepEqual(o, [
    { npm_package: '@smartbear/mcp', pinned_version: '0.34.0', version: '0.40.1', published_at: '2026-10-01T12:00:00.000Z',
      dependencies: { policy: 'as-of', before: '2026-10-01T13:00:00.000Z', basis: 'version_published+1h' } },
    { npm_package: 'sharedoc-mcp', pinned_version: '2.1.4', version: '2.2.0', published_at: '2026-09-15T08:30:00.000Z',
      dependencies: { policy: 'as-of', before: '2026-09-15T09:30:00.000Z', basis: 'version_published+1h' } },
  ]);
});

await test('the same overrides in any order give the same list, so they hash the same', async () => {
  const a = await versionOverrides(cohort, 'sharedoc-mcp@2.2.0,@smartbear/mcp@0.40.1', undefined, registry);
  const b = await versionOverrides(cohort, '@smartbear/mcp@0.40.1,sharedoc-mcp@2.2.0', undefined, registry);
  assert.deepEqual(a, b);
});

await test('an explicit DEPS_AS_OF replaces the publish date, and float is honoured', async () => {
  const [late] = await versionOverrides(cohort, 'sharedoc-mcp@2.2.0', '2026-10-25T00:00:00Z', registry);
  assert.deepEqual(late.dependencies, { policy: 'as-of', before: '2026-10-25T00:00:00.000Z' });
  const [float] = await versionOverrides(cohort, 'sharedoc-mcp@2.2.0', 'float', registry);
  assert.deepEqual(float.dependencies, { policy: 'float', before: null });
});

await test('a DEPS_AS_OF before the version was published is refused, not left to fail in npm', async () => {
  await assert.rejects(versionOverrides(cohort, 'sharedoc-mcp@2.2.0', '2026-08-11T02:17:26.746Z', registry), /after DEPS_AS_OF/);
});

await test('anything that would measure the wrong thing is refused', async () => {
  await assert.rejects(versionOverrides(cohort, 'not-in-cohort@1.0.0', undefined, registry), /not in cohort/);
  await assert.rejects(versionOverrides(cohort, 'sharedoc-mcp@2.1.4', undefined, registry), /the pin itself/);
  await assert.rejects(versionOverrides(cohort, 'sharedoc-mcp@2.2.0,sharedoc-mcp@2.2.0', undefined, registry), /named twice/);
  await assert.rejects(versionOverrides(cohort, 'sharedoc-mcp@9.9.9', undefined, registry), /not on npm/);
  await assert.rejects(versionOverrides(cohort, 'sharedoc-mcp', undefined, registry), /package@version/);
  await assert.rejects(versionOverrides(cohort, 'sharedoc-mcp@2.2.0;rm -rf', undefined, registry), /package@version/);
});

const failed = results.filter(([ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
