// Sandboxed install and launch plan for one server.
//
// Honest naming: this is *isolation*, not a security sandbox. There is no container runtime
// on this host. What it does guarantee, and what the measurement actually depends on:
//   - a pinned exact version of the server package
//   - transitive dependencies resolved as of a fixed date (npm --before), so two runs install
//     the same tree whatever day they run on; the tree is hashed into every record either way
//   - an empty install prefix per server, so no dependency bleeds between servers
//   - --ignore-scripts, so no install-time code executes
//   - a scrubbed environment, so the process cannot read the operator's real credentials
//   - canary placeholders in every declared credential slot, so leaks are detectable
// Limitations are recorded in every result record rather than papered over.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { ROOT, sha256 } from './lib.js';

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
  // POSIX layout: <prefix>/bin/node beside <prefix>/lib/node_modules/npm.
  const posix = path.join(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (fs.existsSync(posix)) return posix;
  throw new Error('cannot locate npm-cli.js');
}

// npm decides how the tree resolves, so its version is recorded beside every run.
export function npmVersion() {
  try { return JSON.parse(fs.readFileSync(path.join(path.dirname(npmCli()), '..', 'package.json'), 'utf8')).version; }
  catch { return null; }
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

// How transitive dependencies resolve. The server package is pinned exactly, but almost nothing
// under it is: --no-package-lock means every semver range resolves to whatever is newest at install
// time. @smartbear/mcp@0.34.0 measured 125,005 tokens on 2026-08-13 and 123,849 on 2026-10-25 with
// no change to the server, because zod, which its tool schemas are written in, had moved from
// 4.4.3 to 4.6.7. A pinned version is not a pinned artifact.
//
// So the default resolves the tree as of the moment the cohort was pinned (npm --before), which
// makes a re-run on any later day install what the original run installed. 'float' keeps the old
// behaviour, for measuring what someone installing the pinned version today would get.
export function dependencyResolution(cohort, requested = process.env.DEPS_AS_OF) {
  if (requested === 'float') return { policy: 'float', before: null };
  const raw = requested || cohort.built_at;
  const t = new Date(raw);
  if (!raw || Number.isNaN(t.getTime())) throw new Error(`DEPS_AS_OF must be an ISO timestamp or 'float' (got "${raw}")`);
  return { policy: 'as-of', before: t.toISOString() };
}

export async function install(server, { timeoutMs = 240000, before = null } = {}) {
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
  if (before) args.push(`--before=${before}`);
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

// The installed tree, read off disk rather than from `npm ls`: this is what node actually loads,
// it does not depend on npm's output format or version, and it does not exit non-zero over a
// missing peer. Every package directory under node_modules, nested ones included, as
// name@version. npm versions are immutable, so the sorted set identifies the code that ran; the
// layout npm chose for it is left out, so a different hoisting does not read as drift. A package
// installed under an alias is recorded as alias=name@version.
export function dependencyTree(dir) {
  const found = new Set();
  const visit = (nm) => {
    if (!fs.existsSync(nm)) return;
    for (const e of fs.readdirSync(nm, { withFileTypes: true })) {
      if (e.name.startsWith('.') || !e.isDirectory()) continue;
      if (e.name.startsWith('@')) {
        for (const s of fs.readdirSync(path.join(nm, e.name), { withFileTypes: true })) {
          if (s.isDirectory()) pkgAt(path.join(nm, e.name, s.name), `${e.name}/${s.name}`);
        }
      } else pkgAt(path.join(nm, e.name), e.name);
    }
  };
  const pkgAt = (p, dirName) => {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(p, 'package.json'), 'utf8'));
      const id = `${pkg.name || dirName}@${pkg.version ?? '?'}`;
      found.add(pkg.name && pkg.name !== dirName ? `${dirName}=${id}` : id);
    } catch { found.add(`${dirName}@?`); }
    visit(path.join(p, 'node_modules'));
  };
  visit(path.join(dir, 'node_modules'));
  const packages = [...found].sort();
  return { hash: sha256(packages.join('\n')), count: packages.length, packages };
}

// What the server's own declared dependencies resolved to, found the way node finds them: the
// nearest node_modules walking up from the server package. The full tree says *whether* anything
// moved; this says, for the usual suspects, *what*.
export function directDependencies(server, dir) {
  const pkgDir = path.join(dir, 'node_modules', ...server.npm_package.split('/'));
  let pkg;
  try { pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')); } catch { return null; }
  const declared = { ...(pkg.optionalDependencies || {}), ...(pkg.dependencies || {}) };
  const out = {};
  for (const name of Object.keys(declared).sort()) {
    let resolved = null;
    for (let cur = pkgDir; cur.startsWith(dir); cur = path.dirname(cur)) {
      try {
        resolved = JSON.parse(fs.readFileSync(path.join(cur, 'node_modules', ...name.split('/'), 'package.json'), 'utf8')).version;
        break;
      } catch { /* not at this level */ }
      if (cur === dir) break;
    }
    out[name] = { declared: declared[name], resolved };
  }
  return out;
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
