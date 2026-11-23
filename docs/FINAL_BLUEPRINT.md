# CODEGEIST 2026 — HAE TrustFlow final architecture baseline v1.0
**Date:** 2026-11-24 KST · **Status:** P0 detailed baseline; 3-feature naming, AI choice, public deployment and submission are separately gated · **P1/P2:** NOT_RUN

## 0. Purpose and final product boundary
Build a **Forge-native, independently installable Atlassian app** for teams using Jira (Confluence evidence optional subject to access). The app turns approved natural-language intents into safe, reproducible, stepwise workflows; each action is tied to source evidence, policy/approval and an inspectable outcome. It must be able to demonstrate real functionality rather than a click-through mock-up or a repackaged Jira Automation rule.

**Working name:** HAE TrustFlow for Atlassian (rename only by tracked decision).
**Primary track candidate:** Apps for Software Teams. No category officially selected on Devpost yet.
**Customer pain:** AI/workflow automation acts on incomplete/outdated or contradictory context; managers cannot tell why a change occurred or whether it was within policy; tracing and recovery are opaque.
**Differentiator:** Evidence → policy-aware plan → user approval → bounded execution → independently read back outcome → data lineage/audit receipt, displayed in a single polished Forge UX.
**Non-goals:** copy n8n, implement all n8n nodes as a blocking deliverable, clone Jira Automation/Rovo, certify document truth, promise universal 0-error operation, provide automatic enterprise DB backup through Forge, promise offline-only Forge sovereignty, unbounded AI code execution.

## 1. Locked business/product decisions
1. Zero-cash development target; paid features, models, servers and deployment charges not automatically permitted. Usage caps are verified with the owner's developer console; exceeding a free tier can incur costs even for free apps.
2. User's demo uses a **free qualified model only if available**; exact Gemini or other version left undecided. No external confidential source to free-tier providers. A deterministic offline-template/no-model route is always built first.
3. Users later choose permitted external provider/API key or customer-managed model through a **pluggable provider adapter**. Forge cannot directly reach arbitrary customer localhost; secure customer-side bridge is a later independently approved option.
4. Reuse validated ideas/contracts of HAE (natural-language/UI), Lightning Azent (LA: typed IR, run state, safe execution), DBVORA (metadata, integrity and lineage), SOVIA (risk and approval audit). Their source repos remain untouched, not automatically copied, and retain their independent release gates.
5. Real Forge Jira installation and functioning workflow precede node breadth. Design quality and story/visual evidence are integral.
6. Natural language and retrieved documents are **untrusted suggestions**, not authority to call write APIs.
7. Primary capabilities proposed: TruthGate evidence corroboration; SovereignGuard policy execution; DataPassport end-to-end lineage. **Exact selection of three branded modules remains OWNER_PENDING.** ImpactTwin and RecoveryPilot are reserve options, not silently included in core scope.

## 2. Top three customer journeys (meaningful, not trivial Jira duplicates)
### Journey A (P0 critical): evidence-backed change execution
User asks: "Review the requested incident/change against the current policy, show evidence and safely add the review outcome to this Jira issue."
- Jira issue and authorized associated context read using installation/user permissions.
- Retrieval collects cited Jira issues and accessible Confluence pages, with source IDs, update time, and limited excerpts; zero-access results become UNKNOWN, not negative evidence.
- Truth checks: source existence, stale source, conflicting revision/date/wording, missing ownership or acceptance data. Semantic claims are suggestions needing human review, never certified by model consensus alone.
- Model or deterministic template produces **draft typed IR** only.
- Sovereign policy computes allowed operations/scopes, external transfer visibility, risk and side effects; user previews exact target, diff and planHash.
- User approves a specific bounded write, e.g. create a short Jira audit/comment on synthetic issue; before executing server re-reads rights and preconditions, revalidates plan/approval, checks dedupe key.
- LA style executor executes allowlisted operation through Forge as an appropriately scoped actor. Status is reconciled against Jira actual state; receipt generated, timeline + data lineage displayed.
- On mismatch/failure/stale context: do not write or blind retry. Show actionable HOLD/review and if safe, fresh plan/versioned approval.

### Journey B (P1): incident context/coordination
User asks: "Find relevant linked incidents/decisions and prepare a guarded response plan without assigning to the wrong team."
- Observe linked records; show source/version/relevance with conflicting ownership policy.
- Preview a multi-step plan to comment/link/update one bounded target.
- Require owner approval and give partial failure/reconcile evidence; do not duplicate Jira's basic auto-assignment alone.

### Journey C (P1): release evidence and handoff
User asks: "Which release items are missing proof or contradict the latest acceptance criteria? Prepare a review report."
- Cross-source evidence presence, version and provenance; do not equate a URL with tested PASS.
- Gate on unresolved conflicts and explicit human review; create an auditable report/evidence snapshot.
- Default read-only; optional approved Jira comment as a live end-to-end action.

## 3. Product components and conceptual ownership
- **HAE**: UX / workflow assistant; natural language, templates, minimal clarification, evidence lens, previews, approval, timeline, repairs.
- **LA**: validated versioned DAG, deterministic and restricted operation registry, state machine, retry bounds, read-back reconciliation, execution receipts.
- **TruthGate**: retrieval, provenance, validity conditions, cross checks, conflict/unknown classification; not an omniscient 'trust score'.
- **SovereignGuard**: SOVIA-inspired policy check BEFORE execution, scopes, high-risk consent and runtime guard; offline SOVIA post-hoc advisory is not sufficient to claim real blocking.
- **DataPassport**: DBVORA-inspired source→transform→action→output lineage, receipts, integrity/snapshot metadata; Forge-hosted storage is not the same as DBVORA local SQLite backup.
- **Forge integration**: Jira Issue Panel for contextual experience, Project Page for dashboards; own installable Forge manifest, resolver and scoped Jira/Confluence API calls.
- **Model Provider**: deterministic template + selectable free model when verified; provider-independent plan schema; optional Rovo/Atlassian MCP later.

## 4. One coherent UX
A. Jira Issue Panel: "What should be done?", guided action input; accessible evidence count / conflict severity; review plan in human language.
B. Execution Workbench: DAG/step list, state badges, exact proposed write target/change, source links, policy reasons, actor/expiry and confirmation.
C. Evidence Explorer: source cards with URI, revision, retrieved timestamp, evidence status, contradictions and missing data; never manufactured confidence %.
D. Policy Console: permissions asked vs granted, allowed/denied steps, data egress destinations, human override only if specific policy permits.
E. DataPassport: provenance graph, no raw customer data in public logs, step receipts and exact success/read-back/refused outcome; recovery dashboard.
F. Project overview: recent bounded runs, trends from actual synthetic measured data with provenance; top-level indicators never implied real enterprise production.

Design language: Atlassian-consistent navigation, high contrast and keyboard focus, clean cards, readable graphs, progressive detail, responsive widths; no flashy fake security. UI must match backend state. See UX_DESIGN_SYSTEM.

## 5. Platform: Forge-native reviewability first
Required: `manifest.yml` + legitimate Forge modules, Jira REST read, hosted UI + resolver or supported Forge bridge, restricted storage. Primary read path implements Jira issue first, Confluence secondary if scopes/access allow.
- No mandatory local LA/DBVORA Python process or independent paid remote server for judge installation.
- Forge Node.js/TypeScript port/adapter reproduces only selected validated safe contracts; prior HAE prototype remains an external source, not magically running in Forge.
- Store only tenant-scoped necessary plan metadata, hashes, provenance, policy outcome and scrubbed receipts in Forge storage. Validate current limits and tenant isolation; no invented filesystem or direct arbitrary SQL storage claims.
- Free AI calls use synthetic demo context only and explicit opt-in, with hard limits; deterministic template route supports judge experience without an external paid key.
- External connector sync and user-provided API keys are future capabilities requiring real privacy/security review. Do not write capability label 'supported' until a test passes.

## 6. Guardrails and evidence states
- **Source strength levels:** SOURCE_OBSERVED, VERSION_OBSERVED, CONTENT_CROSSCHECKED, INDEPENDENTLY_TESTED, HUMAN_APPROVED; separate TESTED from conjecture. UNKNOWN/STALE/CONFLICT are first class.
- Every reading permission is bounded; no exposed data or citations for documents the current user cannot read.
- A claim 'one paragraph contains a URL' != 'tests passed'. AI agreement != truth; source authenticity and independence differ.
- Any write requires checked effective rights, exact target, typed input, immutable plan/evidence hash, expiry, actor, approval scope, idempotency and observed read-back.
- Deny unregistered operations, unauthorized cross-tenant access, unapproved network egress, arbitrary AI-generated code/shell and unsafe or blind retries.
- Audit integrity uses digest linkage and read-back; unless independently cryptographically anchored, **not** tamper-proof / certified.
- Use synthetic evidence until owner approves real datasets; all public repo code/data must be nonsensitive.

## 7. Hackathon gate, P1 and P2 distinction
**P1 core candidate** must deliver at least one end-to-end, installable Forge Jira journey: issue read → evidence retrieve → structured plan → risk/approval → constrained actual Jira operation → read-back → receipt/UI, plus main critical errors. Journeys B,C provide breadth on shared contracts. AI adapter optional for P0; exact free model only after permit/verification.
**P2**: separate actual Forge install/judge-style test, usability, stale/unauthorized/duplicate/partial-failure security, tenant data isolation, regression, browser responsive/keyboard, real provider access with synthetic data, independent code audit, cost console and reproducible evidence.
**Submission**: installable app, valid install instructions, public YouTube demo shorter than 5min, Devpost English project explanation/category/bonus evidence. This process requires specific owner GO for production/public sharing.
**Stretch**: more verified nodes, ImpactTwin simulation and RecoveryPilot, Rovo agent, rovo:mcp or Teamwork Graph only once core gate met; do not trade completion of main journey for node-count KPI.

## 8. Non-negotiable gates
No automatic payments or subscriptions, customer content external transmission, permission/security changes, secrets, public application deployment, original repository changes, destructive source/DB changes, Marketplace submissions, production/Devpost submissions or merge into main without owner GO. Document-only commits and a draft PR are permitted in this task.

## 9. Explicit unknowns / next decisions
- Official app name, precise three feature brands, Rovo bonus category, actual model/provider/free-tier terms, verified legal reuse, scope of Jira write action and owner production/Devpost approval remain pending.
- All percentages are UNASSESSED until denominator and acceptance evidence; no new code or real Forge install by this document.
