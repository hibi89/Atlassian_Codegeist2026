# Judge installation portability — decision brief (HOLD)

## Verified blocker
The current feature branch intentionally gates the resolver, saved reviews and write services to DEVELOPMENT, configured cloud ID and synthetic HTF-2. This is the right owner-demo guard, not a judge distribution design. An installed production copy would reject actual core operations. No removal of this guard is authorized here.

Official Forge distribution instructions checked 2026-11-24: https://developer.atlassian.com/platform/forge/distribute-your-apps/ . A shared installation link requires a production deployment and developer-console sharing; an independent admin must be able to install and run the depicted workflow. Contest rules: https://codegeist2026.devpost.com/rules .

## Recommended separate design to approve after owner demo
Keep existing development policy unchanged. Introduce a separately reviewed judge mode on a dedicated synthetic installation, with trusted server-side environment and installation admission, explicit administrator enrollment of a designated synthetic target, actor-bound source permissions, exact approvals and same daily caps. Do not accept a browser-provided cloud ID or target as authority. No default production writes, no automatic external model or customer data, no arbitrary issue selection. Read-only operations must also be explicitly authorized. A clean judge site must be able to follow a documented safe setup without owner secrets or local infrastructure. Determine how enrollment is securely authorized (e.g., a vetted restricted-install link and verified setup flow) before coding/activation; confirm actual Forge support. If the safe clean-install workflow cannot be established, mark judge-install gate BLOCKED, not PASS.

## Exit / owner GO sequence
1. Actual development install and owner demo A/B/C, current runtime and KVS semantics, cost console checked.
2. Review judge-mode design and exact allowed permissions/tenant onboarding, threat model, retention, zero-cash policy; owner design GO before implementing any scope change.
3. Independent technical and UX audit, clean site fresh install with same verified source and explicit permissions; deny non-enrolled tenant/target and unapproved effects; test full A/B/C.
4. Owner approves specific production deployment and distribution/share link; verify installed build/version, URL and clean-site function. No general marketplace listing or unrestricted rollout.
5. Only after evidence: capture/finish presentation and submit with owner GO.

No registration, role changes, production deployment, link generation or distribution performed in this round.

## 2026-11-26 KST — current official distribution and admission constraints (design proposal only)

Official rules require a working installation link and an independent judge-site installation with the depicted behavior. Forge external sharing requires production deployment, developer-console sharing and a site administrator to install. Organization-only sharing does not suffice for an outside judge unless eligible membership is separately established. A rotated link prevents later use of the old link but does not disable existing installations; stopping sharing is not the application's authorization boundary. Sources checked 2026-11-26:
- https://codegeist2026.devpost.com/rules
- https://developer.atlassian.com/platform/forge/distribute-your-apps/
- https://developer.atlassian.com/platform/forge/runtime-reference/app-context-api/
- https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-permissions/
- https://developer.atlassian.com/platform/forge/runtime-reference/storage-api-basic/

**Proposed next design review, not approved implementation.** Maintain the current development path exactly as-is. Evaluate a separate production judge admission policy with default-denied business operations, server-observed environment/installation identity, explicit owner-authorized enrollment and an administrator-selected *synthetic* target whose real object ID and project identity are checked as the current actor. Forge documents server-side app and installation ARIs and installation-scoped storage; actual resolver/runtime semantics and Jira permission scope requirements must be verified before any change. Admin status alone does not prove that a tenant or issue is safe for the demo. A shared link or a browser-supplied ID is not authorization. The enrollment protocol, owner trust source, judge setup burden, expiry and revocation need explicit design GO. Do not transmit enrollment credentials via this public repository or include them in demo evidence.

Candidate clean-site acceptance sequence after separate approvals: (1) new installation using approved link, with product/version/environment verified; (2) unadmitted and foreign-target negative checks, zero business effects; (3) approved synthetic enrollment and current as-user rights checks; (4) A/B/C, exact stale-denial/fresh-approval/read-back/recovery with existing caps intact; (5) revoke/expire enrollment and verify blocked operation even from an existing installation; (6) capture redacted evidence and post-test costs. Judge setup must be independently reproducible, not require the developer's local CLI, personal credentials or real customer data. This is a proposed acceptance sequence, not evidence that a judge-mode app exists. Link, production activation, scope changes and new permissions remain HOLD.
