// Build a pinned cohort from a registry snapshot.
// Output is the input to every run, so it fixes: which servers, which exact versions,
// and why each one was selected.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readJSON, writeJSON, nowISO, sha256 } from './lib.js';

const VERTICAL = process.env.VERTICAL || 'dev-tooling';
const SIZE = Number(process.env.COHORT_SIZE || 50);
const CONCURRENCY = 8;

function latestSnapshot() {
  const dir = path.join(ROOT, 'data');
  const files = fs.readdirSync(dir).filter((f) => /^registry-snapshot-.*\.json$/.test(f)).sort();
  if (!files.length) throw new Error('no snapshot; run `npm run snapshot` first');
  return path.join(dir, files[files.length - 1]);
}

// Title + description only. The registry's io.github.* naming convention puts "github"
// in the name of every GitHub-hosted server; including the name matched 6,075 of 6,999.
function haystack(s, fields) {
  return fields.map((f) => s[f]).filter(Boolean).join(' • ').toLowerCase();
}

function matches(text, terms) {
  const hits = [];
  for (const t of terms) {
    const esc = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`, 'i');
    if (re.test(text)) hits.push(t);
  }
  return hits;
}

async function npmMeta(pkg) {
  const enc = encodeURIComponent(pkg).replace(/%40/, '@');
  try {
    const [dl, reg] = await Promise.all([
      fetch(`https://api.npmjs.org/downloads/point/last-week/${enc}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`https://registry.npmjs.org/${enc}`, { headers: { accept: 'application/vnd.npm.install-v1+json' } })
        .then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    return {
      downloads_last_week: dl?.downloads ?? null,
      published_versions: reg ? Object.keys(reg.versions || {}) : null,
      latest_version: reg?.['dist-tags']?.latest ?? null,
    };
  } catch {
    return { downloads_last_week: null, published_versions: null, latest_version: null };
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
      }
    })
  );
  return out;
}

async function main() {
  const snapPath = latestSnapshot();
  const snap = readJSON(snapPath);
  const vspec = readJSON(path.join(ROOT, 'rubric', 'verticals-v1.0.0.json'));
  const v = vspec.verticals[VERTICAL];
  if (!v) throw new Error(`unknown vertical ${VERTICAL}`);

  const candidates = [];
  const rejected = { no_npm_stdio: 0, no_keyword: 0, excluded: 0 };

  for (const entry of snap.servers) {
    const s = entry.server;
    const pkg = (s.packages || []).find(
      (p) => p.registryType === v.require.package_registry_type &&
             (p.transport?.type || 'stdio') === v.require.transport_type
    );
    if (!pkg) { rejected.no_npm_stdio++; continue; }
    const text = haystack(s, v.match_fields || ['title', 'description']);
    const hits = matches(text, v.include_any);
    if (!hits.length) { rejected.no_keyword++; continue; }
    const bad = matches(text, v.exclude_any);
    if (bad.length) { rejected.excluded++; continue; }
    candidates.push({
      registry_name: s.name,
      title: s.title || null,
      description: s.description || null,
      registry_version: s.version,
      website: s.websiteUrl || null,
      npm_package: pkg.identifier,
      npm_version_declared: pkg.version || null,
      runtime_hint: pkg.runtimeHint || null,
      package_arguments: pkg.packageArguments || null,
      runtime_arguments: pkg.runtimeArguments || null,
      environment_variables: pkg.environmentVariables || null,
      match_terms: hits,
    });
  }

  process.stderr.write(`candidates: ${candidates.length} (rejected ${JSON.stringify(rejected)})\n`);
  process.stderr.write(`resolving npm metadata for ${candidates.length} packages...\n`);

  const metas = await mapLimit(candidates, CONCURRENCY, (c) => npmMeta(c.npm_package));
  candidates.forEach((c, i) => Object.assign(c, metas[i]));

  // Only servers whose declared version actually exists on npm can be pinned.
  const pinnable = candidates.filter((c) => {
    if (!c.published_versions) return false;
    const want = c.npm_version_declared;
    if (want && c.published_versions.includes(want)) { c.pinned_version = want; c.pin_source = 'registry-declared'; return true; }
    if (c.latest_version) { c.pinned_version = c.latest_version; c.pin_source = 'npm-latest-at-cohort-build'; return true; }
    return false;
  });

  pinnable.sort((a, b) =>
    (b.downloads_last_week ?? -1) - (a.downloads_last_week ?? -1) ||
    a.registry_name.localeCompare(b.registry_name)
  );

  const selected = pinnable.slice(0, SIZE).map((c) => {
    const { published_versions, ...rest } = c;
    return rest;
  });

  const cohort = {
    cohort_id: `${VERTICAL}-v1`,
    vertical: VERTICAL,
    built_at: nowISO(),
    snapshot: path.basename(snapPath),
    snapshot_content_hash: snap.content_hash,
    verticals_spec_version: vspec.version,
    size: selected.length,
    pool: { snapshot_servers: snap.servers.length, keyword_candidates: candidates.length, pinnable: pinnable.length, rejected },
    selection_hash: sha256(selected.map((s) => `${s.npm_package}@${s.pinned_version}`).join('\n')),
    servers: selected,
  };

  const out = path.join(ROOT, 'data', `cohort-${VERTICAL}-v1.json`);
  writeJSON(out, cohort);
  console.log(`cohort: ${selected.length} servers -> ${out}`);
  console.log(`selection_hash ${cohort.selection_hash.slice(0, 16)}`);
  for (const s of selected.slice(0, 10)) {
    console.log(`  ${String(s.downloads_last_week).padStart(9)}  ${s.npm_package}@${s.pinned_version}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
