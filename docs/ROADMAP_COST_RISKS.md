# Roadmap, budget and risk log — KST dates (2026-11-24 baseline)

## Hard deadline
Official Devpost deadline: **2026-12-22 at 12:00 Pacific Standard Time = 2026-12-23 at 05:00 Korea Standard Time**. Prefer complete and submitted ahead of deadline; no late submission is promised.
Date-local assumptions: planning date 2026-11-24, code work priority begins 2026-11-25. Calendar estimates are targets, not elapsed-time commitments or verification claims.

| Dates (KST) | Critical outcome | Exit evidence |
|---|---|---|
| 11/24 | P0 canonical design, repo/branch/SWU, competition gate | canonical draft PR, owner choices list |
| 11/25–11/28 | P1 Forge installable skeleton + real Jira issue read and template intent | exact source SHA, local lint/smoke, development install if approved/possible |
| 11/29–12/04 | Evidence/provenance + typed IR + policy/approval preview | two failure paths, source ref and preview UI |
| 12/05–12/10 | Bounded approved Jira action + readback + receipt/lineage | owner-approved test account scopes, actual Jira result |
| 12/11–12/14 | Multi-source cross-check, user experience and journeys B/C | source/contradiction feedback, connected UI |
| 12/15–12/18 | P2 security, installation, regression, independent review & fixes | exact SHA PASS/FAIL and blockers |
| 12/19–12/21 | English Devpost write-up, real screenshots, <5min demo video | owner-reviewed ready-to-submit assets |
| 12/22 | submission buffer and owner GO, no new risky scope | actual Devpost submission URL/date only after verified |
| 12/23 05:00 | deadline | do not confuse plan with actual submission |

## Budget
**Owner goal:** zero cash expenditure. Competition registration free. Use Atlassian development/test sites and Forge free included quotas if eligible. Free tier has limits and 2026 usage-based charges may apply; owner checks console/billing and keeps paid functionality disabled. Model selection remains pending; deterministic fallback is a hard requirement. Public YouTube can be free. No paid API, hosted vector DB, model service, external logging, GPU, subscription or marketplace listing expenses without owner GO.

Cost controls: monthly execution/storage quotas checked in provider account; limit invocation, pagination, document sizes and prompt tokens; stop on cap; paid fallback OFF; synthetic demo data only; logs redacted; feature flag egress OFF. Subscription availability or free allowances aren't assumed without console confirmation. Verified actual cost = NOT_MEASURED, target KRW 0.

## Top failure risks and mitigations
| Risk | Likely failure | Mitigation / escalation |
|---|---|---|
| Cannot install Forge independently | disqualified/weak demo | Forge manifest+installation earliest; document exact site permissions |
| AI free plan unavailable/paid/privacy | cost or sensitive data leak | no-model deterministic path, synthetic opt-in only |
| Jira/Confluence permissions | 403/hidden evidence | exact user/installation scope checks, read only baseline, no blanket scopes |
| Forge vs local Python mismatch | unsupported deployment | port typed contracts to TypeScript; no mandatory localhost daemon |
| False "trusted RAG" | misleading business decision | source-level claims, UNKNOWN and conflict, human veto |
| Unintended write/duplicate | customer-visible issue | actor-bound approval, target version, idempotency/reconcile, explicit GO |
| Large 5-module scope | fails submission | one vertical journey A then B/C; no exhaustive n8n node rebuild |
| UI polish late | poor 20% design | build live state presentation early and daily |
| Whole third-party code copy | license/security risk | package-level due diligence, minimize dependencies, source evidence |
| P2 and video too late | missing submission | freeze high-risk features by 12/15, retain deadline buffer |
| Hosting/vendor outages | failed demo | graceful cached synthetic explanatory state **distinct from real functional proof**; test fresh install |
| Parallel branches conflicts | overwritten code | latest HEAD and non-overlap allowed paths, one integration owner, no force push |

## Stop/GO gates
Any new permission/scope, fee, live customer dataset, secret, production/distribution, main merge, Marketplace/Devpost submission → explicit owner GO. Independent safe coding continues; don't label unauthorized path READY.

## Stretch prioritization
Only after real end-to-end A and core P2 are feasible: extra nodes (each complete capability), optional Rovo/Atlassian MCP bonus (actual official Forge module integration mandatory), ImpactTwin, RecoveryPilot and local provider bridge. Stretch not in core 23 SWU count.
