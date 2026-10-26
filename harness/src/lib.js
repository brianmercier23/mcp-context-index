// Shared helpers. Deliberately dependency-light: everything here must be deterministic.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encode } from 'gpt-tokenizer/model/gpt-4o';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Single source of truth: package.json. Two places to write a version number is one place too
// many when the number is inside the config hash.
export const HARNESS_VERSION = readJSON(path.join(ROOT, 'package.json')).version;

// The MCP client libraries are an input to the measurement: which stack connected is part of how
// a number was produced. Read from the installed tree rather than from package.json, so this
// records the code that actually ran and not the range that was asked for.
export function installedVersion(pkg) {
  try {
    return readJSON(path.join(ROOT, 'node_modules', ...pkg.split('/'), 'package.json')).version;
  } catch {
    return null;
  }
}

// Both eras of the TypeScript SDK. @modelcontextprotocol/sdk tops out at protocol 2025-11-25 and
// speaks the initialize handshake; the 2.0 package family speaks the 2026-07-28 stateless core.
export function mcpClientStack() {
  return {
    legacy: installedVersion('@modelcontextprotocol/sdk'),
    modern: installedVersion('@modelcontextprotocol/client'),
  };
}

export function sha256(s) {
  return createHash('sha256').update(s).digest('hex');
}

// Key-sorted JSON. Two structurally identical objects always serialise identically,
// which is what makes the token count reproducible.
export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}

export function countTokens(text) {
  if (!text) return 0;
  return encode(text).length;
}

export function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

export function writeJSON(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
}

// Append-only. Never rewrites, never truncates. Every run adds lines.
export function appendJSONL(p, records) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const lines = (Array.isArray(records) ? records : [records]).map((r) => JSON.stringify(r)).join('\n') + '\n';
  fs.appendFileSync(p, lines);
}

export function readJSONL(p) {
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

export function median(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function pct(n, d) {
  return d === 0 ? null : n / d;
}

export function nowISO() {
  return new Date().toISOString();
}

// Deterministic run id: no randomness, no clock beyond the caller-supplied stamp. The stamp has
// minute resolution, so two short runs of one config started in the same minute used to share an
// id, and every reader that groups by run_id merged them into one run. `taken` holds the ids
// already in the log the run appends to; a collision takes the next free -2, -3 suffix. No id in
// either log had collided when this was added, so none of them reads differently.
export function runId(stamp, configHash, taken = new Set()) {
  const base = `run-${stamp.replace(/[:.]/g, '').replace('T', '-').slice(0, 15)}-${configHash.slice(0, 8)}`;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

// Every run id already spoken for: the run headers in a log, plus results/partial/, where a sweep
// that died before writing its header still left records under its id.
export function takenRunIds(logPath) {
  const ids = new Set(readJSONL(logPath).filter((r) => r.record_type === 'run').map((r) => r.run_id));
  const partial = path.join(ROOT, 'results', 'partial');
  if (fs.existsSync(partial)) {
    for (const f of fs.readdirSync(partial)) if (f.endsWith('.jsonl')) ids.add(f.slice(0, -'.jsonl'.length));
  }
  return ids;
}
