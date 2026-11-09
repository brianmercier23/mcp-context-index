# MCP server quality rubric, v1.2.0

Companion to `rubric-v1.2.0.json`, and a delta on `rubric-v1.1.1.md`. Everything in the earlier
companions still applies except where this file says otherwise. If this file and the JSON
disagree, the JSON is correct.

Authored 2026-11-09. Status: spike.

---

## What moved: the grade now rests on definitions without output schemas

Every token signal behind a band, a grade cap or a defect rule is now its input-only
counterpart, the same key-sorted payload with `outputSchema` removed:

| 1.1.1 signal | 1.2.0 signal |
|---|---|
| `tool_definition_tokens` | `tool_definition_tokens_input_only` |
| `tokens_per_tool_median` | `tokens_per_tool_median_input_only` |
| `context_injection_tokens_total` | `advertised_surface_tokens_input_only` |

Bands, cap thresholds, weights and every other dimension are unchanged. The defect
`context_injection_over_12k` is renamed `advertised_surface_over_12k`.

## Why

Client tests on 2026-10-30 captured what Claude Code and Codex actually sent to a model for one
small synthetic tool. `outputSchema` reached the model only in Codex code mode, which is off by
default; every other path dropped it, as did the Anthropic and OpenAI connector APIs. Under 1.1.1 a
cap could fire on output schemas alone, so the grade penalised a field most tested clients never
send. On the commerce index that was the whole difference between a C and a D for one platform.

## What did not move

- **The advertised figure is still the headline and the reproducibility metric.** It is what the
  server returns, and it is byte-stable across sweeps. It is reported first; the graded figure
  sits beside it.
- **Output-schema size is still reported.** Output schemas are what code-execution clients need,
  and in Codex code mode they were sent and billed as generated return types. Counting them is
  right for that path. A grade for that path would need its own rubric and its own measurement of
  what those clients generate, which this rubric does not attempt.

## Records made before harness 0.1.7 are refused, not re-scored

The input-only signals exist from harness 0.1.7. Earlier records carry no per-tool input-only
figures, and stdio records carry no input-only figures at all, so `scoring.requires_signals`
makes the scorer refuse them. Scoring them anyway would drop the whole token dimension and hand
out a grade this rubric never meant. Those runs are re-probed instead. Until the dev-tooling
cohort is re-probed, its published grades stay under 1.1.1.

## The language that went with the old basis

1.1.1 called tool definitions "the fixed context tax on every conversation in every session". That
holds only on clients that load schemas at connection, and several current defaults do not. The
1.2.0 rationale describes definition size, not client behaviour. The 1.1.x files are published
versions and are not edited; PROVENANCE carries their correction.

## Still open

Everything carried forward from 1.1.0's open list, plus one new item: whether the token caps
should also differ for clients that defer definitions. On those paths size matters as a search
target rather than a standing cost, and nothing here yet measures how size affects whether a tool
is found.
