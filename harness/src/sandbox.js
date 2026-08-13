// Sandboxed install and launch plan for one server.
//
// Honest naming: this is *isolation*, not a security sandbox. There is no container runtime
// on this host. What it does guarantee, and what the measurement actually depends on:
//   - a pinned exact version, so two runs install byte-identical code
//   - an empty install prefix per server, so no dependency bleeds between servers
//   - --ignore-scripts, so no install-time code executes
//   - a scrubbed environment, so the process cannot read the operator's real credentials
//   - canary placeholders in every declared credential slot, so leaks are detectable
// Limitations are recorded in every result record rather than papered over.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { ROOT } from './lib.js';

const execFileP = promisify(execFile);

export const SANDBOX_MODEL = {
  kind: 'isolated-prefix',
  container: false,
  ignore_scripts: true,
  env_scrubbed: true,
  network_isolated: false,
  note: 'No container runtime on this host. Network is NOT blocked; a server may reach its own API during tools/list. Servers whose tool list is fetched dynamically from a live API are the expected source of any run-over-run instability, and the reproducibility report names them.',
};

// Node >=20 refuses to execFile a .cmd shim, so npm is driven through its own CLI entrypoint.
// Running it under the same node binary also removes cmd.exe from the chain, which means
// no shell is ever involved and package specs can never be interpreted as shell syntax.
function npmCli() {
  const guess = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (fs.existsSync(guess)) return guess;
  const alt = path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (fs.existsSync(alt)) return alt;
  throw new Error('cannot locate npm-cli.js');
}

// Belt and braces: the package name and version come from a third-party registry.
const SPEC_OK = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*@[0-9][0-9a-zA-Z.+-]*$/;

export function slug(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
}

export function sandboxDir(server) {
  return path.join(ROOT, 'sandbox', slug(server.registry_name));
}

// Windows holds file handles longer than the process that opened them appears to live, and
// endpoint-protection scanners hold them longer still. A single rmSync races both and produces
// EPERM, which used to surface as a harness_error and a spurious status flip between runs.
async function rmWithRetry(dir, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    try { fs.rmSync(dir, { recursive: true, force: true }); return true; }
    catch (e) {
      if (i === attempts - 1) return false;
      await new Promise((r) => setTimeout(r, 250 * (i + 1)));
    }
  }
  return false;
}

export async function install(server, { timeoutMs = 240000 } = {}) {
  const dir = sandboxDir(server);
  if (!(await rmWithRetry(dir))) {
    return { ok: false, dir, spec: `${server.npm_package}@${server.pinned_version}`, ms: 0,
             error: 'could not clear sandbox directory (locked by another process or a scanner)' };
  }
  fs.mkdirSync(dir, { recursive: true });
  // A private prefix with its own empty package.json keeps npm from walking up to any parent manifest.
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'probe-sandbox', private: true, version: '0.0.0' }));

  const spec = `${server.npm_package}@${server.pinned_version}`;
  if (!SPEC_OK.test(spec)) {
    return { ok: false, dir, spec, ms: 0, error: 'rejected: package spec failed validation' };
  }
  const args = [npmCli(), 'install', spec, '--prefix', dir, '--no-audit', '--no-fund', '--ignore-scripts',
                '--no-package-lock', '--omit=dev', '--loglevel=error'];
  const started = Date.now();
  try {
    await execFileP(process.execPath, args, {
      cwd: dir, timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, windowsHide: true,
      env: { ...process.env, npm_config_update_notifier: 'false' },
    });
  } catch (e) {
    return { ok: false, dir, spec, ms: Date.now() - started, error: String(e.stderr || e.message).slice(0, 2000) };
  }
  return { ok: true, dir, spec, ms: Date.now() - started };
}

// Resolve the actual JS entrypoint. Spawning node against the resolved file avoids
// Windows .cmd shims, which would otherwise put cmd.exe between the harness and the server.
export function resolveEntry(server, dir) {
  const pkgDir = path.join(dir, 'node_modules', ...server.npm_package.split('/'));
  const pkgJsonPath = path.join(pkgDir, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) return { ok: false, reason: 'package_dir_missing' };
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));

  let rel = null;
  if (typeof pkg.bin === 'string') rel = pkg.bin;
  else if (pkg.bin && typeof pkg.bin === 'object') {
    const keys = Object.keys(pkg.bin);
    const short = server.npm_package.split('/').pop();
    rel = pkg.bin[short] || pkg.bin[keys.sort()[0]];
  }
  if (!rel) rel = pkg.main || 'index.js';

  const entry = path.join(pkgDir, rel);
  if (!fs.existsSync(entry)) return { ok: false, reason: 'entry_missing', entry };
  return { ok: true, entry, pkg_version: pkg.version, bin_declared: !!pkg.bin };
}

const SECRET_HINT = /(token|key|secret|password|passwd|credential|apikey|api_key|auth|pat|dsn|conn|cookie|session)/i;

// One canary per run. If it ever comes back out of the server, the server echoes secrets.
export function makeCanary(runId) {
  return `CANARY-${runId.replace(/[^a-zA-Z0-9]/g, '')}-DO-NOT-USE`;
}

export function buildLaunch(server, entry, canary) {
  const env = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    HOME: process.env.HOME || process.env.USERPROFILE,
    USERPROFILE: process.env.USERPROFILE,
    NODE_ENV: 'production',
    CI: '1',
    NO_COLOR: '1',
    MCP_PROBE: '1',
  };

  const declared = server.environment_variables || [];
  const declared_secrets = [];
  const unset_required_env = [];
  for (const ev of declared) {
    const name = ev.name || ev.variable;
    if (!name) continue;
    const isSecret = ev.isSecret === true || SECRET_HINT.test(name);
    if (isSecret) { declared_secrets.push(name); env[name] = canary; continue; }
    // Only set a non-secret variable when the registry entry documents a value for it.
    // Injecting a junk placeholder into an enum-valued variable (LOG_LEVEL, SEARCH_PROVIDER,
    // SHAREDOC_BACKEND) kills servers that would have started fine on their own defaults,
    // and the resulting failure belongs to the harness, not the server.
    const documented = ev.default ?? ev.value ?? null;
    if (documented !== null) env[name] = String(documented);
    else if (ev.isRequired === true) unset_required_env.push(name);
  }

  // Positional / named package arguments the registry says the server needs.
  const argv = [];
  let secrets_via_argv = 0;
  const unsatisfied_required_args = [];
  for (const a of server.package_arguments || []) {
    const val = a.default ?? a.value ?? null;
    if (val === null) {
      if (a.isRequired || a.required) unsatisfied_required_args.push(a.name || a.valueHint || '(positional)');
      continue;  // same reasoning as env: a documented value or nothing
    }
    if (a.type === 'named' && a.name) {
      argv.push(a.name, String(val));
      if (a.isSecret === true || SECRET_HINT.test(a.name)) secrets_via_argv++;
    } else {
      argv.push(String(val));
      if (a.isSecret === true) secrets_via_argv++;
    }
  }

  return {
    command: process.execPath,
    args: [entry, ...argv],
    env,
    // Servers are launched inside their own sandbox directory, never the harness repo.
    // One server in the first sweep began indexing whatever directory it was started in,
    // which both skews its measurement and reads files that are none of its business.
    cwd: sandboxDir(server),
    declared_secrets,
    declared_secret_count: declared_secrets.length,
    secrets_via_argv,
    unset_required_env,
    unsatisfied_required_args,
  };
}

export async function cleanup(server) {
  await rmWithRetry(sandboxDir(server), 3);
}

// One sweep at a time. Sandbox directories are keyed by server, so two concurrent sweeps
// install into and delete the same directory and corrupt each other's measurements.
export function acquireRunLock(runIdStr) {
  const lock = path.join(ROOT, 'results', '.run.lock');
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  if (fs.existsSync(lock)) {
    const held = JSON.parse(fs.readFileSync(lock, 'utf8'));
    let alive = false;
    try { process.kill(held.pid, 0); alive = true; } catch { alive = false; }
    if (alive) throw new Error(`another sweep is running (pid ${held.pid}, run ${held.run_id}). Wait for it, or delete results/.run.lock if it is stale.`);
  }
  fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, run_id: runIdStr }));
  const release = () => { try { fs.unlinkSync(lock); } catch { /* already gone */ } };
  process.on('exit', release);
  process.on('SIGINT', () => { release(); process.exit(130); });
  return release;
}
