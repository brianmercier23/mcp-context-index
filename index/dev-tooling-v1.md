# MCP server index — dev-tooling-v1

Run `run-2026-08-13-0208-7936eadf` · measured under rubric `mcp-server-quality@1.1.1` · scored under `mcp-server-quality@1.1.1` · 38/50 servers probed · 2026-08-13 02:08 UTC

Measured by sandboxed execution, not by reading listings. Every number below is the
output of a real MCP session against a pinned install, tokenised with `gpt-tokenizer` (`o200k_base`).

## The headline

| | |
|---|---|
| Cheapest server | **335** tokens of tool definitions |
| Most expensive | **125,005** tokens |
| Spread | **373.1x** |
| All 38 installed at once | **270,244** tokens of context, before a single call |

That last figure is the one that sells an audit: it is the fixed tax a team pays on
every conversation, in every session, whether or not any tool is used.

## Cost of admission, by server

| Server | npm | Tools | Tool-def tokens | Median/tool | Heaviest tool | Defects | Grade |
|---|---|---:|---:|---:|---|:--:|:--:|
| com.smartbear/smartbear-mcp | `@smartbear/mcp@0.34.0` | 149 | 125,005 | 583 | `qtm4j_search_test_cases` | 8 (3 maj) | D † |
| com.postman/postman-mcp-server | `@postman/postman-mcp-server@2.11.2` | 42 | 33,553 | 236.5 | `putCollection` | 5 (2 maj) | D † |
| eu.metaengine/mcp-server | `@metaengine/mcp-server@1.4.1` | 7 | 12,446 | 1,547 | `generate_code` | 5 (3 maj) | C † |
| com.githits/githits | `githits@0.8.0` | 15 | 10,297 | 610 | `search` | 6 (3 maj) | C † |
| io.github.apatilgtn/k8scortex-mcp | `k8scortex-mcp@1.0.2` | 75 | 7,943 | 92 | `set_resource_limits` | 6 (4 maj) | B |
| io.github.bromoket/x64dbg | `x64dbg-mcp-server@2.3.0` | 23 | 7,651 | 296 | `x64dbg_breakpoints` | 1 (1 maj) | B |
| io.github.alfredoizdev/contextforge-mcp | `contextforge-mcp@0.5.0` | 67 | 7,550 | 99 | `memory_ingest` | 3 (2 maj) | B |
| io.github.Azure/containerization-assist | `containerization-assist-mcp@1.5.0` | 15 | 5,936 | 326 | `generate-k8s-manifests` | 1 (1 maj) | B |
| io.github.AshMet/vibemap-mcp | `@vibemap.ai/mcp-server@2.8.1` | 35 | 5,787 | 137 | `vibemap_create_persona` | 1 (1 maj) | B |
| com.gitkraken/gk-cli | `@gitkraken/gk@3.1.70` | 31 | 5,581 | 147 | `issues_assigned_to_me` | 2 (1 maj) | B |
| io.github.bgauryy/octocode-mcp | `octocode-mcp@7.0.9` | 5 | 5,451 | 1,058 | `githubSearchPullRequests` | 3 | B |
| io.github.attebury/remogram | `@remogram/mcp@0.2.0-beta.4` | 40 | 4,397 | 81 | `cr_open` | 3 (2 maj) | B |
| io.github.AutomateLab-tech/content-distribution | `@automatelab/content-distribution-mcp@2.2.1` | 8 | 4,235 | 367.5 | `post.publish` | 2 (1 maj) | B |
| com.adrianczuczka/mason | `mason-context@0.6.0` | 18 | 4,060 | 187 | `save_snapshot` | 3 (3 maj) | B |
| io.github.BitePro/chrome-debugger-mcp | `chrome-debugger-mcp@1.0.4` | 18 | 2,876 | 143.5 | `waitForSpecificPause` | 1 | B |
| io.github.BASHBOP/otito | `@bashbop/otito@1.6.0` | 13 | 2,805 | 221 | `review_gate` | 0 | B |
| io.github.AINative-Studio/ainative-zerodb-memory-mcp | `ainative-zerodb-memory-mcp@1.2.7` | 18 | 2,539 | 129 | `zerodb_search_memory` | 3 (3 maj) | B |
| com.kenxcomp/kenotex-mcp | `kenotex-mcp@1.2.3` | 22 | 2,351 | 92.5 | `create_todo` | 3 (2 maj) | B |
| ai.wild-card/deepcontext | `@wildcard-ai/deepcontext@0.1.15` | 4 | 2,079 | 365.5 | `search_codebase` | 6 (3 maj) | B |
| ai.getoptimal/optibot | `@optimalai/optibot-mcp@1.4.1` | 22 | 1,958 | 60.5 | `trigger_security_scan` | 0 | A |
| io.github.BasilSkyWalk/parecode | `parecode@0.7.0` | 3 | 1,636 | 546 | `ParecodeEdit` | 5 (2 maj) | B |
| io.github.Abhishekkumar2021/github | `@abhishekmcp/github@0.2.0` | 16 | 1,364 | 86 | `list_issues` | 2 (2 maj) | A |
| io.github.aryamthecodebreaker/fixmap | `@aryam/fixmap@0.8.8` | 5 | 1,330 | 282 | `fixmap_plan` | 0 | A |
| dev.aicommander/mcp | `@aicommander/mcp@1.0.17` | 3 | 1,278 | 318 | `remote_exec` | 2 (1 maj) | A |
| io.github.Belius303/frappe-inspector | `@frappe-inspector/mcp@1.4.0` | 12 | 1,179 | 96 | `explain_frappe_finding` | 1 (1 maj) | A |
| com.get-obra/obra-cto | `obra-cto@0.3.0` | 5 | 1,031 | 162 | `score_build_readiness` | 0 | A |
| io.github.alisaitteke/npm-mcp | `@alisaitteke/npm-mcp@0.0.3` | 12 | 1,013 | 82.5 | `analyze_npx_command` | 1 (1 maj) | A |
| io.github.AugustusW/sharedoc-mcp | `sharedoc-mcp@2.1.4` | 8 | 877 | 111.5 | `search_shared_docs` | 1 (1 maj) | A |
| io.github.Aderix/vantagate-mcp-server | `@vantagate/mcp-server@1.0.2` | 2 | 817 | 408 | `create_vantagate_checkpoint` | 2 (1 maj) | A |
| io.github.aryankumar06/infimium | `infimium@0.3.1` | 11 | 790 | 61 | `project_memory` | 4 (2 maj) | B |
| io.github.Alex88Ryabov/ng-token-saver | `@alex-apps/ng-token-saver@0.1.7` | 6 | 787 | 133.5 | `ng_find_usages` | 1 (1 maj) | A |
| io.github.bitofacoder/omni-mcp-server | `@bitofacoder/omni-mcp-server@1.1.1` | 13 | 712 | 51 | `memory_store` | 3 (2 maj) | A |
| io.github.alexcloudstar/makers-page-mcp | `makers-page-mcp@0.1.2` | 8 | 674 | 85.5 | `create_draft` | 0 | A |
| io.github.aradar46/reuse-before-generate | `reuse-before-generate@0.2.3` | 1 | 557 | 555 | `check_before_building` | 2 | A |
| com.driflyte/driflyte-mcp-server | `@driflyte/mcp-server@0.1.15` | 2 | 541 | 269.5 | `search` | 3 (1 maj) | B |
| io.github.bm1016bm-svg/evidrift | `evidrift@0.4.0` | 2 | 467 | 233 | `evidrift_record` | 0 | A |
| com.trestlescan/trestle | `@trestlescan/mcp@1.4.1` | 5 | 356 | 57 | `scan_proposed` | 3 (1 maj) | A |
| com.docfork/docfork-mcp | `docfork@1.3.0` | 2 | 335 | 167 | `docfork_search_docs` | 0 | A |

† Grade capped by token cost. A weighted mean lets one bad dimension be washed out by five good
ones, which is how a server charging six figures of context tokens graded C on the first rubric.
From `mcp-server-quality@1.1.1`, token cost sets a ceiling instead of contributing a share:

| Server | Uncapped | Capped to | Rule | Measured |
|---|:--:|:--:|---|---:|
| com.smartbear/smartbear-mcp | C | D | Tool definitions cost 25,000+ tokens | 125,005 |
| com.postman/postman-mcp-server | C | D | Tool definitions cost 25,000+ tokens | 33,553 |
| eu.metaengine/mcp-server | B | C | Tool definitions cost 10,000+ tokens | 12,446 |
| com.githits/githits | B | C | Tool definitions cost 10,000+ tokens | 10,297 |

## Did not run

| Server | npm | Status | Detail |
|---|---|---|---|
| io.github.b1ff/atlassian-dc-mcp-jira | `@atlassian-dc-mcp/jira@0.29.0` | connect_failed | MCP error -32000: Connection closed |
| com.mendapi/mendapi | `mendapi@0.5.6` | connect_failed | MCP error -32000: Connection closed |
| io.github.b1ff/atlassian-dc-mcp-bitbucket | `@atlassian-dc-mcp/bitbucket@0.29.0` | connect_failed | MCP error -32000: Connection closed |
| io.github.AkashGoenka/coldstart | `@cstart/coldstart@2.2.17` | install_failed | could not clear sandbox directory (locked by another process or a scanner) |
| com.pinappai/mcp | `@pinappai/mcp@0.9.9` | connect_failed | MCP error -32000: Connection closed |
| dev.sexai/sexai-mcp | `sexai-mcp@0.11.11` | connect_failed | MCP error -32000: Connection closed |
| io.github.ashfordeOU/grasp | `grasp-mcp-server@3.21.0` | connect_failed | MCP error -32000: Connection closed |
| io.github.aaronsb/jira-cloud | `@aaronsb/jira-cloud-mcp@0.10.0` | connect_failed | MCP error -32000: Connection closed |
| io.github.AndyAnh174/vibe-hnindex | `vibe-hnindex@0.1.2` | connect_failed | MCP error -32000: Connection closed |
| com.formpaste/formpaste | `formpaste-mcp@1.0.1` | connect_failed | MCP error -32000: Connection closed |
| io.github.Algiras/debugium | `@algiras/debugium@0.1.2` | connect_failed | MCP error -32000: Connection closed |
| io.github.bomly-dev/bomly-cli | `bomly-mcp@0.21.3` | connect_failed | MCP error -32000: Connection closed |

**12 of 50 could not be measured at all.** A server that will not install or
will not answer `tools/list` under a clean environment is a finding, not a gap in the data —
but only once the cause is attributed. The split:

| Attribution | Cause | Count | Servers |
|---|---|---:|---|
| **server** | Requires instance-specific deployment details before it will list tools | 3 | `@atlassian-dc-mcp/jira`, `@atlassian-dc-mcp/bitbucket`, `@aaronsb/jira-cloud-mcp` |
| **server** | Refuses to start without valid credentials | 3 | `@pinappai/mcp`, `sexai-mcp`, `formpaste-mcp` |
| **harness** | Ships a binary fetched by a postinstall script, which this harness suppresses | 3 | `vibe-hnindex`, `@algiras/debugium`, `bomly-mcp` |
| **server** | Closed the connection with no diagnostic output at all | 1 | `mendapi` |
| **unknown** | npm install did not complete | 1 | `@cstart/coldstart` |
| **server** | Blocks startup on indexing its working directory | 1 | `grasp-mcp-server` |

`harness` rows are caused by this harness's own choices and must not be reported as defects
of the server. `environment` rows are the host or the network, not either side.

Classified at render time against `failure-classes@1.1.0`.

## Grade distribution

| Grade | Count |
|---|---:|
| A | 16 |
| B | 18 |
| C | 2 |
| D | 2 |

## Defect count

A grade is a summary, and summaries launder. Alongside it, 24 deterministic predicates over
the same signals, each one a condition a reviewer would file as an issue:

| | |
|---|---:|
| Servers with at least one defect | **31 of 38** (82%) |
| Servers with at least one major defect | 28 of 38 |
| Median defects per server | 2 |
| Worst | 8 |
| Clean | 7 |

**This is a floor, not a total.** These rules cover only what a black-box probe can observe
without credentials: nothing about output correctness, runtime behaviour, or anything behind
an auth wall. A server with zero defects here is one this instrument found nothing wrong with,
which is a narrower claim than a clean bill of health.

### Most common defects in this cohort

| Servers | Severity | Defect |
|---:|:--:|---|
| 15 | major | More than 5% of parameters have no description |
| 10 | major | Exposes a tool name also exposed by another server in the cohort, which mis-selects silently with no error anywhere |
| 9 | major | At least one tool has a parameter with no usable type |
| 9 | minor | Mean description length outside the 40-600 character band (unusable when short, a token bill when long) |
| 6 | minor | Median tool definition exceeds 500 tokens |
| 6 | minor | Fewer than 30% of tool names carry a server-specific namespace |
| 5 | minor | Declares more than two required secrets, widening the credential surface |
| 5 | minor | Fewer than 60% of errors name the offending parameter |
| 4 | major | Tool definitions exceed 10,000 tokens of context |
| 4 | minor | Exposes more than 40 tools, widening selection pressure on the model |
| 4 | minor | At least one tool carries a name from the generic-name corpus |
| 4 | major | At least one malformed call returned an unstructured error |
| 4 | major | Accepts a deliberately malformed argument without error, so the model never learns it was wrong |
| 3 | major | Total context injection (tools, instructions, prompts, resources) exceeds 12,000 tokens |
| 2 | minor | More than six URLs embedded in tool descriptions |
| 2 | major | A tool description contains directive text aimed at the model |

8 of the 24 rules did not fire on any server in this cohort: `tools_missing_description`, `invalid_input_schema`, `stacktrace_in_error`, `error_leaks_filesystem_path`, `model_directive_in_instructions`, `invisible_unicode`, `secrets_via_argv`, `canary_leaked`.

## Where the cohort is weak

| Dimension | Weight | Mean score (1-5) |
|---|---:|---:|
| Token cost | 0.3 | 3.45 |
| Schema clarity | 0.2 | 4.63 |
| Error legibility | 0.15 | 4.73 |
| Tool-name collision risk | 0.1 | 4.52 |
| Prompt-injection surface | 0.15 | 4.92 |
| Auth hygiene | 0.1 | 4.91 |

## Fault taxonomy coverage

Against *Real Faults in Model Context Protocol (MCP) Software: a Comprehensive Taxonomy* (arXiv 2603.05637), 5 high-level categories, 29 named fault types in the validated survey table, 419 manually assigned labels.
This harness observes the server-side types only; host-side types are out of scope for a server probe.

| Fault type | Pass | Fail | Unknown / not reached |
|---|---:|---:|---:|
| Server Deployment | 38 | 11 | 0 |
| Server Dependency | 49 | 0 | 0 |
| Server Platform Incompatibility | 38 | 11 | 0 |
| Server Logging | 38 | 0 | 11 |
| Server Resource Synchronization | 38 | 11 | 0 |
| Server Resource Handling | 38 | 0 | 11 |
| Tool Discovery & Registration | 38 | 0 | 11 |
| Incorrect Tool Connection Setting | 38 | 11 | 0 |
| Tool Authentication | 49 | 0 | 0 |
| Tool Call / Execution | 37 | 0 | 12 |
| Tool Response Handling | 36 | 1 | 12 |
| Host Connection Mismatch | 38 | 0 | 11 |
| Documentation | 38 | 0 | 11 |

## Prompt-injection surface

| Server | Directive hits | Invisible chars | Example |
|---|---:|---:|---|
| com.adrianczuczka/mason | 2 | 0 | `generate_snapshot_batch`: Map step of the concept-map build. Returns one batch of source files (skeletons of every f |
| dev.aicommander/mcp | 1 | 0 | `remote_exec`: Execute a shell command on a remote machine running the AI Commander agent. THIS IS THE TO |

## Tool-name collisions inside the cohort

| Server | Colliding names | Examples |
|---|---:|---|
| com.gitkraken/gk-cli | 2 | `git_commit`, `git_status` |
| io.github.bitofacoder/omni-mcp-server | 2 | `git_status`, `git_commit` |
| com.githits/githits | 1 | `search` |
| io.github.apatilgtn/k8scortex-mcp | 1 | `list_events` |
| io.github.attebury/remogram | 1 | `whoami` |
| com.adrianczuczka/mason | 1 | `get_context` |
| com.kenxcomp/kenotex-mcp | 1 | `list_events` |
| io.github.Abhishekkumar2021/github | 1 | `whoami` |
| io.github.aryankumar06/infimium | 1 | `get_context` |
| com.driflyte/driflyte-mcp-server | 1 | `search` |

## Protocol era

The 2026-07-28 specification retired the `initialize` handshake and replaced it with per-request
metadata and a mandatory `server/discover` RPC. This harness probes `server/discover` first and falls
back to `initialize`, which is the order the specification gives for stdio, and records which one
answered. A server that has migrated is therefore measured rather than recorded as a failure.

| Handshake answered | Servers |
|---|---:|
| `server/discover` (2026-07-28 and later) | **0** |
| `initialize` (2025-11-25 and earlier) | **38** |
| neither, while answering JSON-RPC | **0** |
| did not start, so was never asked | **11** |

The last row is not a protocol finding. Those 11 servers failed before any handshake could
complete — most refuse to start without live credentials or deployment details — and they are broken
out by owner under **Did not run** above. Counting them as protocol failures would report a server as
broken on the strength of a missing API key.

No server in this cohort had migrated when it was measured. The cohort is pinned to versions
published before the specification was released, so this is a dated observation and not a
prediction: it is the baseline the next sweep is compared against.

## Reproducibility

`run-2026-08-13-0150-7936eadf` vs `run-2026-08-13-0208-7936eadf` on metric `tool_definition_tokens`:

- stable (0% delta): **37**
- tolerable (<= 0.5%): **0**
- unstable: **0**
- status flips between runs: **1**
- share stable or tolerable: **100.00%** against a 95% gate

**Verdict: GO**

## Method, in one paragraph

Each server is installed from npm at a version pinned in `data/cohort-dev-tooling-v1.json`, into its own empty prefix,
with `--ignore-scripts`. It is launched under a scrubbed environment with canary placeholders in every declared
credential slot, over stdio, by the official MCP client SDKs — both eras of them. The harness probes
`server/discover` and falls back to `initialize`, records which answered, paginates `tools/list`,
repeats the list in-session, reads `prompts/list` and `resources/list` where advertised, then makes deliberately
malformed calls against up to three read-only tools chosen by sorted name. A second cold session repeats the
measurement. Nothing is scored by a model: every number is a count or a ratio, so two runs of unchanged servers
must agree, and where they do not, the server is named.

### Limits, stated plainly

- Per-call response token cost against live data. Requires real credentials, which the harness never holds. Tier 2, out of spike scope.
- Runtime latency. Not reproducible on a shared desktop under variable load.
- Correctness of tool output. Requires ground truth per server.
- Remote-only servers (streamable-http or SSE with no installable package). Recorded as skipped, with reason.
- Anything requiring a model in the loop. v1.0.0 is deliberately inference-free so the numbers are deterministic; a model-judged layer can be added at v1.1 once the deterministic floor is proven reproducible.
- Protocol-version coverage. From harness 0.1.4 the probe tries the 2026-07-28 server/discover exchange and falls back to the 2025 initialize handshake, and records which one answered. It does not measure anything else about a server’s protocol conformance: not the extensions it declares, not multi-round-trip requests, not caching hints, not tasks, and not whether a modern server also still serves legacy clients. A server is measured through whichever era it answered, and both paths produce the same signal set because the measurement is tools/list output either way.
- No container runtime on this host. Network is NOT blocked; a server may reach its own API during tools/list. Servers whose tool list is fetched dynamically from a live API are the expected source of any run-over-run instability, and the reproducibility report names them.
