// Re-score history under a different rubric, without re-probing anything.
//
// This is the payoff of keeping the rubric as a versioned file and the results as an append-only
// log: a scoring change is a re-read, not a re-measurement. Signals are raw measurements and never
// change; only their interpretation does. So the whole history can be graded again in seconds.
//
// Scores go to results/scores.jsonl, NOT into runs.jsonl. A re-score is not a run: it produces no
// new measurement, it shares no config hash, and it must never be comparable to one in the
// reproducibility log. runs.jsonl stays the record of what was measured; scores.jsonl records what
// a given rubric made of it. Both are append-only.
import path from 'node:path';
import { ROOT, readJSON, readJSONL, appendJSONL, nowISO, HARNESS_VERSION } from './lib.js';
import { scoreServer, cohortCollisions } from './score.js';

const RESULTS = path.join(ROOT, 'results', 'runs.jsonl');
const SCORES = path.join(ROOT, 'results', 'scores.jsonl');
const RUBRIC = process.env.RUBRIC || 'rubric-v1.1.1.json';
const ONLY_RUN = process.env.RUN_ID || null;
const FORCE = process.env.FORCE === '1';

function main() {
  const rubric = readJSON(path.join(ROOT, 'rubric', RUBRIC));
  const rubricKey = `${rubric.rubric_id}@${rubric.version}`;
  const all = readJSONL(RESULTS);
  const headers = all.filter((r) => r.record_type === 'run');
  const existing = new Set(
    readJSONL(SCORES).filter((r) => r.record_type === 'scoring_run').map((r) => `${r.run_id}|${r.rubric}`)
  );

  const targets = ONLY_RUN ? headers.filter((h) => h.run_id === ONLY_RUN) : headers;
  if (!targets.length) throw new Error(ONLY_RUN ? `no run ${ONLY_RUN}` : 'no runs in the log');

  console.log(`rescore under ${rubricKey}  runs=${targets.length}`);
  let written = 0;

  for (const H of targets) {
    const key = `${H.run_id}|${rubricKey}`;
    if (existing.has(key) && !FORCE) {
      console.log(`  ${H.run_id}  already scored under ${rubricKey}, skipping (FORCE=1 to repeat)`);
      continue;
    }

    const recs = all.filter((r) => r.record_type === 'server' && r.run_id === H.run_id);
    const probed = recs.filter((r) => r.status === 'probed');
    if (!probed.length) {
      console.log(`  ${H.run_id}  nothing probed, skipping`);
      continue;
    }

    // Recomputed rather than read back, so a re-score depends on the raw tool names in the log
    // and not on whatever a past harness version happened to store alongside them.
    const collisions = cohortCollisions(probed);

    const rows = [];
    const shifts = { same: 0, up: 0, down: 0 };
    const gradeCounts = {};

    for (const r of probed) {
      const signals = { ...r.signals, ...(collisions.get(r.server.registry_name) || {}) };
      const score = scoreServer(signals, rubric);
      const before = r.score?.grade ?? null;
      const order = ['A', 'B', 'C', 'D', 'F'];
      if (before === null || before === score.grade) shifts.same++;
      else if (order.indexOf(score.grade) > order.indexOf(before)) shifts.down++;
      else shifts.up++;
      gradeCounts[score.grade] = (gradeCounts[score.grade] || 0) + 1;

      rows.push({
        record_type: 'scoring',
        run_id: H.run_id,
        rubric: rubricKey,
        registry_name: r.server.registry_name,
        npm_package: r.server.npm_package,
        pinned_version: r.server.pinned_version,
        grade_before: before,
        rubric_before: H.rubric,
        score,
      });
    }

    const defectCounts = rows.map((x) => x.score.defects?.count ?? 0);
    const header = {
      record_type: 'scoring_run',
      run_id: H.run_id,
      rubric: rubricKey,
      rescored_at: nowISO(),
      harness_version: HARNESS_VERSION,
      source_rubric: H.rubric,
      source_config_hash: H.config_hash,
      cohort_id: H.cohort_id,
      note: 'Interpretation only. No measurement was repeated; every signal comes from the run named above.',
      counts: {
        servers_scored: rows.length,
        grades: gradeCounts,
        grade_shift_vs_source: shifts,
        capped: rows.filter((x) => (x.score.caps_applied || []).length > 0).length,
        with_at_least_one_defect: defectCounts.filter((n) => n > 0).length,
        defects_total: defectCounts.reduce((a, b) => a + b, 0),
        defects_median: defectCounts.length
          ? [...defectCounts].sort((a, b) => a - b)[Math.floor(defectCounts.length / 2)]
          : null,
      },
    };

    appendJSONL(SCORES, [header, ...rows]);
    written += rows.length + 1;
    console.log(
      `  ${H.run_id}  ${rows.length} servers  grades ${JSON.stringify(gradeCounts)}  ` +
      `capped ${header.counts.capped}  defective ${header.counts.with_at_least_one_defect}/${rows.length}  ` +
      `shift ${JSON.stringify(shifts)}`
    );
  }

  console.log(written ? `\nappended ${written} records to results/scores.jsonl` : '\nnothing to do');
}

main();
