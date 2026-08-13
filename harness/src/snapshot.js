// Pull the full MCP Registry catalogue and pin it to a dated snapshot file.
// The registry is in preview and its maintainers have said data resets are expected,
// so every cohort must reference a snapshot, never the live API.
import path from 'node:path';
import { ROOT, writeJSON, nowISO, sha256 } from './lib.js';

const BASE = process.env.MCP_REGISTRY_BASE || 'https://registry.modelcontextprotocol.io';
const PAGE = 100;

async function fetchPage(cursor) {
  const url = new URL('/v0/servers', BASE);
  url.searchParams.set('limit', String(PAGE));
  if (cursor) url.searchParams.set('cursor', cursor);
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`registry ${res.status} on ${url}`);
  return res.json();
}

async function main() {
  const maxPages = Number(process.env.MAX_PAGES || 400);
  const servers = [];
  let cursor = null;
  let pages = 0;

  while (pages < maxPages) {
    const body = await fetchPage(cursor);
    servers.push(...body.servers);
    pages++;
    cursor = body.metadata?.nextCursor || null;
    if (pages % 10 === 0) process.stderr.write(`  ...${servers.length} entries\n`);
    if (!cursor) break;
  }

  // Registry returns every published version. Keep only the latest per server name.
  const latest = new Map();
  for (const entry of servers) {
    const name = entry.server?.name;
    if (!name) continue;
    const meta = entry._meta?.['io.modelcontextprotocol.registry/official'] || {};
    const prev = latest.get(name);
    if (!prev) { latest.set(name, entry); continue; }
    const prevMeta = prev._meta?.['io.modelcontextprotocol.registry/official'] || {};
    if (meta.isLatest && !prevMeta.isLatest) { latest.set(name, entry); continue; }
    if (!!meta.isLatest === !!prevMeta.isLatest &&
        String(meta.publishedAt || '') > String(prevMeta.publishedAt || '')) {
      latest.set(name, entry);
    }
  }

  const date = nowISO().slice(0, 10);
  const unique = [...latest.values()].sort((a, b) => a.server.name.localeCompare(b.server.name));
  const out = {
    snapshot_date: date,
    fetched_at: nowISO(),
    registry_base: BASE,
    pages_fetched: pages,
    truncated: !!cursor,
    version_rows: servers.length,
    unique_servers: unique.length,
    content_hash: sha256(unique.map((e) => e.server.name + '@' + e.server.version).join('\n')),
    servers: unique,
  };
  const p = path.join(ROOT, 'data', `registry-snapshot-${date}.json`);
  writeJSON(p, out);
  console.log(`snapshot: ${unique.length} unique servers (${servers.length} version rows, ${pages} pages)`);
  console.log(`  -> ${p}`);
  if (cursor) console.log('  WARNING: truncated at MAX_PAGES, snapshot is partial');
}

main().catch((e) => { console.error(e); process.exit(1); });
