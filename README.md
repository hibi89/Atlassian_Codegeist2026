# HAE TrustFlow for Atlassian — Codegeist 2026

**Status (2026-11-24):** P0 owner-locked v2; P1 25/25 candidates; P2 1/15 PASS, 11 PARTIAL, 3 NOT_RUN; release & Devpost SUBMISSION HOLD. See STATUS.md for exact evidence.
**Repository:** https://github.com/hibi89/Atlassian_Codegeist2026
**Deadline:** 2026-12-22 12:00 PST = 2026-12-23 05:00 KST.
**Mission:** A Forge-native, genuinely runnable Jira automation app where natural-language plans are grounded in authorized evidence, gated by policies/human approval, and followed by transparent data lineage and execution receipts.

## Source of truth and implementation
1. `docs/FINAL_BLUEPRINT.md` — product goals and immutable design contract (owner pending items explicitly marked).
2. `docs/REQUIREMENTS.md` — requirement IDs and acceptance expectations.
3. `docs/ARCHITECTURE_CONTRACTS.md` — Forge boundaries, safe plan IR, API/data/security contracts.
4. `docs/SWU_DAG.md` + `docs/SWU_QUEUE.json` — executable code-work queue and dependencies.
5. `docs/ACCEPTANCE_MATRIX.md` — actual P1/P2 proof and independent gates.
6. `docs/UX_DESIGN_SYSTEM.md` — UI/UX concept and presentation system.
7. `docs/RESEARCH_AND_DIFFERENTIATION.md` — overlap, customer demand and source checks.
8. `docs/SUBMISSION_RULES_CHECKLIST.md` — contest-specific submission gates.
9. `docs/ROADMAP_COST_RISKS.md` — dates, budget, risks and fallback.
10. `docs/OPEN_DECISIONS.md` — explicitly owner-pending decisions.
11. `AGENTS.md`, `STATUS.md`, `HANDOFF.md` — execution policy and handoff.

## Branches
- `main`: user-controlled stable baseline; **no automatic merge**.
- `design/codegeist-2026-canonical`: design/requirements/queue source of truth before owner accepts main merge.
- `develop`: review/integration branch, fast-forwarded from approved design baseline only.
- `feature/forge-p1`: new actual Forge product code and minimal tests.
- `verify/p2-*`: create only for later independent acceptance/rework.

## Current feature selection
**HAE + LA** are the foundation. Owner-LOCKED value modules: **TruthGate 2.0** (dynamic multi-source evidence), **SovereignGuard 2.0** (evidence/approval-bound execution), **ProofGraph** (DataPassport lineage + selective impact/revalidation). Bounded recovery remains in LA; full ImpactTwin/RecoveryPilot remain stretch. One connected journey first; three meaningful customer scenarios as the product demonstration target.

## Explicit NOT_DONE
Earlier development v2.1.0 read-only baseline was installed; latest source is not deployed. Live bounded write, latest runtime/KVS, independent audits, judge installation, production, public video and Devpost submission remain unverified or HOLD.

## Safety
Public repo: never upload secrets, .env, customer documents, real Jira datasets, source archives of others, or proprietary connector code. Separate owner GO for paid usage, external sensitive data, permission/security changes, risky DB, production, marketplace, main merge and submission.

Rules: https://codegeist2026.devpost.com/rules
Forge pricing: https://developer.atlassian.com/platform/forge/forge-platform-pricing/

## Start work
25 P1 SWU candidates; 15 P2 gates with one accepted. Latest native synthetic CI 107/107 PASS on source `319be063f81077a02ac5ed4987105926b16f8dcd`. See [activation runbook](docs/DEVELOPMENT_ACTIVATION_RUNBOOK.md) and [judge portability decision brief](docs/submission/JUDGE_INSTALLATION_DECISION.md). Exact scope and design: [FINAL_BLUEPRINT](docs/FINAL_BLUEPRINT.md), [INNOVATION_SPEC](docs/INNOVATION_SPEC.md), [SUBMISSION_PLAN](docs/SUBMISSION_PLAN.md). First wave 01→03/02. Dates are latest targets: finish earlier when safe; never wait for a calendar slot. No automatic main merge.

## Draft submission assets
[English copy](docs/submission/DEVPOST_DRAFT.md) · [4:25 demo script](docs/submission/DEMO_SCRIPT.md) · [synthetic measurement table](docs/submission/SYNTHETIC_EVIDENCE.md) · [benchmark figure](docs/submission/synthetic-evidence.svg). No live results or actual submission are implied.
