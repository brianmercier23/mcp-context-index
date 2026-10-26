# Version drift — dev-tooling-v1

Checked 2026-10-26T01:08:45.336Z against the pinned cohort. 50 packages, npm metadata only:
nothing was installed, executed or measured.

| | |
|---|---:|
| Released a newer version since the pin | **25** |
| … of which already behind npm's latest at the pin | 8 |
| Behind npm's latest at the pin, nothing released since | **8** |
| Nothing on npm newer than the pin | **16** |
| Pinned version or package no longer on npm | **1** |
| Latest version marked deprecated | **1** |

Each pin is the version the server's registry entry declared, which is not always npm's
latest: for 17 of these 50, npm already had a newer release when the cohort was pinned.
A version that existed before the pin is not drift, so "since the pin" counts only releases
past npm's latest at the pin (or past the pin itself, where that was newer).

The published index does not move when this file does. The index reports pinned versions,
and a version that moved on npm has not been measured until a sweep measures it.

## Released since the pin

| Server | Pinned | npm latest at pin | Latest now | Released since the pin |
|---|---|---|---|---:|
| `githits` | 0.8.0 | = | **0.35.0** | 45 |
| `mason-context` | 0.6.0 | = | **0.23.1** | 32 |
| `@aicommander/mcp` | 1.0.17 | 1.0.44 | **1.6.4** | 27 |
| `@bashbop/otito` | 1.6.0 | = | **3.5.0** (deprecated) | 22 |
| `bomly-mcp` | 0.21.3 | = | **0.30.0** | 15 |
| `@atlassian-dc-mcp/jira` | 0.29.0 | = | **0.38.0** | 11 |
| `@atlassian-dc-mcp/bitbucket` | 0.29.0 | = | **0.38.0** | 11 |
| `contextforge-mcp` | 0.5.0 | = | **0.13.2** | 11 |
| `@smartbear/mcp` | 0.34.0 | = | **0.42.0** | 9 |
| `vibe-hnindex` | 0.1.2 | 0.12.1 | **0.16.1** | 8 |
| `@postman/postman-mcp-server` | 2.11.2 | = | **2.14.0** | 6 |
| `@cstart/coldstart` | 2.2.17 | = | **2.3.4** | 6 |
| `@gitkraken/gk` | 3.1.70 | = | **3.1.77** | 3 |
| `ainative-zerodb-memory-mcp` | 1.2.7 | = | **1.2.10** | 3 |
| `@optimalai/optibot-mcp` | 1.4.1 | = | **1.7.0** | 3 |
| `@aryam/fixmap` | 0.8.8 | = | **0.9.0** | 2 |
| `kenotex-mcp` | 1.2.3 | = | **1.3.1** | 2 |
| `@aaronsb/jira-cloud-mcp` | 0.10.0 | 0.11.1 | **0.11.3** | 2 |
| `@metaengine/mcp-server` | 1.4.1 | = | **1.5.0** | 2 |
| `reuse-before-generate` | 0.2.3 | 0.10.0 | **2.1.0** | 2 |
| `@vibemap.ai/mcp-server` | 2.8.1 | 2.9.0 | **2.11.0** | 2 |
| `mendapi` | 0.5.6 | 0.5.7 | **0.5.8** | 1 |
| `@alex-apps/ng-token-saver` | 0.1.7 | = | **0.2.0** | 1 |
| `infimium` | 0.3.1 | 0.5.9 | **0.5.10** | 1 |
| `octocode-mcp` | 7.0.9 | 18.2.2 | **19.1.0** | 1 |

## Behind npm's latest at the pin, nothing released since

Not drift: the newer version already existed when the cohort was pinned. It has still never
been measured.

| Server | Pinned | npm latest at pin | Latest now | Released since the pin |
|---|---|---|---|---:|
| `docfork` | 1.3.0 | 2.2.5 | **2.2.5** | 0 |
| `parecode` | 0.7.0 | 0.9.1 | **0.9.1** | 0 |
| `@automatelab/content-distribution-mcp` | 2.2.1 | 3.0.0 | **3.0.0** | 0 |
| `@remogram/mcp` | 0.2.0-beta.4 | 0.3.0 | **0.3.0** | 0 |
| `sharedoc-mcp` | 2.1.4 | 2.2.0 | **2.2.0** | 0 |
| `@pinappai/mcp` | 0.9.9 | 0.9.10 | **0.9.10** | 0 |
| `obra-cto` | 0.3.0 | 0.3.1 | **0.3.1** | 0 |
| `@algiras/debugium` | 0.1.2 | 0.1.3 | **0.1.3** | 0 |

## Measuring the newer versions

Measure these at their latest versions, and nothing else:

```bash
VERSION_OVERRIDE="@smartbear/mcp@0.42.0,@postman/postman-mcp-server@2.14.0,@gitkraken/gk@3.1.77,@atlassian-dc-mcp/jira@0.38.0,mendapi@0.5.8,@atlassian-dc-mcp/bitbucket@0.38.0,githits@0.35.0,@cstart/coldstart@2.3.4,ainative-zerodb-memory-mcp@1.2.10,@alex-apps/ng-token-saver@0.2.0,@aicommander/mcp@1.6.4,@aryam/fixmap@0.9.0,kenotex-mcp@1.3.1,sharedoc-mcp@2.2.0,docfork@2.2.5,@bashbop/otito@3.5.0,@pinappai/mcp@0.9.10,contextforge-mcp@0.13.2,infimium@0.5.10,mason-context@0.23.1,parecode@0.9.1,@aaronsb/jira-cloud-mcp@0.11.3,obra-cto@0.3.1,@metaengine/mcp-server@1.5.0,vibe-hnindex@0.16.1,reuse-before-generate@2.1.0,@vibemap.ai/mcp-server@2.11.0,@remogram/mcp@0.3.0,@optimalai/optibot-mcp@1.7.0,@automatelab/content-distribution-mcp@3.0.0,@algiras/debugium@0.1.3,octocode-mcp@19.1.0,bomly-mcp@0.30.0" npm run run
```

Each server is installed at the version named, with its dependencies resolved as they stood
an hour after that version was published, so that a sibling package from the same release is
included. The overrides are recorded in the run header and the config hash, and the run is
flagged `partial_sweep`, so it can never be published as an index.
A plain re-run (`ONLY=`) would not measure anything new: it installs the pinned version on
the pin's dependencies and reproduces the published number. Re-pinning the cohort, which
moves the index itself, is a separate, deliberate act.

## No longer resolvable

- `makers-page-mcp@0.1.2` — the pinned version is gone from npm and so is the package

A measurement of a version nobody can install any more is history, not a buying guide.
These rows should be re-pinned or dropped at the next cohort revision.

## Latest version marked deprecated

- `@bashbop/otito` — latest (3.5.0) carries an npm deprecation notice

