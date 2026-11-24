# Devpost copy — English draft, NOT SUBMITTED

Working title: HAE TrustFlow for Atlassian
Category candidate: Apps for Software Teams (owner decision pending).
Tagline: Approve with evidence. Execute with control.

## Inspiration
A workflow may be approved when its requirements, tests and policies appear current. When a source changes before execution, teams need to understand whether the prior decision remains valid. A successful automation message is not enough to explain what was authorized or what happened.

## What it does
HAE TrustFlow is designed as a Forge-native Jira issue-panel app. HAE maps a supported natural-language intent into a bounded typed plan, and LA coordinates the workflow. TruthGate 2.0 compares permitted source revisions and reported claims, preserving missing, stale and conflicting states. SovereignGuard 2.0 binds approval to an exact request and checks the authority again before a permitted effect. ProofGraph records dependency impact, review lineage and observed receipts. The three intended demonstrations are change review, incident ownership conflict, and release evidence assurance. The deterministic path does not require a paid AI model.

## How we built it
Forge Custom UI, React, a Node.js 22 resolver, Jira as-user REST reads and an immutable derived-metadata store using Forge KVS. Optional Confluence evidence is restricted to a configured synthetic page. A fixed synthetic provider example is optional and disabled by default. No arbitrary model-generated execution, shell or customer-data upload is permitted by this design.

## Challenges and learning
Evidence availability and revisions are distinct from objective truth. A source change must invalidate a bound approval even when the recomputed classification matches. An uncertain write response must lead to read-only reconciliation rather than a blind retry. A local cap is not a provider billing guarantee. We also need to prove the actual Forge runtime, current permission semantics and independent installation.

## Current accomplishments (draft evidence, 2026-11-24)
25/25 implementation candidates; 107/107 automated synthetic tests on source 319be063f81077a02ac5ed4987105926b16f8dcd; https://github.com/hibi89/Atlassian_Codegeist2026/actions/runs/45418283729. Sixty paired full/selective observations produced the same decisions. The synthetic timing totals do not establish an overall selective speed advantage. P2 acceptance: 1/15 PASS, 11 PARTIAL, 3 NOT_RUN. Replace this section only with exact later evidence; do not claim live results from synthetic tests.

## Next
Finish development-site acceptance and separate independent reviews. Resolve judge installation portability while retaining safe scope and cost boundaries. Capture real screenshots and a real app demonstration; confirm rights, pricing and owner approval before sharing.

## Submission fields — deliberately unfilled
- Installation link: NOT_CREATED / HOLD.
- Public YouTube URL: NOT_RECORDED / HOLD.
- Final name/category: OWNER_PENDING.
- Actual live test evidence: NOT_RUN for latest source.
- Independent technical and UX audits: NOT_RUN.

Rules: https://codegeist2026.devpost.com/rules (checked 2026-11-24 KST). Do not paste this draft as a completed submission.
