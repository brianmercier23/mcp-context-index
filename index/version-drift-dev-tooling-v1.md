# Version drift — dev-tooling-v1

Checked 2026-08-13T03:09:26.716Z against the pinned cohort. 50 packages, npm metadata only:
nothing was installed, executed or measured.

| | |
|---|---:|
| Still on the pinned version | **27** |
| Published a newer version | **23** |
| Pinned version or package no longer on npm | **0** |
| Latest version marked deprecated | **0** |

The published index does not move when this file does. The index reports pinned versions,
and a version that moved on npm has not been measured until a sweep measures it.

## Moved past the pin

| Server | Pinned | Latest | Versions ahead |
|---|---|---|---:|
| `octocode-mcp` | 7.0.9 | **18.2.2** | 62 |
| `vibe-hnindex` | 0.1.2 | **0.12.1** | 34 |
| `infimium` | 0.3.1 | **0.5.9** | 16 |
| `@aicommander/mcp` | 1.0.17 | **1.0.49** | 14 |
| `docfork` | 1.3.0 | **2.2.5** | 13 |
| `parecode` | 0.7.0 | **0.9.1** | 4 |
| `makers-page-mcp` | 0.1.2 | **0.4.0** | 3 |
| `@automatelab/content-distribution-mcp` | 2.2.1 | **3.0.0** | 3 |
| `@aaronsb/jira-cloud-mcp` | 0.10.0 | **0.11.1** | 2 |
| `@remogram/mcp` | 0.2.0-beta.4 | **0.3.0** | 2 |
| `@smartbear/mcp` | 0.34.0 | **0.35.0** | 1 |
| `mendapi` | 0.5.6 | **0.5.7** | 1 |
| `githits` | 0.8.0 | **0.9.0** | 1 |
| `@cstart/coldstart` | 2.2.17 | **2.2.18** | 1 |
| `@aryam/fixmap` | 0.8.8 | **0.8.9** | 1 |
| `sharedoc-mcp` | 2.1.4 | **2.2.0** | 1 |
| `@bashbop/otito` | 1.6.0 | **1.6.1** | 1 |
| `@pinappai/mcp` | 0.9.9 | **0.9.10** | 1 |
| `obra-cto` | 0.3.0 | **0.3.1** | 1 |
| `reuse-before-generate` | 0.2.3 | **0.10.0** | 1 |
| `@vibemap.ai/mcp-server` | 2.8.1 | **2.9.0** | 1 |
| `@algiras/debugium` | 0.1.2 | **0.1.3** | 1 |
| `bomly-mcp` | 0.21.3 | **0.22.0** | 1 |

Re-probe exactly these, and nothing else:

```bash
ONLY="octocode-mcp,vibe-hnindex,infimium,@aicommander/mcp,docfork,parecode,makers-page-mcp,@automatelab/content-distribution-mcp,@aaronsb/jira-cloud-mcp,@remogram/mcp,@smartbear/mcp,mendapi,githits,@cstart/coldstart,@aryam/fixmap,sharedoc-mcp,@bashbop/otito,@pinappai/mcp,obra-cto,reuse-before-generate,@vibemap.ai/mcp-server,@algiras/debugium,bomly-mcp" npm run run
```

That is a partial sweep: it is flagged `partial_sweep` in the log and can never be
published as an index. Re-pinning the cohort is a separate, deliberate act.

