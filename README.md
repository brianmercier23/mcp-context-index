# MCP Context Index

**What does an MCP server cost you before it does anything?**

Every MCP server you connect injects its tool definitions into the context window of every
conversation, whether or not a single tool is ever called. Nobody publishes that number. This
project measures it, by installing each server and running a real MCP session against it.

Current index: **[dev tooling, 38 servers](index/dev-tooling-v1.md)** · measured 2026-08-13 ·
run `run-2026-08-13-0208-7936eadf` · config `7936eadf`

| | |
|---|---|
| Cheapest server measured | **335** tokens of tool definitions |
| Most expensive | **125,005** tokens |
| Spread inside one vertical | **373.1x** |
| All 38 connected at once | **270,244** tokens, before a single tool call |
| Servers carrying at least one defect | **31 of 38** (82%) |

The most expensive server in this cohort costs more context than the other 37
put together, and it is the most-downloaded server in the set.

## Read the caveats first

These four are load-bearing. They are repeated in the index itself and in
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

## Why you can check this rather than trust it

- **Pinned versions.** Every server is installed at an exact version recorded in the cohort file.
  Re-running the pinned cohort reproduces the numbers; it does not re-sample the registry.
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

**2 days after this cohort was pinned, 23 of its 50 servers had
already published a newer version.** The largest jump is `octocode-mcp`, 62
versions past the pin (7.0.9 to 18.2.2). Current drift report, checked
2026-08-13: **[index/version-drift-dev-tooling-v1.md](index/version-drift-dev-tooling-v1.md)**.

That number is the argument for the whole approach rather than against it. Anything that scrapes
registry listings is describing a population that has already changed; pinning the versions is
what makes a measurement mean something a month later. The index reports what was measured, at
the version it was measured at, and the drift report says what has moved since. Neither pretends
to be the other.

It is also why the interesting question here is not "what is this server's score" but "what
changed" — which is the question an append-only log can answer and a dashboard cannot.

## What is measured

Per server, from a real MCP session against a pinned sandboxed install:

- **Token cost** — tool-definition tokens (the primary metric), median and max per tool, and total
  context injection including server instructions, prompts and resources
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
