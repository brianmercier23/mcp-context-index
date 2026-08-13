// Failure classification. Deliberately a *view* over a stored record, not a measurement:
// the append-only log keeps the raw stderr, and the taxonomy is re-applied at render time.
// That way the patterns can improve without rewriting history or invalidating a config hash.
import path from 'node:path';
import { ROOT, readJSON } from './lib.js';

export const FAILURE_CLASSES = readJSON(path.join(ROOT, 'rubric', 'failure-classes-v1.1.0.json'));
export const FAILURE_SPEC = `failure-classes@${FAILURE_CLASSES.version}`;

// The narrow, provable form of "answers neither handshake": the process is alive and speaking
// JSON-RPC, and it answered initialize with method-not-found — so it implements neither the 2025
// handshake nor the server/discover exchange that 2026-07-28 makes mandatory for servers.
//
// Deliberately narrow. Any other error on initialize means the server has the method and failed
// for some other reason, which is a different diagnosis and is left to the stderr patterns. The
// pin-mode discover probe cannot supply this evidence on its own: it reports a legacy server and
// a JSON-RPC refusal with the same "did not offer the pinned version" error, so the initialize
// answer is the only place the distinction is observable.
const METHOD_NOT_FOUND = /-32601|method ?not ?found/i;

function byId(id) {
  const c = FAILURE_CLASSES.classes.find((x) => x.id === id);
  return { id: c.id, attribution: c.attribution, label: c.label, spec: FAILURE_SPEC };
}

export function classifyFailure(stderrText, sessionError, handshake = null) {
  const probeError = handshake?.discover_probe_error || '';
  const hay = [stderrText || '', sessionError || '', probeError].join('\n');
  for (const c of FAILURE_CLASSES.classes) {
    for (const p of c.patterns || []) {
      if (new RegExp(p, 'i').test(hay)) return { id: c.id, attribution: c.attribution, label: c.label, spec: FAILURE_SPEC };
    }
  }
  // Ordered after the stderr patterns on purpose: a server that prints why it will not start is
  // better described by that reason than by the handshake it failed to complete.
  if (handshake?.answered === 'none' && METHOD_NOT_FOUND.test([sessionError || '', probeError].join(' '))) {
    return byId('no_handshake_response');
  }
  if (!String(stderrText || '').trim()) return byId('silent_exit');
  return { id: 'unclassified', attribution: 'unknown', label: 'No pattern matched the launch output', spec: FAILURE_SPEC };
}
