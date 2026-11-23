# Market comparison, GitHub reuse and dependency selection — 2026-11-24 KST

## Problem framing and overlap avoidance
Atlassian Jira already includes workflow and automation rules, routing, assignments, subtask creation, approvals in applicable products, and Rovo/Marketplace AI features. Copying generic "triage", "create subtasks", "summarize Jira" or "done checklist" has weak differentiation. Validate practical user pain via Jira admin/dev interviews if available and preserve evidence from public Marketplace app user feedback rather than assert sales volumes. The target is not "more automation" but a **traceable evidence→policy→approved execution pipeline**. This is an engineering hypothesis, NOT measured product-market fit.

## Scope: one app and selected borrowed technologies
One Forge app with five logical modules: HAE (UX/intent), LA (typed workflows/execution), TruthGate (corroborated evidence), SovereignGuard (preflight policy based on SOVIA), DataPassport (lineage/metadata based on DBVORA). One deployed package, not five servers. Three customer journeys are feature flows, not separate products. 23 planned implementation SWUs in SWU_QUEUE.json, not 23 programs.

## Verified public GitHub candidates (2026-11-24; counts are snapshots, not evidence of today's Trending rank)
| Repo | license observed in repo metadata | best use | disposition |
|---|---|---|---|
| https://github.com/xyflow/xyflow | MIT | Interactive workflow DAG, lineage nodes/edges within Forge Custom UI | PREFERRED UI library candidate; verify bundle size/Forge sandbox |
| https://github.com/statelyai/xstate | MIT | Execute/pause/approve/reconcile state machines | COMPARE to small custom transition validator before adopting |
| https://github.com/colinhacks/zod | MIT | Versioned typed IR / provider output schema validation | PREFERRED candidate |
| https://github.com/OpenLineage/OpenLineage | Apache-2.0 | Data lineage event vocabulary, metadata structure and provenance semantics | REUSE SPEC, not whole services |
| https://github.com/open-policy-agent/opa | Apache-2.0 | Policy rule evaluation reference | REUSE CONCEPT, avoid mandatory Go sidecar/overkill; compare lightweight deterministic policy |
| https://github.com/cedar-policy/cedar | Apache-2.0 | Fine-grained policy language | REFERENCE ONLY pending runtime/Forge feasibility; do not embed Rust server |
| https://github.com/langchain-ai/langchainjs | MIT | Retrieval/LLM adapter chains | OPTIONAL if free model+RAG needs exceed small typed adapter |
| https://github.com/mastra-ai/mastra | GitHub repository license metadata NOASSERTION | TypeScript agent workflows | LICENSE/PKG GATE; not selected |
| https://github.com/Graphify-Labs/graphify | Apache-2.0 | Local source graph research during development, not app runtime | OPTIONAL developer-side evaluation |
| https://github.com/n8n-io/n8n | repo license metadata NOASSERTION (fair-code specific license review required) | Research node concepts only | DO NOT copy/distribute code/UI/connector implementation |
| https://github.com/datahub-project/datahub | Apache-2.0 | Comprehensive data governance platform | DO NOT operate entire stack in hackathon; too costly to host/support |
| https://github.com/run-llama/LlamaIndexTS | MIT | Historical TS RAG framework | ARCHIVED as of lookup: DO NOT adopt archived repo |

**No evidence these are all currently ranked on GitHub Trending.** Selection criteria: concrete function, license, maintenance, dependencies, cost, integration complexity, security and performance. Trend/stars alone do not equal suitability or permission to copy.

## How to reuse legally and efficiently
1. **Package dependency:** declared license-checked npm package in package.json + lockfile; prefer this for Zod, XState, React Flow. Keep THIRD_PARTY_NOTICES & full relevant license texts when redistribution requires them.
2. **Public standard / own implementation:** use OpenLineage schema ideas or interface mapping, with compatible notices, while coding minimal Forge-specific lineage records from scratch.
3. **Functionality re-implementation:** own SOVIA/DBVORA concepts are transferred as carefully reviewed contracts, adapted to Forge trust boundary and tenant storage; no claim of copying and running existing Python source in Forge.
4. **Developer tool:** Graphify used outside shipped app to analyze authorized source. Not a runtime requirement and must not ingest real customer/private code into third-party services without approval.
5. **Avoid:** bundle n8n, clone Atlassian UI assets, copy whole database/security platforms, require paid server, wrap an existing Marketplace app or commercial-unclear code.
6. **Dependency acceptance gate:** version/sha/license/NOTICE/CVE check, browser bundle footprint, Forge platform availability, unit tests, negative tests, rights and subdependency audit. Only PASS candidates become included dependencies.

## Source provenance and historic references
Repo license and health verified via GitHub repository metadata on 2026-11-24. GitHub Trending TypeScript page showed Mastra among current displayed results, but this is not a recommendation to integrate it without rights inspection. Use primary sources and timestamps for future reports; do not invent popularity ranks, customer sales, or quantitative market share.
Official challenge: https://codegeist2026.devpost.com/
Jira Automation docs: https://support.atlassian.com/cloud-automation/
Licensing research performed here does NOT prove n8n commercial use permissions or model privacy conditions.
