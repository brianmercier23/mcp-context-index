# MCP Context Index

**What do MCP servers advertise, and which clients can use it?**

MCP Context Index measures the tool definitions each server returns from `tools/list`, by
installing the server (or connecting to its endpoint) and running a real MCP session against it,
and records connection and schema checks under a stated method. Its token counts describe those
serialised definitions with a named tokenizer.

What a model is actually sent, and what a provider bills, is a different measurement. It depends
on the client, the model, its settings and its loading strategy, and on several current default
paths nothing is loaded at connection time at all. See
[What the token counts mean](#what-the-token-counts-mean). To estimate the cost of your own agent
workflow, measure that workflow.

Current index: **[dev tooling, 38 servers](index/dev-tooling-v1.md)** · measured 2026-08-13 ·
run `run-2026-08-13-0208-7936eadf` · config `7936eadf`

| | |
|---|---|
| Cheapest server measured | **335** tokens of advertised tool definitions |
| Most expensive | **125,005** tokens |
| Spread inside one vertical | **373.1x** |
| All 38 summed | **270,244** tokens of advertised definitions |
| Servers carrying at least one defect | **31 of 38** (82%) |

The most expensive server in this cohort is 46% of that total on its own: 125,005 tokens, against
145,239 for the other 37 combined. It is also the most-downloaded server in the set.

### Second index: commerce

**[Commerce MCP, 17 implementations](index/commerce-mcp-v1.md)** · measured 2026-11-05

Online stores now publish MCP endpoints for shopping agents, through the Universal Commerce
Protocol (UCP) and the Personal Agent Protocol (PAP). This index reads each store's manifest,
connects to the endpoint it names, and measures the tool surface that endpoint advertises.
It is read-only: it lists tools and never calls one, so it says nothing about whether two
implementations do the same job.

| | |
|---|---|
| Endpoints attempted | **38**, across 27 implementations (platforms, plugins and individual PAP services) |
| Measured | **24** endpoints, 17 implementations |
| Cheapest tool surface | **273** tokens |
| Most expensive | **46,698** tokens (`shopify-ucp`) |
| The 8 tool names Shopify and Wix share, definition size | **23x** (28,928 vs 1,241, summed per tool) |
| Answering the 2026-07-28 handshake | **4** endpoints |
| Two full sweeps | **24 of 24** byte-identical |

Stores on one platform share one tool surface, so the unit graded is the platform or plugin, and
every store on it inherits the grade. Matching tool names do not establish matching contracts,
functionality or task outcomes, so the 23x figure compares definition size and nothing else. Its
caveats differ from the dev-tooling index and are listed at the top of the index itself.

## Read the caveats first

These five are load-bearing. They are repeated in the index itself and in
[METHOD.md](METHOD.md), because an index that hides them is worth less than no index.

1. **This is not a random sample of the registry, and must never be described as one.** The
   cohort is the 50 most-downloaded dev-tooling servers from a dated registry snapshot. That is a
   sample of what a team plausibly has installed — the population an audit is sold against — not a
   representative slice of the ~21,000 servers published.
2. **The defect rate is a floor, not a total.** 82% of servers carry at least one
   defect *that a black-box probe without credentials can see*. Nothing here measures output
   correctness, runtime behaviour, or anything behind an auth wall. Published research on a
   201-server sample puts the real figure at 100%; the gap is rule coverage, not disagreement.
3. **Two servers are known flakes, and neither has ever moved a number.** `coldstart` and
   `evidrift` have each flipped between `probed` and `install_failed` between runs — `coldstart`
   because the sandbox directory could not be cleared, which on this host means a scanner still
   held a handle on it, and `evidrift` on an `npm install` that failed once in eleven attempts.
   Whenever either was measured it produced exactly the same token count as every other time
   (3,878 and 467 respectively). It is an environment artifact, not measurement drift, and it is
   named here rather than left for a reader to find.
4. **Grades are an editorial reading; the measurements are not.** A grade changes whenever the
   rubric does. A signal never changes. They live in separate files for that reason, and every
   report names which rubric measured it and which rubric scored it.
5. **A token count here is what a server advertises, not what a model is sent.** Earlier versions
   of this README called it the context every conversation pays for. On the client paths tested
   that is sometimes true, sometimes an overstatement, and sometimes zero at connection time.
   [What the token counts mean](#what-the-token-counts-mean) has the detail.

## What the token counts mean

The index counts the definitions a server returns. Whether a client sends them to a model, and
when, is the client's decision. A separate test on 2026-10-30 served one small synthetic tool to
Claude Code 2.1.263 and Codex 0.166 and recorded the requests each client built:

- **Claude Code, default settings:** the first request carried only the tool's name, in a deferred
  list; the schema arrived after tool search found it. With tool search turned off, the full input
  schema was sent up front.
- **Codex:** with `gpt-5.4`-family models the full schema was sent up front. With `gpt-5.5` and
  `gpt-6-astra` nothing was sent at the start, and the tool was reached through search.
- **Output schemas** were dropped on every path tested except Codex code mode (off by default),
  which sent them as generated TypeScript return types.

Deferral moves cost rather than removing it: on the one tool-use session measured, the deferred
path took an extra turn. So a definition count is close to the up-front load on some paths, an
overstatement on paths that drop output schemas, and not an up-front load at all on deferred
paths. The commerce index shows an input-only figure beside every total for the paths that drop
output schemas.

The definitions still matter on deferred paths, for a different reason: names and descriptions
become what tool search runs over, so undescribed parameters and colliding names make a server
harder to find. That is why the index keeps measuring them.

These findings hold for the versions named, on that date, with one small tool per server. Client
behaviour changes quickly; one finding changed between two Claude Code releases 51 patches apart.
The fixture and raw captures are not published. [PROVENANCE.md](PROVENANCE.md) records the
correction.

## Why you can check this rather than trust it

- **Pinned versions, and the dependencies pinned with them.** Every server is installed at an exact
  version recorded in the cohort file, with its dependencies resolved as they stood when the cohort
  was pinned, and every record carries a hash of the tree it installed. Re-running the pinned
  cohort reproduces the numbers for every package still on npm; it does not re-sample the
  registry, and it does not pick up dependency releases made since the pin. Before harness 0.1.5
  it did, and by 2026-10-25 two published numbers no longer reproduced because of it — see
  [PROVENANCE.md](PROVENANCE.md).
- **An append-only log.** [`results/runs.jsonl`](results/) is never rewritten. Every number in
  every published claim is re-derivable from it. Corrections are made in prose, including the
  corrections against this project's own earlier mistakes — see [PROVENANCE.md](PROVENANCE.md).
- **A versioned rubric, published whole**, including the arguments against it. The rubric files
  carry their own criticism sections naming what each choice gets wrong.
- **A stated tokenizer.** `gpt-tokenizer`, `o200k_base`. Token counts are tokenizer-dependent and
  this one is named rather than implied.
- **A reproducibility gate that has returned GO 6 consecutive times.** Two full sweeps
  of the identical pinned cohort, compared server by server. Latest: of the 37
  servers measured in both sweeps, **37 byte-identical, zero grade changes**. Not "within
  tolerance" — identical, on a metric with a 0.5% tolerance band that has never been used. The
  one `NO-GO` in the log was produced over an empty comparison set by a bug in the comparator
  itself; it stays in the log, and [PROVENANCE.md](PROVENANCE.md) explains it.
- **No model in the loop.** Every number is a count, a ratio, or a token count over a key-sorted
  serialisation. There is no inference anywhere in the measurement path, so there is no sampling
  variance to average away.

## Protocol era

The MCP specification published 2026-07-28 retired the `initialize` handshake and replaced it
with per-request metadata plus a mandatory `server/discover` RPC. The harness probes
`server/discover` first and falls back to `initialize` — the order the specification gives for
stdio — and records which one answered, per server.

As of this run: **0 modern, 38 legacy, 0 answering neither handshake.**
A further 11 servers never got far enough to be asked — they refuse to start without live
credentials or deployment details, which is a separate finding, reported separately, and not a
protocol failure.

This matters for two reasons. It keeps the index from measuring a retired protocol and blaming
servers for having migrated, which is the one failure mode that would invalidate the whole
position. And recorded per server from the start, it makes the index the running record of who
migrated when.

## How fast this goes stale

A published index of a fast-moving registry is a photograph, and the honest thing is to say when
it was taken and how much has moved since. So the harness also runs a metadata-only watcher —
no installs, no execution, a few seconds — that reports which pinned versions have been passed.

**86 days after this cohort was pinned, 28 of its 50
servers had published a newer version.** The largest jump since the pin is `githits`,
51 versions (0.8.0 to 0.39.0). A further 7
have newer versions on npm that were already there when the cohort was pinned, and have released
nothing since: each pin is the version the server's registry entry declared, and for
17 of the 50 npm already had something newer
([METHOD.md](METHOD.md#cohort-selection)). Those are not counted as drift. Current drift report,
checked 2026-11-05: **[index/version-drift-dev-tooling-v1.md](index/version-drift-dev-tooling-v1.md)**.

That number is the argument for the whole approach rather than against it. Anything that scrapes
registry listings is describing a population that has already changed; pinning the versions is
what makes a measurement mean something a month later. The index reports what was measured, at
the version it was measured at, and the drift report says what has moved since. Neither pretends
to be the other.

It is also why the interesting question here is not "what is this server's score" but "what
changed" — which is the question an append-only log can answer and a dashboard cannot.

## What is measured

Per server, from a real MCP session against a pinned sandboxed install:

- **Advertised size** — tool-definition tokens (the primary metric), median and max per tool, and
  the total advertised surface including server instructions, prompts and resources
- **Schema clarity** — description coverage on tools and parameters, schema validity, untyped
  parameter rate
- **Error legibility** — deliberately malformed calls against up to three read-only tools: is the
  error structured, does it name the offending parameter, does it leak a stack trace
- **Collision risk** — generic names, namespacing, and names shared with another server in the
  same cohort
- **Injection surface** — directive text aimed at the model, invisible Unicode, embedded URLs
- **Auth hygiene** — declared secrets, secrets passed via argv, canary leak detection, and whether
  the server can be inspected at all without live credentials

Plus pass/fail against the observable subset of the 29 fault types in arXiv 2603.05637.

Full method, and the complete list of what is deliberately **not** measured, in
[METHOD.md](METHOD.md).

## Reproduce it

```bash
cd harness
npm install
npm test          # fixture tests: both protocol eras, and that they measure identically
npm run run       # full sweep of the pinned cohort, ~25 min, no API keys, no model calls
npm run run       # again — reproducibility needs two
npm run reproduce # GO / NO-GO
npm run report    # regenerates the index
```

The sweep needs no credentials and makes no model calls. It costs machine time and nothing else.

## Layout

| Path | What |
|---|---|
| [`index/`](index/) | the published index (markdown to read, JSON to consume) and the version-drift report that qualifies it |
| [`METHOD.md`](METHOD.md) | how a number is produced, and what is not measured |
| [`PROVENANCE.md`](PROVENANCE.md) | corrections, including this project's own errors |
| [`rubric/`](rubric/) | the executable rubric, its companions, and the failure-class taxonomy |
| [`data/`](data/) | the pinned cohort and the registry snapshot it was selected from |
| [`results/`](results/) | append-only measurement, scoring and reproducibility logs |
| [`harness/`](harness/) | the instrument (`mcp-probe`), source and tests |

## Licence

Code (`harness/`) is MIT. The index, rubric and measurement logs are CC BY 4.0 — reuse them,
including commercially, with attribution.

## Corrections

Corrections are the point. If a number here is wrong, open an issue with enough detail to
re-derive it and the correction will be published in `PROVENANCE.md` as prose, alongside the
original. The log is never quietly edited: a measurement log you can clean up is not evidence of
anything.
