# MCP server quality rubric, v1.0.0

Companion to `rubric-v1.0.0.json`. The JSON is what the harness executes; this file is what a
buyer reads. If the two ever disagree, the JSON is correct and this file is stale.

Authored 2026-08-10. Status: spike.

---

## What this rubric is for

There are roughly 21,000 servers in the official MCP registry as of the 2026-08-11 snapshot,
the registry is still in preview with data resets expected, and there is no independent
quality signal attached to any of them. A buyer choosing between two servers that do the same
job has no way to know that one of them costs 26x more in context than the other before a
single tool is called.

This rubric measures the things a buyer is already paying for and cannot see.

## The one design decision that matters

**v1.0.0 contains no model-judged signal.** Every number is a count, a ratio, or a token
count over a deterministic serialisation. That is a deliberate limitation, and it is the whole
point of the spike: an instrument whose readings move when nothing else moved cannot support a
paid audit. Prove the deterministic floor is reproducible first; add judgement on top of it
later, as v1.1, where its variance can be measured against a stable baseline rather than
disappearing into it.

Corollary: this rubric cannot tell you whether a server is *good at its job*. It tells you what
the server costs you, how clearly it explains itself, how it fails, and what it exposes.

## The primary metric

`tool_definition_tokens` — the token count of the tool definitions a server injects into the
model's context on connection: name, description, and input schema for every tool, key-sorted
and serialised.

This is the right primary metric for three reasons:

1. **It is the bill.** Every conversation pays it, in every session, whether or not any tool is
   ever called. A server with 250 tools charges rent on the context window all day.
2. **It is deterministic.** No credentials, no network round-trip, no model. Two runs of an
   unchanged server must produce the identical integer, and when they don't, something real
   changed — which is exactly what the reproducibility gate is designed to catch.
3. **It is the published number.** The 440x spread in the literature (GitHub official at 20,444
   tokens against sqlite at 46) is this quantity. Measuring the same thing keeps the work
   comparable to what is already cited.

Absolute counts come from `gpt-tokenizer` at `o200k_base`, chosen because it is pure JS, offline,
and pinned. It is not Anthropic's tokenizer. Every comparison in the rubric is between servers
measured with the same encoder, so the difference cancels — but do not quote these figures as
Anthropic-billed tokens without a calibration factor.

## The reproducibility gate

The spike is a go only if the instrument agrees with itself:

| Classification | Delta between two runs |
|---|---|
| stable | exactly 0% |
| tolerable | ≤ 0.5% |
| unstable | > 0.5% |

The cohort passes if **≥ 95%** of servers measured in both runs land in stable or tolerable.
Runs are only comparable when their `config_hash` matches — that hash covers the rubric version,
the tokenizer, the cohort selection hash, the sandbox model, the node major version, the
platform, and the probe timeouts. Comparing across a config change is refused rather than
silently produced.

Below the gate, the correct response is to fix the instrument, not to add servers. The most
likely cause of instability is a server that builds its tool list from a live API at startup;
those servers are named individually in the reproducibility record so the failure has an address.

## The six dimensions

| Dimension | Weight | What it answers |
|---|---:|---|
| Token cost | 0.30 | What does having this connected cost me before I use it? |
| Schema clarity | 0.20 | Will a model call this correctly on the first try? |
| Error legibility | 0.15 | When it fails, can the model recover in one turn or five? |
| Collision risk | 0.10 | Will this quietly shadow another server's tools? |
| Injection surface | 0.15 | Does this text try to instruct my model? |
| Auth hygiene | 0.10 | How does it ask for secrets, and does it keep them? |

Signals score 1–5 by band. A dimension is the unweighted mean of its measurable signals; the
overall score is the weighted mean over the dimensions that were measurable. **An unmeasurable
dimension is dropped from the weighted mean, never imputed and never scored as zero** — a server
that could not be error-probed is not thereby a bad server, and pretending otherwise would put a
false number in front of a buyer.

Two signals are hard fails and cap the grade at D regardless of the weighted score:

- `canary_leaked` — a unique canary string is planted in every declared credential slot. If it
  comes back out in a tool response, an error, or on stderr, the server echoes secrets.
- `invisible_char_hits` — zero-width, bidi-override, or Unicode-tag characters in a tool
  description. There is no legitimate reason for these in text that goes into a model's context.

## Weighting, and the argument against it

Token cost carries 0.30 because it is the only dimension with a dollar figure attached today,
and the audit is sold on savings. The honest counter-argument is that injection surface is the
one that can lose a customer their data, and it carries half the weight. The defence is that
injection findings are rare and binary in practice, so they surface as hard fails and named
examples rather than as a few tenths of a point — the weight is not doing the work there, the
hard-fail rule is.

Weights live in the JSON. Anyone who disagrees can change one number and re-score the entire
history from the append-only log without re-running a single probe. That is the reason scoring
is a rubric file and not code.

## Against the published fault taxonomy

Scored against *Real Faults in Model Context Protocol (MCP) Software: a Comprehensive Taxonomy*
(Taraghi, Morovati, Khomh — arXiv 2603.05637, v2 revised 3 Aug 2026): **5 high-level categories,
29 named fault types**, 419 manually assigned labels, validated against a 41-respondent
practitioner survey.

**Correction carried forward:** an earlier internal brief described this paper as defining "19
tool-discovery/registration fault classes." It does not. *Tool Discovery & Registration* is one
of the 29 fault types, sitting inside the Server/Tool Configuration category, with 27.27%
practitioner prevalence. The rubric transcribes the real list from Table 4 of the paper,
including each type's prevalence, severity index, and effort index.

Of the 29 types, this harness can observe:

- **9 directly** (`probe`) — deployment, dependency, platform incompatibility, logging, resource
  handling, tool discovery & registration, tool authentication, connection setting, documentation
- **9 partially** (`partial`) — the probe sees a symptom, not the cause
- **9 not at all** (`host-side`) — they are faults of the client, not the server
- **2 require live credentials** (`needs-credentials`) — API usage, tool authorization, which
  this harness deliberately never exercises

Reporting that split honestly is more useful than claiming 29-of-29 coverage. A buyer who is
told which faults were *not* checked can decide whether to care.

## What v1.1 should add, in priority order

1. **Per-call response cost** against a live credentialed account, for the three or four servers
   a specific client actually runs. This is the number that turns an index into an invoice.
2. **A model-judged description-quality signal**, with its variance measured against the
   deterministic baseline rather than folded into it.
3. **Migration readiness for the 2026-07-28 stateless spec.** Breaking changes are a consulting
   window, and a server's readiness for one is a scoreable property.
4. **Cross-cohort collision scoring**, once more than one vertical has been measured. Collisions
   inside a vertical understate the real risk: a team's installed set spans verticals.
