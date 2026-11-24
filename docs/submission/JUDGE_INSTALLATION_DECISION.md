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
