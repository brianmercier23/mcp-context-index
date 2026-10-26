# Method

How a number in this index is produced, and what it is not.

## The measurement

Each server in the cohort is installed from npm at an exact pinned version, into its own empty
prefix, with `--ignore-scripts`, and with its dependencies resolved as they stood when the cohort
was pinned (see [Dependency resolution](#dependency-resolution)). It is launched over stdio under a scrubbed environment with
canary placeholders in every declared credential slot, from inside its own sandbox directory.

The harness then runs one MCP session against it:

1. **Handshake.** Probe `server/discover` (protocol 2026-07-28 and later). Fall back to
   `initialize` (2025-11-25 and earlier) on anything that is not a definitive modern answer, which
   is the order the specification gives for stdio. Record which one answered.
2. **`tools/list`**, paginated to exhaustion.
3. **The same list again, in the same session.** A list that differs from itself is a
   resource-synchronisation fault.
4. **`prompts/list` and `resources/list`** where the server advertises them.
5. **Deliberately malformed calls** against up to three read-only tools, chosen by sorted name so
   the choice is identical on every run: one omitting a required argument, one supplying a
   required argument of the wrong type.
6. **A second cold session**, from a fresh process, repeating the measurement.

The primary metric is the token count of the tool-definition array returned by `tools/list`:
each entry `{name, description, inputSchema}`, plus `outputSchema` where a tool declares one,
key-sorted so that two structurally identical lists always tokenise identically. That is the fixed
context tax a conversation pays for having the server connected.

Tokenizer: `gpt-tokenizer`, `o200k_base`. Token counts are tokenizer-dependent; a different
tokenizer produces different absolute numbers and very similar ratios.

## Both protocol eras produce the same signal set

The 2026-07-28 specification retired the `initialize` handshake. A harness that only spoke the
retired protocol would eventually record migrated servers as broken servers — attributing to the
server a failure caused by the instrument. That is the one misattribution this project cannot
afford, so the probe speaks both eras.

The two paths are not assumed to agree; they are tested. `harness/test/fixtures/dual-era.mjs` is
one server, one tool registration, served both ways, and the test asserts that the tool-definition
token count, the per-tool median and the heaviest tool are identical whichever handshake was used.
The measurement is `tools/list` output either way.

## Failure attribution

Roughly a third of a cohort will not start under a clean environment. `connect_failed` on its own
is useless to a buyer, so every failure is classified against `rubric/failure-classes-*.json` and
tagged with an owner:

- **server** — it genuinely will not run in this condition: refuses placeholder credentials,
  demands an undocumented config value, exits silently, or answers neither handshake
- **harness** — caused by a deliberate choice here, usually `--ignore-scripts` suppressing a
  postinstall binary download. Never reported as a defect of the server.
- **environment** — the host or the network at run time, attributable to neither side

Classification is diagnostic. It feeds no score and sits outside the config hash, so the patterns
can be improved without invalidating measurement history. The first sweep reported a 30% failure
rate; tracing four failures to the harness's own environment handling brought it to 26%, split by
owner. Reporting the unsplit number would have been wrong.

## Measurement and interpretation are separate files

A signal is a measurement and never changes. A grade is a reading of it and changes whenever the
rubric does.

- `results/runs.jsonl` — what was measured. Append-only. Never rewritten.
- `results/scores.jsonl` — what a given rubric made of it. Append-only. A single run can carry
  several scorings.
- `results/reproducibility.jsonl` — the verdict of comparing two runs under an identical config
  hash. Append-only, including the verdicts that were later found to be wrong.

`npm run rescore` re-applies any rubric to stored signals without re-probing anything. Rubric
1.1.0 was authored this way and applied to the entire history in seconds. Re-scoring never writes
back into `runs.jsonl`: a re-score produces no new measurement and shares no config hash, so it
must never become comparable to a run inside the reproducibility log.

## The config hash

Two runs are comparable only if their config hash matches. It covers the harness version, the
rubric, the tokenizer, the cohort selection hash, the sandbox model, the date dependencies are
resolved as of, the Node major version, the platform, the versions of both MCP client libraries,
and the probe timeouts.

Changing the rubric changes the hash even when nothing measured changes. That is deliberate: the
hash covers the rubric wholesale rather than guessing which parts of it are inert, which is the
safer error. Re-establishing a lineage after such a change costs one unattended pair.

## The reproducibility gate

Two full sweeps of the identical pinned cohort, compared server by server on tool-definition
tokens. The gate is 95% of measured servers stable or within 0.5%. Every pair so far has come
back at 100% stable — byte-identical, with the tolerance band never used.

The comparator refuses to compare two runs whose recorded rubrics differ, and reads its rubric
from the run headers rather than from an environment default. It used to read a default, and
stamped the wrong rubric id onto one record; see [PROVENANCE.md](PROVENANCE.md).

What the gate certifies is that the instrument agrees with itself. The two sweeps of every pair in
the log started within twenty minutes of each other, so they installed the same code whatever the
install policy was, and a pair can never see something that changes between days. That is the job
of the dependency pin below, and of the tree hash on every record.

## Dependency resolution

A pinned server version is not a pinned artifact. The server package is installed at an exact
version, but nearly everything beneath it is a semver range, and npm resolves a range to the
newest matching release on the day it runs. Until harness 0.1.5 every install did exactly that, so
a re-run measured the pinned server on top of whatever its dependencies had since become.

That was not hypothetical. `@smartbear/mcp@0.34.0` measured 125,005 tool-definition tokens in the
published run and 123,849 when re-run on 2026-10-25, with no change to the server: zod, which its
tool schemas are written in, had moved from 4.4.3 to 4.6.7 inside the `^4.3.6` range the package
declares. The same zod release moved `sharedoc-mcp@2.1.4` from 877 to 870.
[PROVENANCE.md](PROVENANCE.md) names the runs.

Two readings are defensible, and they answer different questions:

- **The pinned artifact**: the server version together with the dependency tree it resolved to
  when the cohort was pinned. The same answer whenever it is asked.
- **What installing that version today gets you**: the same server version on the newest
  dependencies. A different answer from month to month, for reasons that are not the server's.

**The index measures the pinned artifact.** Dependencies resolve as they stood at the moment the
cohort was pinned, the cohort file's `built_at` (2026-08-11T02:17:26.746Z for `dev-tooling-v1`),
through npm's `--before`. A re-run on any later day installs what the original run installed.

The reasons, heaviest first:

1. **It is the only reading under which a pin means anything.** The index is a photograph with a
   date on it, and the version-drift report says what has moved since. A floating tree lets the
   photograph change while its date stays the same, which is exactly what happened.
2. **The gate cannot police the other reading.** A same-day pair resolves the same tree twice, so
   under floating dependencies six consecutive GO verdicts were true and still said nothing about
   whether a re-run next month would agree. The smartbear difference was found by a cross-day
   comparison, outside the gate.
3. **The floating reading is a configuration few installs are in.** Someone installing today
   without naming a version gets the latest release, which the drift report already tracks. The
   floating measurement pairs the pinned release with dependencies it was never measured on; only
   a user who pins an old version and reinstalls it gets that combination.

What it costs:

- **A dependency release that changes what users see does not reach the index** until the cohort
  is re-pinned. That is the definition working, and it is still a limit.
- **`--before` cannot recover an unpublished version.** If a version that resolved at the pin is
  later removed from npm, npm resolves the newest remaining one, or fails the install if none is
  left; the tree hash or the `install_failed` record shows which. The same holds for the server
  itself: `makers-page-mcp` was unpublished outright on 2026-08-26, and its published number can
  no longer be reproduced by anyone, under either policy.
- **npm's resolver is an input.** Each run header records the npm version. Trees also differ across
  platforms by design, through platform-specific optional packages (`@rollup/rollup-linux-x64-gnu`
  on Linux, for one); the platform is already in the config hash.
- **Runs before harness 0.1.5 floated and recorded no tree.** Each resolved as of its own start
  time, and which tree that was cannot be recovered from the log. What the log does show is that
  every full sweep from 2026-08-11 03:07 to the published run on 2026-08-13 measured every server
  identically, so whatever moved inside that window moved nothing that was measured.

`DEPS_AS_OF=float` restores the old behaviour, for anyone who wants the other reading, and
`DEPS_AS_OF=<ISO timestamp>` resolves as of any other moment. Either changes the config hash, so
neither can be paired with a run resolved as of the pin.

Every server record carries `install.dependency_tree`: a SHA-256 over the sorted `name@version` of
every package installed, nested copies and the server itself included, the package count, and what
each of the server's own declared dependencies resolved to. The full lists are in
`results/dependency-trees.jsonl`, one record per distinct tree, so a sweep that installs the trees
the last one did adds nothing there. The tree is read off disk rather than from `npm ls`: it is
what node loads, and it does not depend on npm's output format. Layout is left out, so a different
hoisting of the same versions does not read as drift.

Reading two records of one server against each other:

- **Same tree hash**: the same code ran, the server included. A difference is the network, the host
  or the instrument.
- **Different installed server version**: a server change.
- **Same server version, different tree hash**: dependency drift is a candidate, and the two lists
  say which packages moved. It is a reason to look, not a finding. Between the pin and
  2026-10-25, 17 packages moved under `@postman/postman-mcp-server@2.11.2` and its number did not.

## Isolation model, stated honestly

There is no container runtime on the build host. This is **isolation, not a security sandbox**:

- pinned exact versions with dependencies resolved as of the pin, so two runs install identical
  code whichever day they run, and a hash of the installed tree on every record to prove it
- a fresh empty prefix per server, so nothing bleeds between servers
- `--ignore-scripts`, so no install-time code executes
- a scrubbed environment, so the server process cannot see the operator's real credentials
- canary placeholders in every credential slot, so leaks are detectable
- npm driven through `npm-cli.js` under the same node binary, so no shell ever interprets a
  third-party package name

**Network egress is not blocked.** A server can reach its own API during startup. That is the
expected source of any run-over-run instability, and the reproducibility report names those
servers individually rather than absorbing them into an average. Local endpoint protection is
also an uncontrolled input: an antivirus rule changed mid-spike and altered one server's
conditions. Containerised egress control is the next hardening step and is not done.

Two findings came out of getting this wrong first. Under an early version that launched servers
from the harness root, one server downloaded a Windows binary into four directories there, and
another wrote an `audit.log` recording every tool invocation with full arguments. Both would have
landed in a user's project directory. A probe that is not isolated measures its own contamination.

## Explicitly not measured

- **Per-call response token cost against live data.** Requires real credentials, which the harness
  never holds.
- **Runtime latency.** Not reproducible on a shared desktop under variable load.
- **Correctness of tool output.** Requires ground truth per server.
- **Remote-only servers** (streamable-http or SSE with no installable package). Recorded as
  skipped, with a reason.
- **Anything requiring a model in the loop.** The rubric is deliberately inference-free so the
  numbers are deterministic. A model-judged layer is wanted and deferred, so its variance can be
  measured against a baseline that has been stable across repeated pairs.
- **Protocol conformance beyond the handshake.** Which era answered is recorded; extensions,
  multi-round-trip requests, caching hints, tasks, and whether a modern server also still serves
  legacy clients are not.

## Version drift, and why the sweep is not on a schedule

Re-running the pinned cohort produces byte-identical numbers by design, so re-measuring nightly
would burn machine time to reprint the same index. What changes is the registry underneath it.
(Before harness 0.1.5 that design had a hole: dependencies floated, so "the same index" was only
guaranteed on the same day. See [Dependency resolution](#dependency-resolution).)

`npm run watch` checks npm metadata for every pinned package — no install, no execution, a few
seconds — and reports which versions have been passed, which pinned versions have been unpublished,
and which latest versions carry a deprecation notice. It appends to `results/versions.jsonl` on the
same append-only contract as everything else, and writes the drift report published beside the index.

The watcher reads server versions only. Dependency releases under a pinned server are invisible
to it, and since harness 0.1.5 they do not reach the index either.

It deliberately does not re-probe. It prints the exact `ONLY=` command to re-measure just the movers,
because spending twenty minutes of machine time is a decision rather than a side effect. It also does
not re-select the cohort: a server entering or leaving the top 50 by downloads changes the selection
hash, which makes a new cohort, not drift within this one.

A re-probe of movers is a partial sweep. It is flagged `partial_sweep` in the log and can never be
published as an index — that guard exists so a three-server spot check cannot be mistaken for one.

## Cohort selection

Servers are ranked by npm downloads within a vertical defined in `rubric/verticals-*.json`, from a
dated registry snapshot, and pinned. Selection is versioned because selection is part of the
method: change the criteria and you change the cohort, which changes every aggregate.

This makes the cohort a sample of **what a buyer plausibly has installed**, which is the
population an audit is sold against. It does not make it representative of the registry, and it
must never be described as such.

## Remote endpoints (the commerce index)

The commerce index measures servers that run on someone else's infrastructure, so three things
change and the rest does not.

- **Nothing is installed.** The probe connects over Streamable HTTP to the endpoint a store's
  `/.well-known/ucp` or `/.well-known/poppy.json` manifest names. Same client stacks, same era
  order (`server/discover` first, then `initialize`), same `tools/list` measurement, same rubric.
- **No tool is ever called.** The dev-tooling index sends deliberately malformed calls to measure
  error legibility. Against a checkout endpoint that is still a call, so it is not made. The
  dimension is unmeasured and drops out of the weighting. Auth hygiene signals that depend on a
  local install (argv secrets, canary leaks) are likewise unmeasured.
- **Name collisions are not scored.** In a shared protocol, two implementations exposing
  `create_checkout` is the design, not a defect.

Requests are sequential, paused between endpoints, and carry a User-Agent naming the project.
Remote runs have their own config hash (it records `transport: streamable-http`) and their own
log, `results/remote-runs.jsonl`, so they can never be compared with a stdio run.

Failures are classified from the error each handshake attempt returns: `auth_required` (reported,
not a defect: both protocols permit gating `tools/list`), `rate_limited`, `not_an_mcp_endpoint`,
`invalid_protocol_version`, `invalid_tool_schema` and `no_handshake_response`.
