# Architecture and interfaces — HAE TrustFlow Forge v1

## 1. Deployment
Forge Jira Issue Panel + optional Jira Project Page, TypeScript/Node backend resolver, scoped Jira REST API via official Forge API/bridge. Confluence retriever optional with own scopes/permissions. Forge KVS or supported storage only for tenant-scoped minimal artifacts. Independent original Windows Python LA, SOVIA and DBVORA remain external source systems and are **not** required in the judge's sandbox.

`Jira issue → authorized retrievers → TruthGate checks → AI/template intent mapper → strict LA IR → SOVIA preflight → preview and human approval → restricted Forge executor → Jira read-back → DataPassport receipts → HAE dashboard`

## 2. Module interfaces
| module | input | output | trust boundary |
|---|---|---|---|
| jira-adapter | validated key, server installation/user context | bounded issue/links | Jira API responses untrusted, permission scoped |
| confluence-adapter | approved page refs, user scopes | page version/excerpts | must reject inaccessible and missing scopes |
| evidence-retriever | allowed source list, query, budget | evidence bundle with provenance | no broad tenant scrape or unauthorized leak |
| truth-gate | evidence bundle + claims | SOURCE_OBSERVED/CONFLICT/STALE/UNKNOWN + reason | never assert 'truth' from AI rating |
| provider-adapter | minimal synthetic sanitized context + registry | *draft* plan JSON | never execute model text |
| planner | supported intent + observed evidence | immutable typed IR candidate + open questions | schema/type/op checks separate |
| sovia-policy | actor+context+op+data flow+approved manifest | DENY/REVIEW/ALLOW_PREVIEW; later executable token | runtime gate must enforce, not advisory log only |
| approval-broker | actor/tenant/target/plan hash/expiry | restricted approval receipt | server-originated, no mere checkbox boolean trust |
| la-executor | validated plan + approval + fresh preconditions | operation receipt and reconciled state | allowlisted fixed operations only |
| datapassport | source IDs, hashes, plan and result refs | lineage edges, run trace | metadata-only by default |
| dashboard | sanitized server states | visible steps, evidence, policy, data trace | no raw secrets or false green statuses |

## 3. Workflow Plan IR (proposed `hae.forge.plan.v1`)
Top-level fields:
- `schema_version`; `plan_id`; `plan_hash`; `site_installation_ref` (derived exclusively from runtime); `issue_key`; `intent`; `capability_lock`.
- `source_evidence[]`: immutable references and snapshots; `evidence_bundle_hash`; `policy_version`; `risk_class`.
- `steps[]`: step_id, op_id, version, typed_args, predecessor_ids, side_effects, permitted_scopes, preconditions, retry_class, time_budget_ms, compensation_summary.
- `approval_request`: actor_ref, target, allowed_effects, plan hash, evidence hash, expiry, tenant, nonce. Approval stored server side with one-time token or invalidation on changed plan.
- `created_at` and declared TTL. Reject any unknown field/capability if it would affect privileges; no stringified shell.

Allowed step states: `DRAFT`, `EVIDENCE_PENDING`, `POLICY_REVIEW`, `AWAITING_APPROVAL`, `READY`, `RUNNING`, `RECONCILING`, `SUCCEEDED`, `FAILED`, `PAUSED`, `CANCELED`, `UNKNOWN_OUTCOME_REVIEW`. State transition validator must reject out-of-order privilege escalation.

## 4. Operation registry (initial allowlist; candidates, not completed)
| op_id | effect | priority | admission |
|---|---|---|---|
| jira.issue.read | read | Core | server context + read scope |
| jira.related.search | read | Core | bounded JQL and per-user permission |
| jira.issue.links.read | read | Core | bounded |
| confluence.page.read | read | Optional P1 | Confluence read scope, page permission |
| evidence.normalize | pure | Core | sanitization, provenance preservation |
| evidence.version.check | pure | Core | timestamps + source version |
| evidence.contradiction.check | pure | Core | rules/AI hint separate, explicit UNKNOWN |
| evidence.bundle.freeze | pure | Core | hash references to source snapshots |
| plan.typed.validate | pure | Core | schema and DAG |
| policy.action.check | pure | Core | fail closed and record reason |
| human.approval.record | control | Core | authenticated actor server check |
| jira.issue.comment.create | WRITE | Core after owner GO | exact issue/length/approved text; read-back |
| jira.issue.label.set | WRITE | Stretch | owner GO, conditional update/read-back |
| audit.receipt.append | metadata | Core | dedupe, bounded retention |
| datapassport.lineage.append | metadata | Core | consistent references |
| report.evidence.generate | metadata | Core | citations, not unsupported PASS |

A node count is not a success metric. A node is supported only after actual typed contract, permission negative test, normal/critical error path and meaningful end-to-end execution.

## 5. Evidence contract (`hae.evidence.v1`)
`source_ref`, `provider`, `object_id`, `version` or `updated_at`, `retrieved_at`, `visible_to_actor`, `content_hash`, `excerpt_ref`, `claim_ref`, `evidence_level`, `verification_method`, `conflicts_with[]`, `status`. Time must be explicit and a snapshot cannot silently be substituted with latest version. Do not persist full customer document by default.
States: SOURCE_OBSERVED, VERSION_OBSERVED, CROSSCHECK_SUPPORTED, CONFLICT_FOUND, STALE_VERSION, UNKNOWN_ACCESS, UNVERIFIED_CLAIM, HUMAN_REVIEW_REQUIRED. **Independence of sources is not established by number of links**. AI/LLM answers do not create new sources.

## 6. Approval and execution contract (`hae.approval.v1`, `hae.receipt.v1`)
A valid write requires: server-side authenticated actor/tenant, installed app's least-privileged granted scope, approved exact typed args/issue, policy ALLOW, unexpired exact `plan_hash` + `evidence_hash`, verified target version/preconditions and unique idempotency/reconcile key. User approves the visible exact change, no 'approve any future edits'.
- Before write: re-read applicable issue state/version; if changed, fail stale and replan.
- After write: call Jira read API to verify actual effect and capture remote ref/status, not simply HTTP 2xx = overall success.
- Timeout/ambiguous response: read-back/inspect remote state before retry; no blind duplicate create.
- Partial plan: persist completed steps, mark UNKNOWN_OUTCOME_REVIEW and allow safe human-guided compensation; no blind rollback promise.
- Hash-only chain is an integrity *indicator* but not authenticated tamper-proof.

## 7. SOVIA policy (`hae.policy.v1`)
Default DENY for raw shell, arbitrary URL, cross-tenant read/write, secret in prompt, unapproved external egress, unsupported op, scope gap, stale evidence critical to action, revoked approval, changed target or request forged by document injection.
REVIEW for uncertain evidence/conflicting ownership/ambiguous action. ALLOW only for bounded, demonstrated action after exact actor approval. Distinguish policy *recommendation* from policy *enforcement* in code/tests.

## 8. DBVORA/DataPassport (`hae.lineage.v1`)
Record source/read version → transformation/claim → plan step → policy/approval → remote action → read-back receipt. Store run_id, step_id, source hashes, actor pseudoref, op version, data classification, consent, timestamps, status and expiry. Do **not** mirror customer Jira/Confluence business DB or claim raw DB backup or full DBVORA restoration in Forge. Host tenant storage partition verified with mock cross-install tests.

## 9. Provider adapter
`plan(intent, permitted_context, registry, cost_budget) -> draft_plan + provenance + usage`. Free trial model/edition not selected yet. Without key, deterministic templates map limited intents; do not call paid models. Reject model-created new op_id/URL/elevated scopes. Customer Ollama needs independently approved connector and reachable customer-managed endpoint, not direct localhost from Forge.

## 10. Main threats and compulsory negative cases
Prompt injection from issue description/Confluence; IDOR/cross-tenant; forged client approvals; old evidence replays; duplicate writes after timeout; secrets in logs/AI prompt; malformed JQL or path/URL; unbounded queries/cost; missing documents misinterpreted as negative proof; audit inconsistency. Implement server-bound source scopes, explicit untrusted separation, policy deny, query/time budgets, reconcile, redaction and re-evaluation. Actual high-risk behavior must have immediate local safety test before P1 candidate.

## 11. Port and licensing boundary
Source repo references (read only): `hibi89/HAE`, `hibi89/DBVORA`, `hibi89/SOVIA_sovereign`, Lightning Azent in HAE branch. A prior HAE Forge-adjacent read-only planning prototype exists in `feature/codegeist-2026-trustflow-forge` but has **not** been installed as a Forge app. Port only reviewed contracts/owned code with SHA/rights/tests; never cite prior synthetic PASS as new Forge verification. Graphify/REA study tooling is optional, not runtime. Never copy n8n connector code by default.

Official docs: https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-issue-panel/ ; https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-project-page/ ; https://developer.atlassian.com/platform/forge/apis-reference/fetch-api-product.requestjira/ ; https://developer.atlassian.com/platform/forge/tenant-data-isolation/
