# MCP server quality rubric, v1.1.1

Companion to `rubric-v1.1.1.json`, and a delta on `rubric-v1.1.0.md`. Everything in the 1.1.0
companion still applies unchanged: the dimensions, the weights, the bands, the grade caps, the
defect rules, and the arguments against all of them. If this file and the JSON disagree, the JSON
is correct.

Authored 2026-08-13. Status: spike.

---

## 1.1.1 changes no number

No dimension, weight, band, signal, grade cap or defect rule moved. Every score under 1.1.1 is
numerically identical to the same score under 1.1.0 and 1.0.0. Two documentation defects are
fixed, and both were found by reading the artifact against the instrument rather than by running
anything.

## Correction 1 — the primary metric definition understated what is counted

`measurement_contract.primary_metric_definition` described the tool-definition payload as
`{name, description, inputSchema}`. The harness has always also included `outputSchema` for the
tools that declare one (`probe.js`, `toolDefinitionPayload`). Four fields, not three.

No measurement was wrong and no published number moves. What was wrong is that the document
defining the metric disagreed with the code producing it — and that document is exactly the thing
this project publishes to be attacked. This is the same class of defect as the comparator that
stamped `@1.0.0` onto a pair measured under 1.1.0: an artifact disagreeing with the instrument
about how a number was made. The fix is to the document, because the code was right: `outputSchema`
is part of what a client injects into context, so a metric that excluded it would understate the
context tax.

## Correction 2 — protocol-version coverage is now a named limit

Harness 0.1.4 probes the 2026-07-28 `server/discover` exchange and falls back to the 2025
`initialize` handshake, recording which one answered. That is a real change in what the harness
can reach, so `explicitly_not_measured` now says what it still does not reach: extensions, MRTR,
caching hints, tasks, and whether a modern server also continues to serve legacy clients.

A server is measured through whichever era answered it. Both paths produce the same signal set,
because the measurement is `tools/list` output either way.

## Still open, carried forward from 1.1.0

The injection-surface cap. `@aicommander/mcp` carries model-directive text in a tool description —
a major defect and the highest-severity failure mode in the rubric — and still grades **A**,
because injection surface is weighted 0.15 and everything else about it is clean. That is the
same laundering the token-cost caps fixed, one dimension over, and the fix is to make hard-fail
signals a special case of grade caps. It stays out of 1.1.1 for the same reason it stayed out of
1.1.0: this revision's brief was documentation defects, and quietly widening it would make the
change harder to review.

Search-readiness is the other v1.2 candidate. Under host-side deferred tool loading
(Anthropic's `tool_search_tool_regex_20251119` / `tool_search_tool_bm25_20251119`, driven by
`defer_loading: true`) the tool definitions become the search corpus, and BM25 and regex run over
names and descriptions. The three defects this cohort carries most often — undescribed parameters,
cohort name collisions, untyped parameters — are precisely what makes a server unfindable once a
host defers it. It is derivable from signals already collected, and it is not a prerequisite for
publishing.
