# Codegeist 2026 Requirements — candidate frozen IDs (2026-11-24)

## Reading requirements
R-ID is stable even if scope is clarified. Every REQ has P1 implementation candidate and distinct P2 verified acceptance. Owner-approved core goal changes require a design decision log, not silent deletion. Existing historical HAE R01..R13 remain owned by source repo; these CG-IDs are a separate Forge competition scope.

| ID | Severity | Requirement | Minimum observable acceptance |
|---|---|---|---|
| CG-01 | P0 | Legit Forge app, Jira module and real Jira API | Manifest, issue panel, accessible installed site and real issue read success/error |
| CG-02 | P0 | Natural-language guided intent + no-AI template fallback | Supported intent maps to preview; unsupported intent fails explicitly |
| CG-03 | P0 | Evidence retrieval from permitted sources | Source ID/URI/updated_at/hash/retrieved_at with per-user authorization and honest UNKNOWN |
| CG-04 | P0 | TruthGate conflict/staleness cross checks | Different versions/conflicting statements classified, cannot silently certify |
| CG-05 | P0 | Versioned typed LA IR and capability registry | DAG/schema validation, reject unknown op, stale plan and direct shell |
| CG-06 | P0 | Runtime SOVIA-style preflight policy | Deny missing scope/unsafe action before any side effect and log reason |
| CG-07 | P0 | Explicit approval bound to actor/target/hash/expiry | No approval or edited source/plan ⇒ zero writes; no client-side bypass |
| CG-08 | P0 | Exactly bounded Jira write + read-back | A synthetic issue changed only after explicit GO and before/after read-back |
| CG-09 | P0 | Durable state, dedupe, audit receipts | Same run/step retry does not create unreviewed duplicate write; ambiguous receipt requires review |
| CG-10 | P0 | ProofGraph DataPassport provenance graph | Input reference → verification → approved plan → output/receipt navigable; historical lineage retained |
| CG-11 | P0 | Full Forge UI/UX | Issue context, preview, source, risk, approve, step state and recoverable errors all useful |
| CG-12 | P0 | Security/tenant/privacy baseline | Server-side identity, least privilege, no raw secret/customer data leak, fail closed |
| CG-13 | P0 | Zero-cost-first and strict external AI gating | Deterministic path works without paid key; opted-in demo model synthetic only; usage not auto-escalated |
| CG-14 | P1 | Confluence document evidence | If permitted, fetch page and version with permission-aware denial fallback |
| CG-15 | P1 | Incident workflow B | Multi-step plan with conflicting team policy, evidence, guarded action and receipt |
| CG-16 | P1 | Release workflow C | Multi-source evidence release/handoff report and cited missing facts |
| CG-17 | P1 | Model-provider swap contract | Same validated IR regardless of provider, reject hallucinated operation, no-model fallback |
| CG-18 | P1 | Read-only DBVORA-derived metadata handling | Lineage/metadata provenance and integrity checks without falsely claiming cloud DB backup |
| CG-19 | P1 | P2-ready deployment and error handling | No mandatory local daemon, installation instructions, hard failures described |
| CG-20 | P1 | Judging/presentation readiness | English description, <5min real demo, access instructions and truthful metrics |
| CG-21 | P0 | ProofGraph scoped change-impact and approval invalidation | Actual source/policy/version/access change propagates only through affected dependency closure; affected plans/approvals become stale; unrelated branches retained; unknown/incomplete index fails closed; immutable receipts |
| CG-22 | P0 | Selective revalidation and mandatory prewrite interlock | Changed critical dependencies rechecked from current authorized source; no reuse of stale approvals even if result unchanged; fresh exact approval required, prewrite guard blocks stale/unknown/changed scope; unchanged nodes reusable only if current and authorized |
| CG-S1 | STRETCH | ImpactTwin | Grounded downstream impact preview, uncertainty and human confirmation |
| CG-S2 | STRETCH | RecoveryPilot | Bounded resume/reconcile with no duplicate external side effect |
| CG-S3 | STRETCH | Additional capability nodes / bonus modules | Each added node has legal provenance, typed contract, real tests and doesn't displace core |

## Customer journey requirements
**A**: user opens actual Jira issue; asks for constrained evidence-backed review; sources observed with version; policy produces preview; actor approves; one permitted Jira write; Jira read-back and one receipt visible; expected stale/denied cases fail without side effect.

**B**: relevant Jira work context and ownership evidence; conflict detected; controlled action if permitted; multi-step step status; no generic auto-assign as sole feature.

**C**: Jira release readiness tied to related documents; missing/conflicting evidence distinguished from absent permission; read-only evidence report by default; source provenance; optional separately approved write.

## Requirement classes
- Source/capabilities S: CG-02/03/04/17
- Contracts C: CG-05/07/09
- Integrations I: CG-01/08/14/15/16/19
- Data D: CG-03/09/10/18
- UI U: CG-02/11/20
- Safety/owner gate: CG-06/07/12/13 cross-cuts all.
See SWU_QUEUE.json for stable per-task dimensions, allowed paths and acceptance.

## External legacy boundary
Original HAE/LA/SOVIA/DBVORA full product acceptance is NOT replaced or deemed complete by these CG requirements. Their source hashes/rights/test coverage must be rechecked before port. New repo contains only clean Forge code and approved independent interfaces.

## v2 acceptance refinements
CG-04 requires normalized typed claim/requirement comparisons and source identity (not URL count); distinct UNKNOWN_ACCESS versus missing, stale/contradiction. CG-06/07/08/09 require ProofGraph v2 prewrite interlock (CG-21/22) and reconciled state; no blind retry on ambiguous write. CG-11 requires visible affected/unaffected paths, invalidation reason, review queue, exact approval state and accessible table fallback. A demonstrates source change after approval and zero blocked-attempt mutation, then fresh approval and observed readback; B and C share same proof model. CG-20 requires real demo of the changed-source branch, reproducible paired measurements and truthful limitations. CG-21/22 mapped to SWU-24/25, P2-05/06/07/08/09/11/12/14. Existing IDs/classes unchanged; new CG-21 D/C, CG-22 S/C/I. 22 core REQ IDs (CG-01..22; CG-20 presentation, not P1 code denominator) + existing stretch.
