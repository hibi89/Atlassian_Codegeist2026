# HAE TrustFlow for Atlassian — Codegeist 2026

**Status:** P0 canonical architecture candidate / P1 NOT_RUN / P2 NOT_RUN / release & Devpost SUBMISSION HOLD.
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
**HAE + LA** are the core orchestration principles. Recommended, **not yet owner-locked** value modules: **TruthGate** (multi-source evidence), **SovereignGuard** (SOVIA-inspired policy), **DataPassport** (DBVORA-inspired lineage). Alternatives: ImpactTwin, RecoveryPilot. One connected journey first; three meaningful customer scenarios as the product demonstration target.

## Explicit NOT_DONE
No new-repo Forge implementation, actual installation, independent review, real Jira/Confluence integration, customer data, production deployment, paid model invocation or Devpost submission has occurred just by creating these documents. Previous HAE synthetic prototype is an external reference only.

## Safety
Public repo: never upload secrets, .env, customer documents, real Jira datasets, source archives of others, or proprietary connector code. Separate owner GO for paid usage, external sensitive data, permission/security changes, risky DB, production, marketplace, main merge and submission.

Rules: https://codegeist2026.devpost.com/rules
Forge pricing: https://developer.atlassian.com/platform/forge/forge-platform-pricing/
