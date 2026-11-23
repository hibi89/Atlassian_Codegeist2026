# Codegeist 2026 — P1 SWU CPAA dependency DAG

**Source:** `docs/SWU_QUEUE.json` (23 planned actual feature-coding candidates); Core candidate count **0/23 implemented** at design creation. Weighted rates **UNASSESSED**. Stretch options excluded from denominator until owner scope decision. Design/docs, P2 tests and Devpost work are not SWUs.

## Critical path / phase gates
`01 Forge entry → 02 Jira reader → 04 evidence → 06 freshness + 07 contradictions → 17 evidence UI → 18 approval/execution UI → 19 core vertical A`.
Simultaneously:
- `01 → 03 intent → 05 typed IR → 09 policy → 10 approval → 12 bounded writer → 13 reconciliation → 18 → 19`.
- `05 → 11 run state → 14 lineage → 18`.
- `09+11 → 15 runtime SOVIA bridge → 19`.
- `04 → 08 Confluence` has independent read scope owner gate.
- `14 → 16 DBVORA metadata`; `19 → 20 incident`; `07+14+17 → 21 release`.
- `03+05+07+09 → 22 AI provider` requires external data opt-in; `01+09+11 → 23 quota guard`.

## Source-first waves (scheduled order; not permission grants)
| Wave | SWU IDs | Outcome and dependency purpose |
|---|---|---|
| W0 | 01, 03 | Forge skeleton, deterministic input path; independent after baseline |
| W1 | 02, 05 | Real Jira read and typed IR schema, unblock evidence and policy |
| W2 | 04, 09, 11 | Evidence, security boundary and durable state |
| W3 | 06, 07, 10, 14 | Cross checks, approval, lineage; no actual external writes |
| W4 | 15, 17, 23 | Guard and connected UI/cost stops |
| W5 | 12, 13, 18, 19 | Approved bounded Jira action, reconciliation, actual change journey A |
| W6 | 08, 16, 20, 21, 22 | Confluence/metadata/secondary journeys/AI; blocked parts do not stall independent READY |

These waves are guidance, not a blind fixed batch. On each `ㄱ` calculate CPAA from latest HEAD, dependency DAG, downstream unblock count and real owner gates, then implement 1–6 actual vertical SWUs (typical 3–6), source→caller→callee→failure path→minimal local checks→safe commit. Reassess next READY in same turn if feasible. Never increment SWU count for only docs, mocks or tests.

## S/C/I/D/U classification
S=algorithm/source behavior; C=typed contracts/state and safe API; I=Forge, Jira and integration; D=storage/provenance; U=UI. Primary dimension and relative complexity 1–3 are triage hints, NOT verified time savings or progress weights.

## Owner gates are separate from code readiness
- Production/real Forge deployment, distribution/share link, marketplace/Devpost, rights changes and main merge require owner GO.
- Adding Jira or Confluence write/read API scopes, authenticating external accounts, using free external model to transmit even synthetic content, or real customer data require authorization and service terms verification.
- Core planning/read-only source can proceed without those permission actions. DO NOT impersonate approved credentials or mark blocked writes READY.
- A code implementation candidate with no real Forge installation remains IMPLEMENTED_UNVERIFIED and lacks competition eligibility evidence.

## Retry / escalation
Per SWU initial 2 genuine no-progress code attempts → ISOLATED_REDESIGN_PENDING; newly designed distinct method 2 further failures → SOLMAX_BATCH_PENDING. Preserve every SHA/failure/evidence; no reset. High owns ordinary code errors, can request early help on real high-risk trust/DB/crypto blockers; only real independent specialized review counts P2.

## Initial status snapshot
As of 2026-11-24 KST, SWU-01 READY_CODE, others dependency-blocked or owner-gated; actual new-repo Forge implementation **NOT_RUN**; branch documentation commits do not count. Future P1 implementation SHA/feature/test evidence recorded in STATUS.
