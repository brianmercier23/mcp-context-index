// Assembles the public `mcp-context-index` repository from this harness.
//
// The publication is a build artifact, not a second copy to keep in sync by hand: every file it
// contains is copied or generated from the instrument, and every number in its README is read out
// of the append-only log rather than typed. Re-run it after any sweep.
//
//   node scripts/build-publication.mjs [targetDir]
//
// Default target: ../mcp-context-index (sibling of this harness). Writes nothing outside it.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HARNESS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.resolve(process.argv[2] || path.join(HARNESS, '..', 'mcp-context-index'));

const readJSONL = (p) =>
  fs.readFileSync(p, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const num = (n) => Number(n).toLocaleString('en-US');
const mkdirp = (p) => fs.mkdirSync(p, { recursive: true });

function copy(from, to) {
  const src = path.join(HARNESS, from);
  const dst = path.join(TARGET, to);
  mkdirp(path.dirname(dst));
  fs.copyFileSync(src, dst);
}

function copyDir(from, to, filter = () => true) {
  const src = path.join(HARNESS, from);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const rel = path.join(from, entry.name);
    const out = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(rel, out, filter);
    else if (filter(entry.name)) copy(rel, out);
  }
}

// ---- the numbers, read from the log ---------------------------------------

const runs = readJSONL(path.join(HARNESS, 'results', 'runs.jsonl'));
const headers = runs.filter((r) => r.record_type === 'run');
const cohortId = headers[headers.length - 1].cohort_id;
const sameCohort = headers.filter((h) => h.cohort_id === cohortId);
const widest = Math.max(...sameCohort.map((h) => h.counts.attempted));
const full = sameCohort.filter((h) => h.partial_sweep !== true && h.counts.attempted >= widest);
if (!full.length) throw new Error(`no full sweep of ${cohortId} in the log`);
const H = full[full.length - 1];

const recs = runs.filter((r) => r.record_type === 'server' && r.run_id === H.run_id);
const probed = recs.filter((r) => r.status === 'probed');
const defective = probed.filter((r) => (r.score?.defects?.count || 0) > 0);
const era = (name) => recs.filter((r) => r.handshake?.answered === name).length;
// 'none' means two different things and must not be reported as one number: a server that answers
// JSON-RPC while implementing neither handshake is a protocol defect; one that refuses to start
// without credentials never got far enough to be asked. See the same split in report.js.
const neitherCount = recs.filter((r) => r.failure_class?.id === 'no_handshake_response').length;
const notAskedCount = recs.filter(
  (r) => r.handshake?.answered === 'none' && r.failure_class?.id !== 'no_handshake_response',
).length;

const repros = readJSONL(path.join(HARNESS, 'results', 'reproducibility.jsonl'));
const latestRepro = repros[repros.length - 1];
// Consecutive GO verdicts, counted back from the most recent. The one NO-GO in the log was
// produced over an empty server set by a comparator bug and is documented in PROVENANCE.md.
let goStreak = 0;
for (let i = repros.length - 1; i >= 0 && repros[i].verdict === 'GO'; i--) goStreak++;

const spread = H.token_spread;
const values = {
  RUN_ID: H.run_id,
  CONFIG_HASH: H.config_hash.slice(0, 8),
  DATE: H.finished_at.slice(0, 10),
  INDEX_PATH: `index/${cohortId}.md`,
  PROBED: String(probed.length),
  PROBED_MINUS_ONE: String(probed.length - 1),
  ATTEMPTED: String(H.counts.attempted),
  MIN_TOK: num(spread.min),
  MAX_TOK: num(spread.max),
  RATIO: String(spread.ratio),
  TOTAL_TOK: num(spread.total_if_all_installed),
  DEFECT_SERVERS: String(defective.length),
  DEFECT_PCT: String(Math.round((defective.length / probed.length) * 100)),
  GO_COUNT: String(goStreak),
  STABLE: String(latestRepro.counts.stable),
  MEASURED_BOTH: String(latestRepro.counts.measured_in_both),
  MODERN: String(era('modern')),
  LEGACY: String(era('legacy')),
  NEITHER: String(neitherCount),
  NOT_STARTED: String(notAskedCount),
};

// ---- assemble --------------------------------------------------------------

if (fs.existsSync(TARGET)) {
  // Only ever clears directories this script owns. A .git directory, a LICENSE the user edited by
  // hand, or anything else at the root is left alone.
  for (const d of ['index', 'rubric', 'data', 'results', 'harness', 'docs']) {
    fs.rmSync(path.join(TARGET, d), { recursive: true, force: true });
  }
}
mkdirp(TARGET);

// the index itself
copy(path.join('docs', `index-${cohortId}.md`), path.join('index', `${cohortId}.md`));

// A machine-readable copy of the same index, so the numbers can be consumed without scraping a
// markdown table. The caveats travel inside the payload deliberately: a consumer who reads only
// this file should not be able to lose the fact that the cohort is not a random sample.
const scoredUnder = (() => {
  try {
    const scores = readJSONL(path.join(HARNESS, 'results', 'scores.jsonl'));
    const forRun = scores.filter((s) => s.run_id === H.run_id);
    return forRun.length ? forRun[forRun.length - 1].rubric : H.rubric;
  } catch {
    return H.rubric;
  }
})();

const indexJson = {
  index_id: cohortId,
  generated_from: {
    run_id: H.run_id,
    config_hash: H.config_hash,
    measured_at: H.finished_at,
    harness_version: H.harness_version,
    rubric_measured_under: H.rubric,
    rubric_scored_under: scoredUnder,
    tokenizer: H.tokenizer,
    cohort_selection_hash: H.cohort_selection_hash,
    mcp_clients: H.mcp_clients ?? null,
    failure_classes_spec: H.failure_classes_spec,
  },
  caveats: [
    'The cohort is ranked by npm downloads within one vertical from a dated registry snapshot. It is a sample of what a buyer plausibly has installed, not a random sample of the registry, and must never be described as representative.',
    'Defect counts are a floor, not a total: these rules see only what a black-box probe without live credentials can see. Nothing here covers output correctness, runtime behaviour, or anything behind an auth wall.',
    'Grades are an editorial reading of the signals under a named rubric and change whenever the rubric does. The signals do not change.',
    'Token counts are tokenizer-dependent. This index uses gpt-tokenizer o200k_base; a different tokenizer gives different absolute numbers and very similar ratios.',
    'Servers that could not be measured are reported with an attribution (server, harness or environment) rather than as a defect of the server.',
  ],
  totals: {
    attempted: H.counts.attempted,
    probed: probed.length,
    token_spread: H.token_spread,
    servers_with_at_least_one_defect: defective.length,
    // Raw counts as recorded by the run, then the reading of them. Both, because the raw 'none'
    // bucket mixes a protocol defect with a server that never started, and a consumer reading
    // only the raw counts would report the second as the first.
    handshakes_raw: H.handshakes ?? null,
    handshakes: {
      modern: era('modern'),
      legacy: era('legacy'),
      neither_while_speaking_jsonrpc: neitherCount,
      did_not_start_so_never_asked: notAskedCount,
      note: 'The last bucket is not a protocol finding: those servers failed before any handshake could complete, most of them because they refuse to start without live credentials or deployment details. Their causes and attributions are on each server record.',
    },
  },
  servers: recs.map((r) => ({
    registry_name: r.server.registry_name,
    npm_package: r.server.npm_package,
    pinned_version: r.server.pinned_version,
    downloads_last_week: r.server.downloads_last_week ?? null,
    status: r.status,
    handshake: r.handshake?.answered ?? null,
    protocol_version: r.handshake?.negotiated_version ?? r.protocol_version ?? null,
    failure: r.failure_class ? { id: r.failure_class.id, attribution: r.failure_class.attribution, label: r.failure_class.label } : null,
    tools: r.signals?.tool_count ?? null,
    tool_definition_tokens: r.signals?.tool_definition_tokens ?? null,
    tokens_per_tool_median: r.signals?.tokens_per_tool_median ?? null,
    tokens_per_tool_max: r.signals?.tokens_per_tool_max ?? null,
    heaviest_tool: r.signals?.heaviest_tool ?? null,
    context_injection_tokens_total: r.signals?.context_injection_tokens_total ?? null,
    grade: r.score?.grade ?? null,
    uncapped_grade: r.score?.uncapped_grade ?? null,
    caps_applied: r.score?.caps_applied ?? null,
    overall_score: r.score?.overall_score ?? null,
    defects: r.score ? { count: r.score.defects.count, major: r.score.defects.major, minor: r.score.defects.minor, ids: r.score.defects.ids } : null,
  })),
};
mkdirp(path.join(TARGET, 'index'));
fs.writeFileSync(path.join(TARGET, 'index', `${cohortId}.json`), JSON.stringify(indexJson, null, 2) + '\n');

// method, provenance, licence
copy(path.join('publication', 'METHOD.md'), 'METHOD.md');
copy(path.join('publication', 'PROVENANCE.md'), 'PROVENANCE.md');
copy(path.join('publication', 'LICENSE'), 'LICENSE');

// README, with every number substituted from the log
let readme = fs.readFileSync(path.join(HARNESS, 'publication', 'README.md.tpl'), 'utf8');
readme = readme.replace(/\{\{([A-Z_]+)\}\}/g, (m, key) => {
  if (!(key in values)) throw new Error(`README template references unknown placeholder ${m}`);
  return values[key];
});
fs.writeFileSync(path.join(TARGET, 'README.md'), readme);

// rubric, cohort, logs
copyDir('rubric', 'rubric');
copy(path.join('data', `cohort-${cohortId}.json`), path.join('data', `cohort-${cohortId}.json`));
for (const f of fs.readdirSync(path.join(HARNESS, 'results'))) {
  if (f.endsWith('.jsonl') || f === 'last-verification.txt') copy(path.join('results', f), path.join('results', f));
}

// the registry snapshot the cohort was selected from, gzipped: 28 MB of provenance nobody should
// have to clone uncompressed, and the selection is not re-derivable without it.
for (const f of fs.readdirSync(path.join(HARNESS, 'data'))) {
  if (!f.startsWith('registry-snapshot-')) continue;
  const gz = zlib.gzipSync(fs.readFileSync(path.join(HARNESS, 'data', f)), { level: 9 });
  mkdirp(path.join(TARGET, 'data'));
  fs.writeFileSync(path.join(TARGET, 'data', `${f}.gz`), gz);
}

// Run conditions and per-server evidence. Two deliberate exclusions: the generated index, which
// is published at index/ instead, and SPIKE-FINDINGS.md, which is the internal working record and
// carries commercial reasoning that has no place in an index that claims independence.
const HELD_BACK = ['SPIKE-FINDINGS.md'];
copyDir('docs', 'docs', (f) => !f.startsWith('index-') && !HELD_BACK.includes(f));

// the instrument
copy('README.md', path.join('harness', 'README.md'));
copy('package.json', path.join('harness', 'package.json'));
copy('package-lock.json', path.join('harness', 'package-lock.json'));
copy('.gitignore', path.join('harness', '.gitignore'));
copyDir('src', path.join('harness', 'src'));
copyDir('test', path.join('harness', 'test'));
copyDir('scripts', path.join('harness', 'scripts'));

// The harness reads its rubric and writes its results relative to its own root, so a clone that
// wants to re-run the sweep needs those two directories beside the source.
for (const d of ['rubric', 'data']) {
  copyDir(d, path.join('harness', d), (f) => !f.startsWith('registry-snapshot-'));
}

// The evidence files are byte-stable by design; a checkout that rewrites their line endings on
// one platform and not another would undermine exactly the claim this repository makes.
fs.writeFileSync(path.join(TARGET, '.gitattributes'), ['* text=auto eol=lf', '*.gz binary', ''].join('\n'));

fs.writeFileSync(
  path.join(TARGET, '.gitignore'),
  ['node_modules/', 'harness/node_modules/', 'harness/sandbox/', 'harness/logs/', 'harness/results/.run.lock', ''].join('\n'),
);

console.log(`built ${TARGET}`);
console.log(`  index ${cohortId} from run ${H.run_id} (config ${values.CONFIG_HASH})`);
console.log(`  ${values.PROBED}/${values.ATTEMPTED} probed · ${values.MIN_TOK}-${values.MAX_TOK} tokens · ${values.RATIO}x spread`);
console.log(`  handshake: ${values.MODERN} modern / ${values.LEGACY} legacy / ${values.NEITHER} neither`);
console.log(`  reproducibility: ${values.GO_COUNT} consecutive GO, ${values.STABLE} stable in the latest pair`);
