# Provenance and corrections

Every correction this project has made to itself, and to the published sources it was built on.
It is published because a measurement log you can quietly clean up is not evidence of anything —
and because the errors below are the specific reasons to trust the numbers that survived them.

The measurement logs in `results/` are append-only. Nothing here was fixed by editing a record.
Where a record is wrong, the wrong record stays and the correction is prose.

---

## Corrections to this project's own instrument

### The comparator produced a clean-looking verdict over an empty set

The reproducibility comparator originally auto-paired runs on config hash plus cohort size. Two
one-server lock tests of *different* servers satisfied both conditions, overlapped on nothing, and
produced a confident `NO-GO` over an empty intersection.

Pairing now requires an identical server set, and an empty overlap returns `INSUFFICIENT-DATA`
rather than a verdict. **The bogus record is still in `results/reproducibility.jsonl`**, between
two real verdicts. This paragraph is the correction.

### The comparator disagreed with the runs about which rubric produced them

`reproduce.js` loaded its rubric from `process.env.RUBRIC || 'rubric-v1.0.0.json'` — an
environment default — rather than from the runs it was comparing. It printed and recorded
`mcp-server-quality@1.0.0` for a pair measured under 1.1.0.

The gate thresholds are identical in both rubrics, so **no verdict, count or classification was
affected**. What was wrong was the provenance label stamped into an append-only record, which is
not cosmetic: a comparator that can disagree with the runs about which rubric produced them will
eventually attach the wrong provenance to a published claim.

Fixed by reading the rubric from the run header, and by refusing outright to compare two runs
whose recorded rubrics differ. `results/reproducibility.jsonl` holds two records for that pair —
the mislabelled one and the corrected one, in that order. Both stay.

### The comparator checked the config hash only when it chose the pair itself

Auto-pairing has always required an identical config hash. Naming two runs with `RUN_A`/`RUN_B`
skipped that check: the comparator compared any two runs whose rubrics matched and stamped the
first run's hash on the verdict. That mattered more once harness 0.1.5 put the dependency
resolution date in the hash, since a floating run and an as-of run of the same servers would have
produced a verdict. It now refuses.

Testing that fix found a second hole. Run ids have minute resolution, so two short runs of one
config started in the same minute shared an id. Every reader groups records by run id, so the two
runs merged, and the comparator read the result as one run compared with itself, and said GO. Run
ids are now unique within a log: a run whose id is already taken, by a header or by the partial
file of a sweep that died before writing one, gets the next free `-2`, `-3` suffix. The comparator
also refuses a pair whose two sides carry the same id, for any log written before that.

Neither defect produced a record. All nine verdicts in `results/reproducibility.jsonl` pair two
distinct runs under one config hash, and no two run headers in either log share an id, so the
suffix rule gives every existing run the id it already has. A test checks that against both logs.

### The published metric definition understated what the instrument counts

The rubric's `primary_metric_definition` described the tool-definition payload as
`{name, description, inputSchema}`. The harness has always also included `outputSchema` for tools
that declare one. Four fields, not three.

No measurement was wrong and no published number moved. What was wrong is that the document
defining the metric disagreed with the code producing it — the same class of defect as the rubric
mislabel above, and the document is precisely what this project publishes to be attacked. Fixed in
rubric 1.1.1, which changes no dimension, weight, band, signal, cap or defect rule: every score
under 1.1.1 is numerically identical to the same score under 1.1.0 and 1.0.0.

### The config hash did not cover the MCP client library

The hash covered the harness version, rubric, tokenizer, cohort, sandbox model, Node major,
platform and probe timeouts — but not the MCP client the measurement ran through. That was
harmless while there was exactly one client, and became an uncontrolled input the moment the
harness gained a second one for the 2026-07-28 protocol era: two runs could have differed in which
library measured them and still hashed identically. Both client versions entered the hash in
harness 0.1.4, before any run depended on the distinction.

### A pinned version did not pin what was installed

The harness installed every server at an exact version, with `--no-package-lock`. Everything
beneath the server therefore resolved to the newest release inside its semver range on the day of
the install. The README said "Re-running the pinned cohort reproduces the numbers." On the day of a
run that was true. A month later it was not guaranteed, and for two servers it had stopped being
true.

`@smartbear/mcp@0.34.0` was published at **125,005** tool-definition tokens, from
`run-2026-08-13-0208-7936eadf`. A spot check on 2026-10-25, outside the log, measured 123,849, with
43 of its 149 per-tool counts different. `@postman/postman-mcp-server@2.11.2`, checked the same way
on the same machine, reproduced exactly at 33,553, so the host was not the explanation.

The cause was then confirmed in the log: three partial sweeps of those two servers, back to back on
one Linux host under harness 0.1.5, identical except for the date dependencies were resolved as of.

- `run-2026-10-25-2354-a2e3f42d`, dependencies floating, as in every run before 0.1.5:
  **123,849**, on zod 4.6.7 and `@modelcontextprotocol/sdk` 1.32.2.
- `run-2026-10-25-2355-039f8070`, resolved as of the cohort pin (2026-08-11T02:17Z): **125,005**,
  on zod 4.4.3 and SDK 1.30.0.
- `run-2026-10-25-2356-5a42ad54`, resolved as of the published run's start (2026-08-13T02:08Z):
  **125,005**, on the same zod and SDK.

Postman measured 33,553 in all three. Resolved as of either August date, all 149 of smartbear's
per-tool counts match the published run. Floating, the same 43 differ as in the spot check, by
1,156 tokens in total. The server code is identical in all three runs, and 70 of the 210 packages
beneath it moved. Swapping zod alone from 4.4.3 to 4.6.7 into the August tree reproduces the whole
1,156-token difference, and swapping the SDK alone changes nothing; that swap was a scratch
experiment and is not in the log. The package's tools declare their input schemas as zod objects,
and those are serialised to JSON Schema when `tools/list` is answered, so a zod release that
changes the serialisation changes the server's token count without a line of the server changing.
The package asks for `zod: ^4.3.6`, which 4.6.7 satisfies.

It was not the only one. To find the scope, both policies were run over the whole cohort on
2026-10-26, on the same host, outside the log: a Linux full sweep must not become the published
index by being the latest one in it. Of the 38 published numbers, the run resolved as of the pin
reproduced 34 exactly. The floating run reproduced 32: it missed the same four, and two more,
which are the only two numbers that moved between the policies. The second was then logged the
same way as the first:

- `sharedoc-mcp@2.1.4`, published at **877**: `run-2026-10-26-0013-a2e3f42d`, floating, measured
  870; `run-2026-10-26-0013-039f8070`, resolved as of the pin, measured **877**. One tool moved,
  `reset_shared_doc_password`, from 95 to 88. The cause is the same zod release, inside the
  package's `^4.4.0`: swapping zod alone into the pinned tree reproduces the 7 tokens, and
  swapping the SDK alone does not (a scratch experiment, like the smartbear one).

The four published numbers neither full sweep reproduced are not dependency findings.
`@gitkraken/gk`, `containerization-assist-mcp` and `ainative-zerodb-memory-mcp` would not start
on the Linux host under either policy, which makes it a host difference. `makers-page-mcp` was
unpublished from npm on 2026-08-26 and cannot be reinstalled by anyone; the drift report already
says so. Those four are unchecked for drift, not cleared of it.

**No published number changes.** 125,005 and 877 are what the pinned artifacts measure, and they
still do. What was wrong was the promise that anyone re-running the cohort would get them, which
depended on when they ran it. The same-day reproducibility gate could not have caught this: the two sweeps of
every pair in the log started within twenty minutes of each other and installed the same tree
twice. Six GO verdicts were real, and certified the instrument against itself on a given day, not
the install against the calendar.

Postman shows the other half. Seventeen packages beneath it moved between the pin and the floating
run, and its number did not. A changed tree is a reason to look, not proof of drift.

Fixed in harness 0.1.5:

- Dependencies resolve as of the cohort's pin date through `npm install --before`, so a re-run on
  any later day installs the tree the cohort was pinned with. The policy, and the case for the
  other one, is in [METHOD.md](METHOD.md#dependency-resolution). `DEPS_AS_OF=float` keeps the old
  behaviour, under its own config hash.
- Every server record carries a hash of its installed tree and the versions its own declared
  dependencies resolved to. The full lists are in `results/dependency-trees.jsonl`. The
  comparator reports a tree change beside a number change.
- The harness could not install anything on Linux: it looked for `npm-cli.js` only where Windows
  puts it. The five runs above are the first in either log from a Linux host.

Runs before 0.1.5 recorded no tree, and which tree each of them installed cannot be recovered. What
the log does show is that every full sweep from 2026-08-11 03:07 to the published run measured
every server identically, so whatever moved inside that window moved nothing that was measured.
Those records stay as written.

### A re-probe command that re-measured the old version

The version-drift report, and METHOD.md, said `ONLY="<movers>" npm run run` would re-probe the
servers that had moved past their pin. It could not: `ONLY=` narrows a run to those servers but
installs each one at the cohort's `pinned_version`, so it measured the release that had already
been measured. Under harness 0.1.5, which also resolves dependencies as of the pin, it reproduced
the published number exactly and measured nothing new. Nobody ran it, so no record in the log
claims to describe a newer version.

Fixed in harness 0.1.6: `VERSION_OVERRIDE="<package>@<version>,..."` probes servers at the version
named, with dependencies resolved as of that version's publish time, records the overrides in the
run header and config hash, and always flags the run `partial_sweep`. The drift report now prints
that command. See [METHOD.md](METHOD.md#version-drift-and-why-the-sweep-is-not-on-a-schedule).

### A 30% failure rate that was really 26%

The first sweep reported that 30% of the cohort would not start. Four of those failures traced to
the harness's own environment handling — `--ignore-scripts` suppressing a postinstall binary
download — not to the servers. Reporting the unsplit number would have been wrong. Every failure
is now classified by owner: server, harness, or environment.

### A probe that measured its own contamination

An early harness version launched each server from the harness root. One server downloaded a
Windows binary into four directories there; another wrote an `audit.log` recording every tool
invocation with full arguments. Both behaviours are real findings about those servers — neither is
documented in its registry entry, and both would land in a user's project directory — but they were
observed because the probe was not isolated. Every server now launches inside its own sandbox.

### Two named environmental flakes, stated rather than absorbed

Two servers have flipped between `probed` and `install_failed` between runs, and neither has ever
produced a different measurement when it was measured.

- **`coldstart`** — the sandbox directory could not be cleared at teardown, which on this host
  means an endpoint-protection scanner still held a handle on it. Measured value, every time it
  was measured: 3,878 tokens. It has failed in each of the last four sweeps, so it currently sits
  outside the measured set entirely rather than flickering in and out of it.
- **`evidrift`** — one failed `npm install` in eleven attempts. Measured value, every one of the
  other ten times: 467 tokens.

Both are environment artifacts, not measurement drift. They are named in every report rather than
averaged into a stability percentage, and they are the concrete argument for the containerised
egress and install control that this harness does not yet have: local endpoint protection is an
uncontrolled input to the measurement, and it has now been observed acting as one twice.

---

### The first commerce runs filed every failure under one class

The remote failure classifier first read only the session error, which carries the response body
but not the HTTP status. Run `run-2026-10-25-1456` therefore records all 11 of its failures as
`protocol_error`; 9 were authentication walls. The classifier was corrected to read both handshake
attempts, and three classes were added after the first `commerce-mcp-v1` pass filed 5 failures the
same way (an endpoint answering with HTML, a server reporting protocol version `2.0`, and a
`tools/list` result failing schema validation). Those runs stay in the log as written. No
measurement changed: classification is diagnostic, and every server measured in those runs
measured identically in the next.

### The commerce index called an independent sandbox a reference implementation

The implementation labelled `ucp-sandbox (reference)` in `commerce-mcp-v1` is ucpsandbox.com, a
public UCP test environment that names no operator and does not describe itself as an official or
reference implementation of the protocol. It uses the phrase "reference stores" for its sample
shops, and the label borrowed that. It is not published by the UCP project. The label stays in the
log as recorded; read it as `ucpsandbox.com`. The measurement (an `invalid_tool_schema` failure:
none of its 15 tools declares a type on its `outputSchema`) is unaffected.

## Corrections to the published sources this project was built on

These were found by checking primary sources directly rather than search summaries, and each one
was wrong in the research brief that started the work.

### The fault taxonomy has 29 fault types in 5 categories, not 19

The brief described "19 registration/discovery fault classes" from arXiv 2603.05637. Tool
Discovery & Registration is *one* of the 29 fault types. The rubric transcribes the real table,
with prevalence, severity and effort per type, and marks which the harness observes directly,
which partially, which are host-side, and which need live credentials.

### The registry holds roughly 21,000 servers, not roughly 12,000

The 2026-08-11 snapshot carries ~21,000 unique servers across 69,977 published version rows. The
~12,000 figure was stale.

### The 2026-07-28 specification is final, not a release candidate

It was published 2026-07-28 after a release candidate locked in May. It removes the
`initialize`/`notifications/initialized` handshake and the `Mcp-Session-Id` header outright,
carries protocol version and client capabilities in per-request `_meta`, and adds `server/discover`
as an RPC servers **MUST** implement and clients **MAY** call. The specification names
`server/discover` as the backward-compatibility probe for stdio, which is exactly how this harness
uses it.

### "MCP tool search at the protocol level" does not exist

That claim came from a blog summary. The 2026-07-28 specification contains no tool search, tool
filtering or deferred loading — only `ttlMs` / `cacheScope` caching hints on list results.

The real feature is host-side: Anthropic's Messages API server-side tool search
(`tool_search_tool_regex_20251119` / `tool_search_tool_bm25_20251119`), driven by
`defer_loading: true`. MCP servers implement nothing for it.

The consequence is worth stating because it runs toward this index rather than against it. Under
deferred loading the tool definitions become the *search corpus* — BM25 and regex run over names
and descriptions. The three defects this cohort carries most often (undescribed parameters, cohort
name collisions, untyped parameters) are precisely what makes a server unfindable once a host
defers it. And at least one tool must stay loaded, so some context tax is structural.

### The official TypeScript SDK line that speaks the new protocol is a different package

`@modelcontextprotocol/sdk` tops out at protocol `2025-11-25` and does not implement the stateless
core. The 2026-07-28 era ships in a new 2.0 package family — `@modelcontextprotocol/client`,
`core`, `server` and framework adapters. A harness that assumed "upgrade the SDK" would have
concluded, wrongly, that no client supported the new specification yet. This one depends on both
packages and records which of them measured each server.

### papchecker's site list shows no MCP routes; most PAP manifests declare one

papchecker.com, used to select the PAP endpoints, lists each publisher's routes as company agent,
APIs or website. Reading the `poppy.json` files directly on 2026-10-25, 9 of the 13 reachable
manifests declare an `apis` entry of type `mcp`. Those manifests declare protocol versions 0.1 and
0.2 while the specification was at draft 0.3.
