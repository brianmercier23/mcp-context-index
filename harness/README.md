# mcp-probe

A reproducible measurement harness for MCP server quality and token cost.

Spike build, 2026-08-10. Scope: ~50 servers, one vertical, deterministic signals only.
The question this spike answers is **not** "how many servers can we cover" — it is
**"does the same server measure the same twice?"** Coverage is worthless from an instrument
that disagrees with itself.

## Why it exists

Roughly 21,000 servers in the official MCP registry (2026-08-11 snapshot, 69,977 published
version rows), no independent quality signal on any of them, published findings that 100% of a
201-server sample carried at least one defect and that token cost varies 440x for equivalent
capability. The registry is still in preview with data resets expected. Whoever holds a trusted
independent index when it stabilises holds the reference position — and the same instrument that
builds the index is what prices a token-diet audit.

## What it measures

Per server, from a real MCP session against a pinned sandboxed install:

- **Token cost** — tool-definition tokens (the primary metric), median and max per tool, total
  context injection including server instructions, prompts and resources
- **Schema clarity** — description coverage on tools and parameters, schema validity, untyped
  parameter rate, description length
- **Error legibility** — deliberately malformed calls against up to three read-only tools:
  structured or not, names the offending parameter or not, stack-trace leakage, error token cost
- **Collision risk** — generic names, namespacing, and names shared with other servers in the cohort
- **Injection surface** — directive text aimed at the model, invisible Unicode, embedded URLs
- **Auth hygiene** — declared secrets, secrets passed via argv, canary leak detection, and whether
  the server can be inspected at all without live credentials
- **Protocol era** — which handshake the server answered: the 2026-07-28 `server/discover`
  exchange, the 2025 `initialize` handshake, or neither

Plus pass/fail against the observable subset of the 29 fault types in arXiv 2603.05637.

No model is in the loop. Every number is a count, a ratio, or a token count over a key-sorted
serialisation. See `rubric/rubric-v1.0.0.md` for why.

## Layout

```
rubric/
  rubric-v1.1.1.json      current. corrects the published metric definition; changes no number
  rubric-v1.1.1.md        the delta: two documentation defects, and what is still open
  rubric-v1.1.0.json      adds grade caps and defect counting; no signal or band changed
  rubric-v1.1.0.md        the delta: what 1.1.0 adds and the arguments against it
  rubric-v1.0.0.json      the executable rubric: weights, bands, fault taxonomy, patterns
  rubric-v1.0.0.md        the human companion: what each dimension is for, and the arguments against
  verticals-v1.0.0.json   cohort selection criteria, versioned because selection is part of the method
  failure-classes-v1.1.0.json  why a server failed to start, and whose fault it is (diagnostic, not scored)
  failure-classes-v1.0.0.json  superseded; kept because earlier records name it
src/
  snapshot.js   crawl the MCP registry -> dated, pinned snapshot
  cohort.js     snapshot + vertical spec + npm metadata -> pinned cohort of N servers
  sandbox.js    isolated install, entrypoint resolution, scrubbed launch plan, canary injection
  probe.js      the fixed probe suite: one MCP session per era, deterministic measurements
  analyze.js    session -> flat signal set (pure function)
  score.js      generic band evaluator driven entirely by the rubric file
  run.js        orchestrator -> append-only JSONL
  reproduce.js  the go/no-go: compare two runs under an identical config hash
  rescore.js    re-read history under a different rubric, without re-probing anything
  report.js     latest full sweep -> markdown index
  watch.js      npm metadata only -> which pinned versions moved, and what to re-probe
data/           registry snapshots and pinned cohorts
results/        runs.jsonl, scores.jsonl and reproducibility.jsonl, all append-only
docs/           generated index
sandbox/        transient per-server installs (gitignored, deleted after each server)
test/           fixture servers for both protocol eras, and the era-probe tests
publication/    sources for the public repo: README template, METHOD, PROVENANCE, LICENSE
scripts/        verify-pair.ps1 (unattended reproducibility pair), build-publication.mjs
```

## Use

```bash
npm install
npm test                              # fixture tests: both eras, and that they measure identically
npm run snapshot                      # ~2 min, writes data/registry-snapshot-<date>.json
npm run cohort                        # writes data/cohort-dev-tooling-v1.json
npm run run                           # full sweep, appends to results/runs.jsonl
npm run run                           # again — reproducibility needs two
npm run reproduce                     # GO / NO-GO
npm run report                        # docs/index-dev-tooling-v1.md

npm run rescore                       # re-read the whole log under a newer rubric, no re-probing
npm run watch                         # metadata-only: which pinned versions moved on npm
```

Environment overrides: `VERTICAL`, `COHORT_SIZE`, `COHORT`, `RUBRIC`, `LIMIT`, `ONLY`, `RUN_NOTE`,
`KEEP_SANDBOX=1`, `CONNECT_MS`, `CALL_MS`, `DISCOVER_MS`, `RUN_A`/`RUN_B` (reproduce),
`RUN_ID` (report, rescore), `FORCE=1` (rescore, to repeat a scoring already in the log).

## Two protocol eras

The specification published 2026-07-28 retired the `initialize` handshake, replacing it with
per-request `_meta` and a `server/discover` RPC that servers **MUST** implement. A harness that
spoke only the retired protocol would record migrated servers as broken servers — attributing to
the server a failure caused by the instrument, which is the one misattribution the failure-class
split exists to prevent.

So the probe speaks both, in the order the specification gives for stdio: `server/discover` first,
`initialize` on anything that is not a definitive modern answer. Which one answered is recorded
per server, so the log doubles as the record of who migrated when.

The two eras run on different libraries — `@modelcontextprotocol/client` 2.x for the modern era,
`@modelcontextprotocol/sdk` 1.x for the legacy one, since the 1.x line does not implement the
stateless core — and both versions are inside the config hash. The legacy path is byte-for-byte
the one four consecutive reproducibility pairs were measured on, deliberately untouched.

That the two paths measure identically is a test, not a promise: `test/fixtures/dual-era.mjs` is
one server served both ways, and `npm test` asserts the token counts match.

## Measurement and interpretation are separate

A signal is a measurement and never changes. A grade is a reading of it and changes whenever the
rubric does. Keeping those in one file would mean re-probing 50 servers to answer "what would this
have graded under the new rules", which is both slow and a lie — the servers may have moved since.

So `npm run rescore` re-applies any rubric to the stored signals and appends to
`results/scores.jsonl`. Nothing is re-probed, nothing is rewritten, and a single run can carry
several scorings at once. Scores never go back into `runs.jsonl`: a re-score produces no new
measurement and shares no config hash, so it must never become comparable to a run inside the
reproducibility log. The report names both rubrics on its first line — the one the run was
measured under, and the one it is scored under.

Rubric 1.1.0 was authored this way and applied to the entire history in seconds. It changed no
dimension, weight, band or signal; it added a grade cap on token cost and a defect count reported
beside the grade. `rubric/rubric-v1.1.0.md` has the reasoning and the case against.

A sweep of 50 servers takes roughly 25 minutes, dominated by npm install time.

## Scheduled automation, and how to remove it

One scheduled task exists on the workstation this harness was built on:

| | |
|---|---|
| Name | `MCP Context Index Watch` |
| When | daily, 8:15 AM, `StartWhenAvailable` |
| Runs | `scriptswatch-daily.ps1` -> `npm run watch` |
| Does | npm metadata check, appends `results/versions.jsonl`, rewrites the drift report, writes `results/last-watch.txt` |
| Does NOT | install, execute any server, re-probe, re-pin the cohort, or push anything public |

Publishing an updated drift report stays manual on purpose: `node scripts/build-publication.mjs`,
then commit and push. An automation that publishes to a public repo with no human in the loop is a
different risk class from one that writes a local file.

**Delete this task when the harness moves to a Linux box.** It points at an absolute workstation
path and will fail silently, or worse keep succeeding against a stale checkout, once the sweep
lives somewhere else. On Linux the same thing is a cron line and belongs there instead.

```powershell
Unregister-ScheduledTask -TaskName "MCP Context Index Watch" -Confirm:$false
```

## Append-only, and why

`results/runs.jsonl` is never rewritten. Every run appends one header record and one record per
server. That makes the interesting question answerable: not "what is this server's score" but
"what changed since last time" — which is the actual product when the registry underneath is in
preview and expected to reset.

Collision risk and scoring are properties of the whole cohort, so canonical records are finalised
only when the sweep ends. To make a crash survivable, each server's unscored record is streamed to
`results/partial/<run_id>.jsonl` the moment it completes. That side file is recovery material, not
part of the canonical log, and readers ignore it.

## Isolation model, stated honestly

There is no container runtime on the build host. This is **isolation, not a security sandbox**:

- pinned exact versions, so two runs install identical code
- a fresh empty prefix per server, so nothing bleeds between servers
- `--ignore-scripts`, so no install-time code executes
- a scrubbed environment, so the server process cannot see the operator's real credentials
- canary placeholders in every credential slot, so leaks are detectable
- npm is driven through `npm-cli.js` under the same node binary, so no shell ever interprets a
  third-party package name

**Network is not blocked.** A server can reach its own API during startup. That is the expected
source of any run-over-run instability, and the reproducibility report names those servers
individually rather than absorbing them into an average. Before this scales past a spike, it
should run inside a container with egress control.

## Failure attribution

Roughly a third of this cohort will not start under a clean environment. "connect_failed" alone
is useless to a buyer, so every failure is classified against
`rubric/failure-classes-v1.0.0.json` and tagged with an owner:

- **server** — it genuinely will not run in this condition (refuses placeholder credentials,
  requires an undocumented config value, exits silently with no diagnostic)
- **harness** — caused by a deliberate choice here, usually `--ignore-scripts` suppressing a
  postinstall binary download. Never reported as a defect of the server.
- **environment** — the host or the network at run time, attributable to neither side

Classification is diagnostic. It feeds no score and sits outside the config hash, so the
patterns can be improved without invalidating the measurement history.

## Known limits

Listed in full in the current rubric under `explicitly_not_measured`. The short version: no
live-credential calls, no latency, no output correctness, no remote-only servers, no model
judgement, and no protocol conformance beyond which handshake answered. The cohort is ranked by npm downloads and is therefore **not a random sample of the
registry** — it is a sample of what a buyer plausibly has installed, which is the population an
audit is sold against, but it must never be described as representative.
