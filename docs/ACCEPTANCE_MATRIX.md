# Acceptance matrix / actual evidence gates

## Status semantics
NOT_RUN = did not execute; BLOCKED = required authority/environment missing; PARTIAL = scope-limited; PASS = reproducible exact commit SHA result. P1 IMPLEMENTED_UNVERIFIED is not P2 VERIFIED. Official weighted implementation/verification rates **UNASSESSED** until scoring denominator agreed and evidence exists.

## P1 functional acceptance
| Gate | Requirements | Actual evidence required | Initial status |
|---|---|---|---|
| P1-A | CG-01 | manifest and Forge actual issue panel source, error handler, no copied source | NOT_RUN |
| P1-B | CG-02/05 | intent/template→schema-valid plan→reject unknown op/cycle/shell | NOT_RUN |
| P1-C | CG-03/04/14 | real permissioned Jira/Confluence read, dated evidence, conflict/unknown | NOT_RUN |
| P1-D | CG-06/07/12 | runtime deny and actor/hash-bound approval, core unsafe negative cases | NOT_RUN |
| P1-E | CG-08/09 | explicit approved Jira write on synthetic issue, readback & dedupe | OWNER_GO / NOT_RUN |
| P1-F | CG-10/18 | step receipts and ProofGraph DataPassport lineage with distinct source/change references | NOT_RUN |
| P1-K | CG-21/22 | actual invalidation closure + selective revalidation + mandatory prewrite interlock with stale denial and fresh approval | NOT_RUN |
| P1-G | CG-11 | functioning UI from real BE states, no decorative-only graphs | NOT_RUN |
| P1-H | CG-15/16 | incident and release journeys with concrete nonduplicative value | NOT_RUN |
| P1-I | CG-13/17 | no-cost fallback, optional model adapter with disabled paid paths | NOT_RUN |
| P1-J | CG-19 | package build/install path explained and errors surfaced | NOT_RUN |

## P2 independently verifiable gates (not P1 SWUs)
| ID | Scope | Required PASS |
|---|---|---|
| P2-01 | Baseline build/manifest | Forge lint and build on exact source SHA |
| P2-02 | Installation | Judge-style fresh test site install with real install link, owner approval |
| P2-03 | Jira/Confluence | Approved synthetic site API operations, denies, scopes and pagination |
| P2-04 | Intent/IR | Unexpected input, malformed JSON, stale plan, cycle, unknown operation |
| P2-05 | Source reliability | Missing/stale/conflicting evidence and denied document access visibly distinct |
| P2-06 | Security | Tenant isolation, IDOR, prompt injection, privilege and approval forgery |
| P2-07 | Write consistency | Duplicate request/ambiguous timeout/read-back, exact bounded side effect |
| P2-08 | State/DBVORA | Storage integrity, receipt reference and no unsupported backup claim |
| P2-09 | SOVIA gate | Policy actually blocks prohibited operation, not just post-hoc advisory |
| P2-10 | AI/Privacy | No key/no model, redaction, opt-in and quota, no secret logging |
| P2-11 | UX | Chrome/Edge browser, keyboard/focus, mobile width, empty/error/loading |
| P2-12 | Regression/performance | Reproducible runs, actual duration/resource measurements, no invented KPI |
| P2-13 | Independent review | Separate authorized code/security review and UI/UX review, NOT_RUN until executed |
| P2-14 | Submission E2E | Fresh judge install + <5m real public YouTube + English Devpost draft reviewed |
| P2-15 | Rights and cost | Third-party licenses, owner usage charges/production/Marketplace GO |

Real P2 gates cannot be satisfied by a prior HAE synthetic CI run, screenshot of a mock UI, an AI assertion or same-author self-review.

## Exact evidence record schema
`gate_id, req_ids[], source_sha, env, actor, test_command_or_url, expected, observed, PASS|FAIL|SKIP|NOT_RUN, artifact_ref, risk, timestamp_kst, independent_reviewer, approval_ref`. If a result cannot be attributed to actual running code at exact SHA, report NOT_RUN or PARTIAL.

## Hackathon quality checklist
- Technology 20%: nontrivial installable working Forge app, not hardcoded one case.
- Design 20%: coherent accessible app, effective visual feedback.
- Potential Impact 20%: credible customer problem and actual measured evidence.
- Innovation 20%: linked evidence/policy/lineage vs Jira Automation/Rovo duplicates.
- Presentation 20%: end-to-end under-5-minute demo with readable captions and transparent scope.
These are official equal-weight criteria; never mislabel internally invented 100-point sub-scores as competition results.

Official rules: https://codegeist2026.devpost.com/rules

## v2 mandatory acceptance extensions (same 15 P2 gates; all NOT_RUN)
| Gate | Added case and pass condition |
|---|---|
| P2-04/05 | Typed conflicting claims, duplicate/derived sources, no access, stale and same-result-new-version distinct; source/policy change after approval causes review; no invented certainty |
| P2-06/09 | Forge runtime identity, forged graph/revision/approval, revoked scope, bypass direct writer, cross-tenant graph traversal; unauthorized effects 0 in defined fixtures, no bypass; critical unknown fails closed |
| P2-07/08 | Changed approval rejected before actual dispatch, fresh human approval, exact observed Jira readback; duplicate/concurrent reservation, crash before/after call, ambiguous timeout, no blind replay, immutable historical receipt; test 2 attempts against same synthetic target |
| P2-08/12 | Dependency diamond, unrelated branch, cycle/orphan/cap, policy/access change, stale index, duplicate/out-of-order hints if event feature; affected set equals independent fixture oracle; selective recheck vs full recheck same safety decision; compare count/time, no fabricated gain |
| P2-10 | No external AI necessary; quota/egress opt-in/redaction verified; denied without key |
| P2-11 | Accessible live graph & list, affected/unaffected states, reason, revalidate/reapprove; no green before readback |
| P2-13/14 | Independent technical and design reviewers actually run; judge fresh site install; normal + stale-source denial + new approval/readback demo, video/English/installation link |
| P2-15 | Versioned rights/NOTICE, cost console/approval; optional bonus separately proved |
Suggested fixtures minimum: 20 mixed change scenarios (include unrelated, same-result version change, access revoke, policy update, multiple affected nodes and broken graph), 10 unauthorized/replay/timeout cases plus 3 complete customer journeys. Counts are planned test scope, not current PASS. Independent oracle from explicitly authored fixture expected affected nodes/decisions, not the engine itself. Record actual confusion counts and sample size. Full P2 remains separate from P1; no independent audit until real execution.
