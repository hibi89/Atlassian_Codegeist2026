# Roadmap, budget and risk log — KST dates (2026-11-24 baseline)

## Hard deadline
Official Devpost deadline: **2026-12-22 at 12:00 Pacific Standard Time = 2026-12-23 at 05:00 Korea Standard Time**. Prefer complete and submitted ahead of deadline; no late submission is promised.
Date-local assumptions: planning date 2026-11-24, code work begins immediately on owner execution instruction, without waiting for 2026-11-25. Calendar estimates are targets, not elapsed-time commitments or verification claims.

| Dates (KST) | Critical outcome | Exit evidence |
|---|---|---|
| 11/24 | P0 canonical design, repo/branch/SWU, competition gate | canonical draft PR, owner choices list |
| 11/25–11/28 | P1 Forge installable skeleton + real Jira issue read and template intent | exact source SHA, local lint/smoke, development install if approved/possible |
| 11/29–12/04 | Evidence/provenance + typed IR + policy/approval preview + ProofGraph lineage/index foundation | actual typed claims, versioned graph, source ref and preview UI; 24/25 as soon as READY |
| 12/05–12/10 | ProofGraph invalidation/revalidation (24/25 before 12), bounded approved Jira action + readback + receipt/lineage | changed source blocks old approval, fresh approval, actual synthetic Jira result; owner-approved scopes |
| 12/11–12/14 | Multi-source cross-check, journeys B/C, complete UI and graph/measurement hooks | actual connected workflows and UI, feature freeze by end 12/14 |
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
Only after real end-to-end A and core P2 are feasible: extra nodes (each complete capability), optional Rovo/Atlassian MCP bonus (actual official Forge module integration mandatory), ImpactTwin, RecoveryPilot and local provider bridge. Stretch not in core 25 SWU count.

## Schedule control — owner locked
Milestones are latest internal targets not start barriers. Early finish advances next safe wave immediately; no deliberate delay. Work first on 01 then 03/02; early request D-05/06 installation/scopes and D-09 rights, D-03 AI fallback. W3/W4 graph substrate and policy in parallel only when separate allowed paths/worker tooling exists; mandatory 24/25 before writer. At each session record schedule delta (milestone reached vs target, no fabricated estimate), exact completed candidates and remaining critical blockers. If any target threatened: immediately reprioritize safe READY, isolate actual failures, request necessary specialist/owner decision early, defer optional bonus only; no silent scope cut, no unsafe gate bypass. Do not wait for full CI per P1 wave except mandatory immediate safety. Prepare synthetic fixtures/diagram/storyboard while coding without counting them as SWU; real captures after actual P2. Target package 12/19–21, owner-reviewed submission 12/22 KST, hard 12/23 05:00. Preserve 12/22 buffer; actual elapsed performance UNMEASURED.


## Owner acknowledged accelerated execution plan — 2026-11-25 KST
Owner accepted the proposed scheduling direction and requested cross-chat handoff. Preserve canonical design and all mandatory acceptance criteria; dates below are planning targets, not verified completion or blanket permission to adopt any candidate. On 11/25 (development day 2), P1 25/25 implementation candidates, P2 2 PASS / 10 PARTIAL / 3 NOT_RUN; core A positive live journey, B/C preview, Jira+Confluence read and selective revalidation demonstrated. Reached portions of original 12/11–14 work window early, not all milestone exits. Exact source 6006fe1d3d4210e90ff3a4101e17b4724f00d3cb, live evidence and post-test cost/log record at b52f473d1c6686e66b94a43355e62d66687a92f2. Current observed/forecast charges USD 0; usage delay disclosed. Existing development major 3, subsequent configuration redeploy patch number unconfirmed; no production.

| Target KST | Accelerated work |
|---|---|
| 11/26–28 | Finish critical live checks in compact owner batches; independent safe code review and candidate technology fit evaluation |
| 11/29–12/03 | Implement only selected compatible OSS/Atlassian extensions after scope, rights, platform, free-cost and risk checks |
| 12/04–08 | High-quality frontend and UX refinement preserving all functionality |
| 12/09–12 | Integration/regression and separate independent technical/security and UI review |
| 12/13–18 | Real demo, English presentation/submission materials and judge-install preparation |
| 12/19–22 | Final corrections and owner-approved submission buffer |

Next action for shortcut 2026 or ㄱ: exact remote HEAD and policy, then safe source work immediately; avoid repeated manual screenshots and unnecessary full reruns, batch owner-only tests while keeping actual safety/acceptance gates. After 11/26 09:00 KST UTC quota rollover, recheck saved review before expiry (or recreate valid synthetic fixture if expired), complete selective new draft; prioritize approved-then-changed denial and linked Jira ownership/test conflict, preserving existing comment and 24 admissions/day and one-write/day caps. No quota bypass. Use native automated tests for remaining applicable cases; real browser/permission/installation checks and independent reviews cannot be substituted by same-author synthetic tests. Judge-install portability remains a critical blocker, requires a safe design and separate production/distribution GO.
Technology selection: Rovo read-only review and Teamwork Graph integration first for feasibility/competition value; MCP secondary; React Flow, Zod, XState only if measured improvement over existing custom implementations warrants added dependency/rights risk. OpenLineage/OPA concept references, Graphify developer-side, LangChain.js optional, full ImpactTwin/RecoveryPilot stretch. Gemini remains OFF until verified free qualification and explicit opt-in. Do not count research, candidate packages or optional stretch as completed functions. No new scopes, egress, payment, original changes, main merge, production or submission authorization inferred. Preserve original baseline schedule above/elsewhere for comparison; hard deadline 12/23 05:00 KST, owner submission buffer 12/22 unchanged.
