# MCP server quality rubric, v1.1.0

Companion to `rubric-v1.1.0.json`, and a delta on `rubric-v1.0.0.md`. Everything in the v1.0.0
companion still applies: the dimensions, the weights, the bands, the primary metric, the
measurement contract, and the limits are unchanged. This file covers only what 1.1.0 adds and
the arguments against it. If this file and the JSON disagree, the JSON is correct.

Authored 2026-08-12. Status: spike.

---

## Why there is a 1.1.0 at all

The first sweep of `dev-tooling-v1` graded 16 A, 19 B, 2 C, and no D or F. The published
literature says 100% of a 201-server sample carried at least one quality defect. Both cannot be
right, and the difference was in the method rather than the data.

Two specific failures, both visible in the run:

1. **The weighted mean laundered token cost.** Token cost scored 3.45 across the cohort while
   every other dimension scored 4.5 to 4.9. Weighted at 0.30, a terrible token score could not
   pull an otherwise clean server below C. `@smartbear/mcp` injected **125,005 tokens** of tool
   definitions — more than the other 36 measurable servers put together — and graded **C**. That
   is not a defensible reading of the thing the audit is actually selling.
2. **A grade is a summary, and summaries launder.** One letter cannot carry "this server is
   cheap and well-typed but silently accepts malformed arguments." Averaging is exactly the
   operation that hides it.

## Change 1 — token cost caps the grade

`scoring.grade_caps` is a list of predicates over already-measured signals. Each sets a **maximum
grade**, never a minimum. Where more than one fires, the lowest ceiling wins.

| Rule | Fires when | Ceiling |
|---|---|:--:|
| `tool_defs_10k_caps_at_c` | `tool_definition_tokens` ≥ 10,000 | C |
| `tool_defs_25k_caps_at_d` | `tool_definition_tokens` ≥ 25,000 | D |
| `median_tool_1200_caps_at_c` | `tokens_per_tool_median` ≥ 1,200 | C |

The first two are the fixed context tax, which every conversation pays whether or not a tool is
ever called. No amount of schema hygiene compensates for it, so it has to bound the grade rather
than be averaged against it. The third catches the server that escapes a total-token cap by
exposing very few, individually enormous tools — `@metaengine/mcp-server` exposes 7 tools at a
1,547-token median, which is a schema problem, not a breadth problem.

The uncapped grade is retained on every score record as `uncapped_grade`, with the applied caps
named in `caps_applied`. A capped grade can always be read back as its score plus a reason. That
matters: a cap is an editorial judgment and it should be attackable, not baked in.

**Effect on `dev-tooling-v1`:** 4 servers capped, 2 from C to D and 2 from B to C. No server moved
up. Grade distribution went 16 A / 19 B / 2 C / 0 D → **16 A / 18 B / 2 C / 2 D**.

**The argument against.** Thresholds at 10,000 and 25,000 tokens are round numbers, not derived
constants, and a 149-tool server that a team genuinely needs all 149 tools from is being marked
down for breadth it was asked for. The defence is that the rubric measures cost to the buyer, not
merit of the author: a server can be excellent and still be the wrong thing to leave connected.
The honest version of that criticism is that the *remedy* differs — an expensive-because-broad
server wants a tool-filtering host, an expensive-because-verbose one wants a schema rewrite — and
the grade does not distinguish them. The per-server detail does.

## Change 2 — defect count reported alongside the grade

`scoring.defects.rules` is 24 deterministic predicates over the same signals, each labelled
`major` or `minor`. They are **counted, never summed into the score**. The count and the grade are
computed independently on purpose, so that a disagreement between them is visible instead of
averaged away — a server can be A-graded with three defects, and that is information rather than
an inconsistency.

Severity is a reporting convention, not a weight. Nothing multiplies it.

Rules are evaluated only for servers that reached a probed state. A server that would not install
or would not enumerate its tools is handled by failure attribution in
`failure-classes-v1.0.0.json`, not by defect counting: absence of measurement is not evidence of
quality in either direction. A rule whose signal was never measured never fires, and the ids of
those rules are recorded per server in `defects.rules_not_evaluable`, so the count reads as a
floor rather than a total.

**Effect on `dev-tooling-v1`:** 31 of 38 servers carry at least one defect (82%), 28 carry at least
one major. Median 2, worst 8, and 7 servers clean. The three most common are all schema-side:
undescribed parameters (15 servers), cohort tool-name collisions (10), untyped parameters (9).

**The argument against.** 82% is not the literature's 100%, and the gap is a rule-coverage gap
rather than a disagreement about the servers. These 24 rules see only what a black-box probe
without credentials can see. Nothing here covers output correctness, runtime behaviour, or
anything behind an auth wall, and 8 of the 24 rules did not fire on any server in this cohort at
all. Publishing "82% defective" without publishing that this is a floor would be the same kind of
laundering v1.1.0 exists to remove. The report says so in the section itself.

A second, sharper criticism: a count invites addition of unlike things. One undescribed parameter
and one silently-swallowed malformed argument both add 1. That is why the count is published with
its breakdown and never as a score.

## What 1.1.0 deliberately does not change

- **No dimension, weight, band or signal moved.** Dimension scores under 1.1.0 are numerically
  identical to 1.0.0. That is what makes the two rubrics directly comparable and lets the whole
  history be re-scored from the append-only log without re-probing anything.
- **Still no model-judged signal.** The v1.0.0 companion said judgement would arrive "later, as
  v1.1". It has not. 1.1.0 is a reading change, not a measurement change, and it stays fully
  deterministic — the same signals, the same numbers, a different interpretation. A model-judged
  layer is still wanted and is still deferred, so its variance can be measured against a baseline
  that has now been stable across four runs rather than disappearing into one.

## How re-scoring works, and why it is a separate file

`npm run rescore` reads `results/runs.jsonl`, re-applies a chosen rubric to the stored signals, and
appends to `results/scores.jsonl`. Nothing is re-probed and nothing is rewritten.

Scores do **not** go back into `runs.jsonl`. A re-score is not a run: it produces no new
measurement and shares no config hash, and it must never become comparable to a run inside the
reproducibility log. `runs.jsonl` records what was measured; `scores.jsonl` records what a given
rubric made of it. Both are append-only, and a run can carry several scorings at once — the report
names which measurement rubric and which scoring rubric it used, on the first line.

Cohort collisions are recomputed at re-score time from the tool names in the log rather than read
back from stored signals, so a re-score depends on the raw measurement and not on whatever a past
harness version happened to store beside it.

## Known issue, candidate for v1.2

Capping fixed token cost. It did not fix the general case, and the cohort contains a live example:
`@aicommander/mcp` carries `model_directive_in_description` — directive text aimed at the model
inside a tool description, a **major** defect and the highest-severity failure mode in the whole
rubric — and still grades **A**, because injection surface is weighted 0.15 and everything else
about the server is clean.

That is the same laundering, one dimension over. The obvious fix is a cap on
`imperative_directive_hits` and `invisible_char_hits`, which would make hard-fail signals a
special case of caps rather than a parallel mechanism. It is deliberately **not** in 1.1.0: the
brief for this revision was token cost and defect counting, and expanding it further on my own
judgment would have made the change harder to review. Flagged here rather than quietly fixed.
