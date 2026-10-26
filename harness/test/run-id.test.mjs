// Run-id tests.
//
// Why: every reader of the log groups records by run_id. Two runs sharing an id are read as one
// run, and the comparator once compared such a run with itself and said GO. Ids must be unique
// within a log, and making them unique must not change any id already in it.
//
// Run: npm test
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, runId, readJSONL } from '../src/lib.js';

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

const CFG = '7936eadf' + '0'.repeat(56);
const STAMP = '2026-08-13T02:08:34.891Z';

console.log('run id\n');

test('the format is unchanged when nothing collides', () => {
  assert.equal(runId(STAMP, CFG), 'run-2026-08-13-0208-7936eadf');
  assert.equal(runId(STAMP, CFG, new Set(['run-2026-08-13-0207-7936eadf'])), 'run-2026-08-13-0208-7936eadf');
});

test('a second run in the same minute gets its own id', () => {
  const taken = new Set(['run-2026-08-13-0208-7936eadf']);
  assert.equal(runId('2026-08-13T02:08:59.000Z', CFG, taken), 'run-2026-08-13-0208-7936eadf-2');
  taken.add('run-2026-08-13-0208-7936eadf-2');
  assert.equal(runId('2026-08-13T02:08:59.500Z', CFG, taken), 'run-2026-08-13-0208-7936eadf-3');
});

test('a different config in the same minute needs no suffix', () => {
  const taken = new Set(['run-2026-08-13-0208-7936eadf']);
  assert.equal(runId(STAMP, 'a2e3f42d' + '0'.repeat(56), taken), 'run-2026-08-13-0208-a2e3f42d');
});

// The logs sit beside the harness source in the working tree, and one level up in the published
// repository. Every header must regenerate its own id from its stamp, its hash and the ids
// before it; if one did not, the change would have renamed a run that is already evidence.
const logDir = [path.join(ROOT, 'results'), path.join(ROOT, '..', 'results')].find((d) => fs.existsSync(path.join(d, 'runs.jsonl')));
if (!logDir) {
  console.log('  skip no measurement log found next to the harness; existing ids not checked');
} else {
  for (const log of ['runs.jsonl', 'remote-runs.jsonl']) {
    const p = path.join(logDir, log);
    if (!fs.existsSync(p)) continue;
    test(`every id already in ${log} is what runId gives it`, () => {
      const taken = new Set();
      for (const h of readJSONL(p).filter((r) => r.record_type === 'run')) {
        assert.equal(runId(h.started_at, h.config_hash, taken), h.run_id, `header ${h.run_id}`);
        taken.add(h.run_id);
      }
      assert.ok(taken.size > 0);
    });
  }
}

const failed = results.filter(([ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
