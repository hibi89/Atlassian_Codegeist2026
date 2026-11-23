# Decisions and unresolved owner gates

## Established user instructions (2026-11-24)
- One new **Atlassian Codegeist 2026 Forge application**: HAE + LA natural-language orchestration, security/lineage/evidence, actual Jira workflows and polished UI.
- At least **3 meaningful business automations** prioritized from genuine user pain, no duplication of Jira/Rovo basic features.
- Build integrated HAE, LA, existing DBVORA/SOVIA-derived features; use better open-source library if objectively useful and legally compatible.
- RAG multiple-source evidence verification; no fake claims of near-zero failure probabilities before testing.
- Free demo AI where possible; customers later choose provider/model or optional customer-side local connection; specific model undecided.
- Zero cash until absolutely necessary and owner approval; no hidden pay-per-call or automatic paid upgrade.
- Repo name provided and new canonical source created here, current user has authorized writing documentation and structuring branches; not production, paid use, main merge or sensitive data.

## Pending explicit owner decisions
| ID | Question | Safe default |
|---|---|---|
| D-01 | Confirm feature three names TruthGate + SovereignGuard + DataPassport vs ImpactTwin/RecoveryPilot | Recommendation remains provisional; common evidence/policy/lineage infrastructure may be designed |
| D-02 | Product name and visual brand | Working title HAE TrustFlow; no legal/marketplace name claim |
| D-03 | Demo AI provider/model and free terms | No-model deterministic path; do not hardcode Gemini 3.8 or other unverified model |
| D-04 | Official Devpost category and bonus strategy | Software Teams candidate; bonus stretch |
| D-05 | Create/test Forge developer account and app installation, required product read permissions | Developer-only proof, no elevated/write scopes until owner GO |
| D-06 | Scope for real bounded Jira writes and synthetic site | HOLD for actual scope granting / provider-side mutation; prepare code behind deny gate |
| D-07 | Jira/Confluence data processing/retention for actual tenants | Minimum metadata, no external real data until GO |
| D-08 | Deployment/Production/distribution/share link/Marketplace listing/Devpost submit | Separate owner GO at relevant milestone |
| D-09 | License/legal notices, OSS package inclusion versions | Require evidence+lockfile at integration |
| D-10 | Final P1 official weights and independent P2 reviewer | UNASSESSED; don't assign arbitrary 100% |

## Internal architecture decisions — reversible by evidence
A-01 Forge-native independently installable app rather than local Python HAE required for judges.
A-02 Selected contract port for HAE/LA/SOVIA/DBVORA instead of bringing four Python services to Atlassian cloud.
A-03 Read-only Jira → exact approved bounded write → remote read-back is first real path.
A-04 Graphify / REA tools are developer-side optional; all-n8n-node equivalent engine out of critical path.
A-05 React Flow/Zod/OpenLineage/XState candidate use determined by small real fixtures and Forge feasibility, not GitHub stars.
A-06 Human-reviewed source differences + policy deny, not model confidence percentages, determine safe action.
A-07 Branch §design/codegeist-2026-canonical§ is design baseline until owner merges; §main§ untouched after bootstrap.
