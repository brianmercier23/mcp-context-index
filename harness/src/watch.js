// Version-drift watcher: what moved since the cohort was pinned.
//
// Re-running the pinned cohort produces byte-identical numbers by design, so re-measuring on a
// schedule buys nothing. What buys something is knowing which servers published a new version
// past the pin — those are the only ones worth re-probing, and that check is npm metadata, not
// an install. Fifty HEAD-weight requests, a few seconds, no sandbox, no execution.
//
//   npm run watch          # check, append to results/versions.jsonl, write docs/version-drift.md
//
// This deliberately does NOT re-probe. It prints the exact VERSION_OVERRIDE= command that measures
// the movers at their new versions, because deciding to spend machine time is a decision, not a
// side effect. ONLY= would not do: it installs the pin, on dependencies resolved as of the pin, and
// reprints the published number. It also
// does not re-select the cohort: a server entering or leaving the top 50 by downloads changes the
// selection hash and is a new cohort, not drift within this one.
import path from 'node:path';
import { ROOT, readJSON, appendJSONL, readJSONL, nowISO, HARNESS_VERSION } from './lib.js';

const COHORT = process.env.COHORT || 'dev-tooling-v1';
const CONCURRENCY = Number(process.env.WATCH_CONCURRENCY || 8);
const LOG = path.join(ROOT, 'results', 'versions.jsonl');

// The abbreviated registry document is a fraction of the full packument and carries everything
// needed here. Asking for the full document 50 times a day to read two fields would be rude.
const ABBREVIATED = 'application/vnd.npm.install-v1+json';

function cmp(a, b) {
  // Semver comparison, enough for "is this newer than what we pinned". Prerelease tags sort
  // before their release, which is the standard reading and the conservative one here.
  const parse = (v) => {
    const [core, pre] = String(v).split('-');
    return { nums: core.split('.').map((n) => parseInt(n, 10) || 0), pre: pre || null };
  };
  const A = parse(a), B = parse(b);
  for (let i = 0; i < 3; i++) {
    if ((A.nums[i] || 0) !== (B.nums[i] || 0)) return (A.nums[i] || 0) - (B.nums[i] || 0);
  }
  if (A.pre === B.pre) return 0;
  if (!A.pre) return 1;
  if (!B.pre) return -1;
  return A.pre < B.pre ? -1 : 1;
}

async function checkOne(server) {
  const out = {
    registry_name: server.registry_name,
    npm_package: server.npm_package,
    pinned_version: server.pinned_version,
    latest_version: null,
    moved: false,
    versions_ahead: null,
    latest_published_at: null,
    deprecated: null,
    unpublished: false,
    error: null,
  };
  const url = `https://registry.npmjs.org/${server.npm_package.replace('/', '%2F')}`;
  try {
    const res = await fetch(url, { headers: { accept: ABBREVIATED } });
    if (res.status === 404) {
      // A package that measured fine and is now gone is the most actionable thing this can find.
      out.unpublished = true;
      return out;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const doc = await res.json();
    const latest = doc['dist-tags']?.latest ?? null;
    out.latest_version = latest;
    if (latest) {
      out.moved = cmp(latest, server.pinned_version) > 0;
      const all = Object.keys(doc.versions || {});
      out.versions_ahead = all.filter((v) => cmp(v, server.pinned_version) > 0).length;
      out.deprecated = Boolean(doc.versions?.[latest]?.deprecated);
    }
    if (!doc.versions?.[server.pinned_version]) {
      // The pinned version specifically was removed, even though the package still exists.
      out.unpublished = true;
    }
  } catch (e) {
    out.error = String(e.message || e).slice(0, 200);
  }
  return out;
}

async function pool(items, worker, size) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await worker(items[i]);
      }
    }),
  );
  return results;
}

function renderMarkdown(header, rows) {
  const movers = rows.filter((r) => r.moved);
  const gone = rows.filter((r) => r.unpublished);
  const deprecated = rows.filter((r) => r.deprecated);
  const errors = rows.filter((r) => r.error);

  const L = [];
  L.push(`# Version drift — ${header.cohort_id}`);
  L.push('');
  L.push(`Checked ${header.checked_at} against the pinned cohort. ${rows.length} packages, npm metadata only:`);
  L.push('nothing was installed, executed or measured.');
  L.push('');
  L.push('| | |');
  L.push('|---|---:|');
  L.push(`| Still on the pinned version | **${rows.length - movers.length - gone.length - errors.length}** |`);
  L.push(`| Published a newer version | **${movers.length}** |`);
  L.push(`| Pinned version or package no longer on npm | **${gone.length}** |`);
  L.push(`| Latest version marked deprecated | **${deprecated.length}** |`);
  if (errors.length) L.push(`| Could not be checked | **${errors.length}** |`);
  L.push('');
  L.push('The published index does not move when this file does. The index reports pinned versions,');
  L.push('and a version that moved on npm has not been measured until a sweep measures it.');
  L.push('');

  if (movers.length) {
    L.push('## Moved past the pin');
    L.push('');
    L.push('| Server | Pinned | Latest | Versions ahead |');
    L.push('|---|---|---|---:|');
    for (const r of movers.sort((a, b) => (b.versions_ahead || 0) - (a.versions_ahead || 0))) {
      L.push(`| \`${r.npm_package}\` | ${r.pinned_version} | **${r.latest_version}**${r.deprecated ? ' (deprecated)' : ''} | ${r.versions_ahead ?? '—'} |`);
    }
    L.push('');
    L.push('Measure these at their new versions, and nothing else:');
    L.push('');
    L.push('```bash');
    L.push(`VERSION_OVERRIDE="${movers.map((r) => `${r.npm_package}@${r.latest_version}`).join(',')}" npm run run`);
    L.push('```');
    L.push('');
    L.push('Each server is installed at the version named, with its dependencies resolved as they stood');
    L.push('when that version was published. The overrides are recorded in the run header and the config');
    L.push('hash, and the run is flagged `partial_sweep`, so it can never be published as an index.');
    L.push('A plain re-run (`ONLY=`) would not measure anything new: it installs the pinned version on');
    L.push('the pin\'s dependencies and reproduces the published number. Re-pinning the cohort, which');
    L.push('moves the index itself, is a separate, deliberate act.');
    L.push('');
  } else {
    L.push('## Moved past the pin');
    L.push('');
    L.push('Nothing. Every package in the cohort is still at the version it was measured at.');
    L.push('');
  }

  if (gone.length) {
    L.push('## No longer resolvable');
    L.push('');
    for (const r of gone) L.push(`- \`${r.npm_package}@${r.pinned_version}\` — the pinned version is gone from npm${r.latest_version ? `; latest is now ${r.latest_version}` : ' and so is the package'}`);
    L.push('');
    L.push('A measurement of a version nobody can install any more is history, not a buying guide.');
    L.push('These rows should be re-pinned or dropped at the next cohort revision.');
    L.push('');
  }

  if (deprecated.length) {
    L.push('## Latest version marked deprecated');
    L.push('');
    for (const r of deprecated) L.push(`- \`${r.npm_package}\` — latest (${r.latest_version}) carries an npm deprecation notice`);
    L.push('');
  }

  if (errors.length) {
    L.push('## Could not be checked');
    L.push('');
    for (const r of errors) L.push(`- \`${r.npm_package}\` — ${r.error}`);
    L.push('');
  }
  return L.join('\n') + '\n';
}

async function main() {
  const cohort = readJSON(path.join(ROOT, 'data', `cohort-${COHORT}.json`));
  const checkedAt = nowISO();
  console.log(`watch ${cohort.cohort_id}  n=${cohort.servers.length}`);

  const rows = await pool(cohort.servers, checkOne, CONCURRENCY);
  const movers = rows.filter((r) => r.moved);
  const gone = rows.filter((r) => r.unpublished);

  const header = {
    record_type: 'version_check',
    checked_at: checkedAt,
    harness_version: HARNESS_VERSION,
    cohort_id: cohort.cohort_id,
    cohort_selection_hash: cohort.selection_hash,
    counts: {
      checked: rows.length,
      moved: movers.length,
      unpublished: gone.length,
      deprecated: rows.filter((r) => r.deprecated).length,
      errors: rows.filter((r) => r.error).length,
    },
  };

  // Append-only, same contract as every other log here: only the rows that carry news are kept,
  // because a daily full snapshot of 50 unchanged rows would bury the signal it exists to show.
  appendJSONL(LOG, [header, ...rows.filter((r) => r.moved || r.unpublished || r.error || r.deprecated).map((r) => ({ record_type: 'version_drift', checked_at: checkedAt, ...r }))]);

  const md = path.join(ROOT, 'docs', `version-drift-${cohort.cohort_id}.md`);
  const fsp = await import('node:fs');
  fsp.mkdirSync(path.dirname(md), { recursive: true });
  fsp.writeFileSync(md, renderMarkdown(header, rows));

  const prior = readJSONL(LOG).filter((r) => r.record_type === 'version_check');
  console.log(`  moved: ${movers.length}  unpublished: ${gone.length}  deprecated: ${header.counts.deprecated}  errors: ${header.counts.errors}`);
  if (movers.length) {
    for (const r of movers) console.log(`    ${r.npm_package}  ${r.pinned_version} -> ${r.latest_version}`);
    console.log(`\n  measure the movers at their new versions:  VERSION_OVERRIDE="${movers.map((r) => `${r.npm_package}@${r.latest_version}`).join(',')}" npm run run`);
  }
  console.log(`\nappended to results/versions.jsonl (${prior.length} checks logged)  ->  ${path.relative(ROOT, md)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
