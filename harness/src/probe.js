// The fixed probe suite. One MCP session per pass, two passes per server.
// Everything measured here is deterministic: no model in the loop, no sampling,
// no wall-clock-dependent value in any recorded metric.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Client as ModernClient } from '@modelcontextprotocol/client';
import { StdioClientTransport as ModernStdioTransport } from '@modelcontextprotocol/client/stdio';
import { stableStringify, countTokens, median } from './lib.js';

const CONNECT_MS = Number(process.env.CONNECT_MS || 45000);
const CALL_MS = Number(process.env.CALL_MS || 20000);
// The era probe is deliberately shorter than the connect budget. On stdio the spec reads a silent
// server as a legacy server, so this timeout is a classification input, not just a guard.
const DISCOVER_MS = Number(process.env.DISCOVER_MS || 15000);

export const MODERN_PROTOCOL = '2026-07-28';

function withTimeout(promise, ms, label) {
  let t;
  return Promise.race([
    promise.finally(() => clearTimeout(t)),
    new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`timeout:${label}:${ms}ms`)), ms); }),
  ]);
}

// The exact payload a client injects into context for this server: name, description,
// input schema. Key-sorted so two structurally identical lists always tokenise identically.
export function toolDefinitionPayload(tools) {
  return [...tools]
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
    .map((t) => ({
      name: t.name,
      description: t.description ?? '',
      inputSchema: t.inputSchema ?? {},
      ...(t.outputSchema ? { outputSchema: t.outputSchema } : {}),
    }));
}

export function tokenizeTools(tools) {
  const payload = toolDefinitionPayload(tools);
  const per = payload.map((t) => ({ name: t.name, tokens: countTokens(stableStringify(t)) }));
  return {
    tool_definition_tokens: countTokens(stableStringify(payload)),
    per_tool: per,
    tokens_per_tool_median: median(per.map((p) => p.tokens)),
    tokens_per_tool_max: per.length ? Math.max(...per.map((p) => p.tokens)) : 0,
    heaviest_tool: per.length ? per.reduce((a, b) => (b.tokens > a.tokens ? b : a)).name : null,
  };
}

async function listAllTools(client, reqOpts) {
  const tools = [];
  let cursor;
  let pages = 0;
  do {
    const res = await withTimeout(client.listTools(cursor ? { cursor } : {}, reqOpts), CALL_MS, 'tools/list');
    tools.push(...(res.tools || []));
    cursor = res.nextCursor;
    pages++;
  } while (cursor && pages < 20);
  return { tools, pages };
}

// Which protocol era a server speaks, decided the way the 2026-07-28 spec specifies for stdio:
// probe with server/discover, and fall back on any error that is not a recognised modern error.
// Servers MUST implement server/discover, so a definitive answer here is a property of the server.
//
// Pinned rather than 'auto' on purpose: 'auto' would silently run the legacy handshake on failure,
// and this function's whole job is to return that verdict rather than paper over it. The client
// runs the probe on a short-lived sibling process and never starts the caller's transport unless
// the era is modern, so a legacy server costs one throwaway spawn and no handshake.
export async function detectEra(launch) {
  const out = { handshake: null, discover: null, negotiated_version: null, probe_error: null };
  const transport = new ModernStdioTransport({
    command: launch.command,
    args: launch.args,
    env: launch.env,
    cwd: launch.cwd,
    stderr: 'pipe',
  });
  const client = new ModernClient(
    { name: 'mcp-probe', version: '0.1.0' },
    { versionNegotiation: { mode: { pin: MODERN_PROTOCOL }, probe: { timeoutMs: DISCOVER_MS } } },
  );
  try {
    await withTimeout(client.connect(transport), DISCOVER_MS + CALL_MS, 'discover');
    out.handshake = 'modern';
    out.negotiated_version = client.getNegotiatedProtocolVersion() ?? null;
    const d = client.getDiscoverResult();
    if (d) {
      out.discover = {
        protocol_versions: d.protocolVersions ?? d.supportedProtocolVersions ?? null,
        capability_keys: Object.keys(d.capabilities || {}).sort(),
        server_info: d.serverInfo ? { name: d.serverInfo.name, version: d.serverInfo.version } : null,
      };
    }
  } catch (e) {
    // Kept verbatim and fed to the failure classifier alongside stderr. A JSON-RPC error here is
    // evidence the process was alive and speaking the protocol, which is what separates a server
    // that answers neither handshake from one that never started at all.
    out.probe_error = ((e?.name || 'Error') + ': ' + String(e?.message || e)).slice(0, 500);
  } finally {
    try { await withTimeout(client.close(), 5000, 'discover-close'); } catch { /* best effort */ }
    try { await withTimeout(transport.close(), 5000, 'discover-transport-close'); } catch { /* ignore */ }
  }
  return out;
}

// One full MCP session against an installed server.
//
// era 'legacy' runs the 2025 initialize handshake on @modelcontextprotocol/sdk — the exact path
// four consecutive reproducibility pairs were measured on, deliberately untouched. 'modern' runs
// the 2026-07-28 stateless core on the 2.0 client. Both produce the same signal set: the
// measurement is tools/list output either way.
export async function session(launch, { collectErrors = false, canary = null, era = 'legacy' } = {}) {
  const stderrChunks = [];
  const out = { ok: false, stderr_bytes: 0, protocol_errors: [], era };
  const modern = era === 'modern';

  // A modern connection would otherwise serve the second tools/list from the response cache the
  // 2026-07-28 ttlMs hints enable, which would make the same-session stability check trivially
  // true. Bypassing it keeps that check a measurement of the server, not of the client.
  const reqOpts = modern ? { cacheMode: 'bypass' } : undefined;

  const transport = modern
    ? new ModernStdioTransport({ command: launch.command, args: launch.args, env: launch.env, cwd: launch.cwd, stderr: 'pipe' })
    : new StdioClientTransport({ command: launch.command, args: launch.args, env: launch.env, cwd: launch.cwd, stderr: 'pipe' });

  // The stdio transport has no setProtocolVersion (only HTTP transports need one), so the
  // negotiated version is captured by supplying the optional hook the client calls if present.
  let negotiated = null;
  if (!modern) transport.setProtocolVersion = (v) => { negotiated = v; };

  const client = modern
    ? new ModernClient({ name: 'mcp-probe', version: '0.1.0' }, { versionNegotiation: { mode: { pin: MODERN_PROTOCOL }, probe: { timeoutMs: DISCOVER_MS } } })
    : new Client({ name: 'mcp-probe', version: '0.1.0' }, { capabilities: {} });

  try {
    // Start the connect, then attach to stderr before awaiting it. The child is spawned
    // synchronously inside start(), so this catches startup output — which is exactly where
    // a server that dies on launch prints its reason.
    const connecting = client.connect(transport);
    transport.stderr?.on('data', (d) => {
      if (stderrChunks.length < 400) stderrChunks.push(d.toString('utf8'));
    });
    await withTimeout(connecting, CONNECT_MS, 'connect');

    const init = client.getServerVersion();
    out.server_info = init ? { name: init.name, version: init.version } : null;
    out.protocol_version = modern ? (client.getNegotiatedProtocolVersion() ?? null) : negotiated;
    out.capabilities = client.getServerCapabilities() ?? {};
    out.instructions = client.getInstructions() ?? null;
    out.instructions_tokens = countTokens(out.instructions || '');

    const { tools, pages } = await listAllTools(client, reqOpts);
    out.tool_count = tools.length;
    out.list_pages = pages;
    Object.assign(out, tokenizeTools(tools));
    out.tools = tools;

    // Same session, second call. A differing list here is a resource-synchronisation fault.
    try {
      const again = await listAllTools(client, reqOpts);
      out.same_session_list_stable =
        stableStringify(toolDefinitionPayload(again.tools)) === stableStringify(toolDefinitionPayload(tools));
    } catch {
      out.same_session_list_stable = null;
    }

    out.prompts_tokens = 0;
    out.resources_tokens = 0;
    if (out.capabilities.prompts) {
      try {
        const p = await withTimeout(client.listPrompts({}, reqOpts), CALL_MS, 'prompts/list');
        out.prompt_count = (p.prompts || []).length;
        out.prompts_tokens = countTokens(stableStringify(p.prompts || []));
      } catch { out.prompt_count = null; }
    }
    if (out.capabilities.resources) {
      try {
        const r = await withTimeout(client.listResources({}, reqOpts), CALL_MS, 'resources/list');
        out.resource_count = (r.resources || []).length;
        out.resources_tokens = countTokens(stableStringify(r.resources || []));
      } catch { out.resource_count = null; }
    }

    out.context_injection_tokens_total =
      out.tool_definition_tokens + out.instructions_tokens + out.prompts_tokens + out.resources_tokens;

    if (collectErrors) out.error_probes = await runErrorProbes(client, tools);

    out.ok = true;
  } catch (e) {
    out.error = String(e.message || e).slice(0, 1000);
  } finally {
    try { await withTimeout(client.close(), 8000, 'close'); } catch { /* recorded via exited_cleanly */ }
    try { await withTimeout(transport.close(), 5000, 'transport-close'); } catch { /* ignore */ }
  }

  const stderr = stderrChunks.join('');
  out.stderr_bytes = Buffer.byteLength(stderr);
  out.stderr_lines = stderr ? stderr.split('\n').filter(Boolean).length : 0;
  out.stderr_sample = stderr.slice(0, 600) || null;
  if (canary) out.canary_in_stderr = stderr.includes(canary);
  return out;
}

// Deliberately malformed calls. Up to 3 tools, chosen by sorted name so the choice is
// identical on every run, and only tools that declare a required parameter.
const READONLY_SAFE = /^(?!.*(delete|remove|drop|destroy|purge|write|create|update|send|post|push|deploy|execute|exec|run_command|shell|kill|revoke|reset|merge|close))/i;

function pickProbeTools(tools) {
  return [...tools]
    .filter((t) => Array.isArray(t.inputSchema?.required) && t.inputSchema.required.length > 0)
    .filter((t) => READONLY_SAFE.test(String(t.name)))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
    .slice(0, 3);
}

function classify(text) {
  const t = String(text || '');
  return {
    tokens: countTokens(t),
    has_stacktrace: /\n\s*at\s+\S+\s+\(?[A-Za-z]:[\\/]|\n\s*at\s+\S+\s+\(/.test(t) || /Traceback \(most recent call last\)/.test(t),
    leaks_path: /[A-Za-z]:\\Users\\|\/home\/[a-z]+\/|\/Users\/[a-z]+\//i.test(t),
    sample: t.slice(0, 300),
  };
}

async function runErrorProbes(client, tools) {
  const picks = pickProbeTools(tools);
  const results = [];
  for (const tool of picks) {
    const required = tool.inputSchema.required;
    const props = tool.inputSchema.properties || {};
    const missing = required[0];

    // (a) omit a required argument
    results.push(await oneProbe(client, tool, 'missing_required', {}, missing));

    // (b) supply a required argument with the wrong type
    const declared = props[missing]?.type;
    const wrong = declared === 'string' ? 12345 : declared === 'number' || declared === 'integer' ? 'not-a-number'
      : declared === 'boolean' ? 'not-a-boolean' : declared === 'array' ? 'not-an-array' : { unexpected: true };
    const args = {};
    for (const r of required) args[r] = r === missing ? wrong : placeholderFor(props[r]);
    results.push(await oneProbe(client, tool, 'wrong_type', args, missing));
  }
  return results;
}

function placeholderFor(schema) {
  const t = schema?.type;
  if (Array.isArray(schema?.enum) && schema.enum.length) return schema.enum[0];
  if (t === 'number' || t === 'integer') return 1;
  if (t === 'boolean') return false;
  if (t === 'array') return [];
  if (t === 'object') return {};
  return 'probe';
}

async function oneProbe(client, tool, kind, args, paramName) {
  const rec = { tool: tool.name, kind, param: paramName };
  try {
    const res = await withTimeout(client.callTool({ name: tool.name, arguments: args }), CALL_MS, `call:${tool.name}`);
    const text = JSON.stringify(res);
    rec.outcome = res.isError ? 'isError_content' : 'accepted';
    rec.structured = res.isError === true;
    Object.assign(rec, classify(text));
    rec.names_param = new RegExp(`\\b${paramName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text);
  } catch (e) {
    const msg = String(e?.message || e);
    const isTimeout = msg.startsWith('timeout:');
    rec.outcome = isTimeout ? 'timeout' : 'jsonrpc_error';
    rec.structured = !isTimeout && typeof e?.code === 'number';
    rec.code = typeof e?.code === 'number' ? e.code : null;
    Object.assign(rec, classify(msg));
    rec.names_param = new RegExp(`\\b${paramName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(msg);
  }
  return rec;
}
