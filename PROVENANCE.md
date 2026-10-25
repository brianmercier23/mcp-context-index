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
