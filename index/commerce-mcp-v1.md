# Commerce MCP index: commerce-mcp-v1

Measured 2026-10-25 · run `run-2026-10-25-1517-cd900dba` · config `cd900dba` · rubric 1.1.1 · tokenizer gpt-tokenizer o200k_base

The MCP servers that online stores expose to shopping agents, through the Universal Commerce Protocol (UCP) and the Personal Agent Protocol (PAP). Each store publishes a manifest naming its MCP endpoint; this index connects to that endpoint as an agent would and measures what the agent is handed before it does anything.

| | |
|---|---|
| Endpoints attempted | **38** across **27** implementations |
| Measured | **22** endpoints, **16** implementations |
| Cheapest tool surface | **273** tokens |
| Most expensive | **45,030** tokens |
| Spread | **164.9x** |
| Answering the 2026-07-28 handshake | **4 of 22** measured endpoints |
| Reproducibility | **22 of 22** byte-identical across two full sweeps, 0 grade changes |

## Read the caveats first

1. **Not a random sample.** Stores were picked from public adopter directories (ucpchecker.com, papchecker.com), one to three per platform. The unit being graded is the implementation, not the store.
2. **Stores on one platform share one tool surface.** Of the 4 implementations probed on more than one store, 3 returned a byte-identical surface on every store; `shopify-ucp` differs between stores only by optional store-level tools, and its range is shown. A grade here describes the platform or plugin, and every store on it inherits it.
3. **Read-only, and so narrower than the dev-tooling index.** The probe performs the handshake and lists tools, prompts and resources. It never calls a tool, so no cart, checkout or account action is attempted. Error legibility is therefore unmeasured, and the scoring drops that dimension from the weighting rather than scoring it zero. Name collisions are not scored: shared tool names are the point of a shared protocol.
4. **Output schemas are counted.** The protocol ships them, so the rubric counts them. Some agent hosts inject only names, descriptions and input schemas; that lower bound is shown beside every figure.
5. **Credentialed endpoints are reported, not graded.** Endpoints that require a session token or API key before listing tools were not measured. Both protocols allow that.

## Measured

| Implementation | Protocol | Endpoints | Handshake | Tools | Tool-definition tokens | Input-only | Grade | Defects |
|---|---|---:|---|---:|---:|---:|---|---|
| shopify-ucp | UCP | 3 (2 surfaces) | legacy 2025-11-25 | 13–15 | 41,361–45,030 | 12,854–15,010 | **D** (C uncapped) | tool_defs_over_10k, context_injection_over_12k, median_tool_over_500, description_length_out_of_band |
| pap:ample | PAP | 1 | modern 2026-07-28 | 104 | 16,066 | 16,066 | **C** (B uncapped) | tool_defs_over_10k, context_injection_over_12k, tool_count_over_40, params_missing_description |
| vtex-adapter:vtex-ucp-adapter | UCP | 1 | legacy 2025-11-25 | 9 | 3,136 | 3,136 | **B** | params_missing_description |
| salla-ucp | UCP | 2 | legacy 2025-06-18 | 12 | 3,002 | 3,002 | **B** | untyped_params |
| magento-agent-mcp | UCP | 1 | modern 2026-07-28 | 14 | 2,953 | 2,953 | **B** | params_missing_description, untyped_params |
| woo-plugin:wp-json/wt-ucp/v1 | UCP | 1 | legacy 2025-11-25 | 13 | 2,419 | 1,978 | **B** | params_missing_description, untyped_params |
| woo-plugin:wp-json/ucp/v1 | UCP | 1 | legacy 2025-11-25 | 8 | 2,398 | 1,758 | **B** | params_missing_description |
| pap:tilopay | PAP | 1 | legacy 2025-11-25 | 6 | 1,981 | 1,981 | **B** | params_missing_description |
| custom:/hooks/ucp/mcp | UCP | 1 | legacy 2025-06-18 | 9 | 1,815 | 1,466 | **B** | untyped_params |
| vtex-adapter:catyai | UCP | 1 | legacy 2025-11-25 | 2 | 1,734 | 1,734 | **B** | median_tool_over_500, description_length_out_of_band |
| custom:agentdiet (ucpchecker lists under Shopware) | UCP | 1 | legacy 2025-11-25 | 15 | 1,633 | 959 | **B** | untyped_params |
| wix-ucp | UCP | 3 | legacy 2025-03-26 | 8 | 1,236 | 1,236 | **B** | untyped_params |
| odoo-ucp | UCP | 1 | legacy 2025-06-18 | 3 | 1,227 | 1,227 | **A** | median_tool_over_500 |
| jumpseller-ucp | UCP | 2 | modern 2026-07-28 | 7 | 1,216 | 1,216 | **B** | untyped_params, weak_namespacing |
| woo-plugin:/ucp/mcp | UCP | 1 | legacy 2025-11-25 | 3 | 376 | 376 | **B** | params_missing_description, untyped_params |
| shopify-storefront-mcp | Shopify native | 1 | legacy 2025-11-25 | 1 | 273 | 273 | **A** | — |

The heaviest surface, **shopify-ucp**, costs 45,030 tokens, 25x the median implementation (custom:/hooks/ucp/mcp, 1,815). Its heaviest single tool is `complete_checkout`. Where an implementation shows more than one surface, the difference is store-level features (for example, retail-location tools on one store), not a different implementation.

Implementations already answering the 2026-07-28 handshake: `pap:ample`, `magento-agent-mcp`, `jumpseller-ucp`.

## Not measured, and why

| Implementation | Protocol | Endpoints | Reason | Attribution | Detail |
|---|---|---:|---|---|---|
| bigcommerce-ucp | UCP | 2 | `auth_required` | by design | Requires credentials before tools/list. Permitted by the protocols; the tool surface is not visible to an anonymous agent. |
| woo-plugin:wp-json/univcopr/v1 | UCP | 1 | `no_handshake_response` | server | Answers JSON-RPC but implements neither the 2026-07-28 nor the 2025 handshake. |
| pap-sandbox | PAP | 1 | `auth_required` | by design | Requires credentials before tools/list. Permitted by the protocols; the tool surface is not visible to an anonymous agent. |
| pap-demo:poppyseed | PAP | 1 | `auth_required` | by design | Requires credentials before tools/list. Permitted by the protocols; the tool surface is not visible to an anonymous agent. |
| pap:stacktree | PAP | 1 | `auth_required` | by design | Requires credentials before tools/list. Permitted by the protocols; the tool surface is not visible to an anonymous agent. |
| pap:saferate | PAP | 1 | `auth_required` | by design | Requires credentials before tools/list. Permitted by the protocols; the tool surface is not visible to an anonymous agent. |
| pap:autoura | PAP | 1 | `auth_required` | by design | Requires credentials before tools/list. Permitted by the protocols; the tool surface is not visible to an anonymous agent. |
| pap-bench:neutral-state | PAP | 2 | `auth_required` | by design | Requires credentials before tools/list. Permitted by the protocols; the tool surface is not visible to an anonymous agent. |
| tray-ucp | UCP | 2 | `not_an_mcp_endpoint` | server | The endpoint advertised in the store manifest answers with a web page, not MCP. |
| boutir-ucp | UCP | 2 | `invalid_protocol_version` | server | initialize returns a protocolVersion no MCP client recognises, so a spec-following client refuses the session. |
| ucp-sandbox (reference) | UCP | 1 | `invalid_tool_schema` | server | tools/list answers, but its result fails MCP schema validation in the client. |

## Publishing UCP without an MCP transport

These stores publish a UCP manifest that declares no MCP endpoint (REST or embedded checkout only), so there is nothing to probe. Recorded because it is part of the adoption picture.

- **bareconnect**: 3 stores checked
- **cafe24**: 2 stores checked
- **tiendanube**: 1 store checked
- **shoptet**: 2 stores checked
- **zid**: 2 stores checked
- **woocommerce**: 9 stores checked
- **custom**: 2 stores checked

## Not covered

Shopware: ucpchecker's examples are agentdiet.dev subdomains, not Shopware stores; no Shopware store found. WooCommerce: about 14 UCP plugins on WordPress.org (max 70 active installs); live endpoints are only findable for the 4 measured. Covering the rest means installing plugins on a test WordPress, which executes their code: a different method.

## Reproduce

```bash
cd harness
COHORT=commerce-mcp-v1 node src/remote.js   # twice; about two minutes each, read-only
COHORT=commerce-mcp-v1 node src/remote-report.js
```

Every endpoint, store and manifest source is in the cohort file; every measurement is in `results/remote-runs.jsonl`.
