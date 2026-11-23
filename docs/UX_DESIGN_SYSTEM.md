# UX / design system — evidence-native Enterprise Control Tower

## Goals
Contest Design 20% and Presentation 20% reward clarity, consistency and credible product value. A sophisticated dashboard must be grounded in real API state, not fake charts. Working label: "HAE TrustFlow — Know why. Approve what. Trace every step."

## Screens and user path
1. **Jira Issue Panel / Command**: issue context, concise natural-language text box, clickable 3 workflow examples; route unsupported requests to refusal/suggestion, no arbitrary shell or connector generation.
2. **Sources/Evidence Explorer**: provenance cards (Jira/Confluence), source links, timestamp/version, stale/contradiction/UNKNOWN labels, explanations; respect permission boundaries.
3. **Plan Studio**: typed DAG with actions and required scopes, versioned source bundle, visible step dependencies, allowed/fail routes and readable before/after preview.
4. **SOVIA Policy Gate**: actor, target, requested permissions, observed rights, exfil destination, policy decision and review reasons.
5. **Execution Timeline**: exact approval, time-bounded execution, pending/running/reconciling/succeeded/failed/unknown; remote readback receipt; duplicate safety.
6. **DataPassport**: graph source → claim → plan → approval → actual Jira action → readback; select edge for provenance and run/step/hash reference.
7. **Project Dashboard**: only real measured run counts, blocked risks and evidence states; linked detail; no invented "99.8% certainty" or enterprise results.
8. **Settings**: model/provider status (including no-AI fallback), privacy, allowed connectors, data retention; paid/external features visibly disabled until owner/user approves.

## Layout
Desktop: left nav + central workflow + side evidence inspector. Jira narrow issue panel: stacked workflow steps and compact cards; project page offers full-size diagrams. Mobile: one-column wizard Intent→Sources→Plan→Approval→Result; actions visible and keyboard-operable.
UI state completeness: loading, empty, no Jira permission, Confluence unavailable, no retrieval, conflicting evidence, stale plan, approval missing/expired, already running, failed/unknown remote result and successful verified read-back.
No green state before verified remote effect. Provenance source cards each have accurate link and no ungrounded claim.

## Tokens and accessibility (initial proposal)
8px spacing; compact enterprise typography, 14–16px body; safe 44px mobile tap targets. Navy #101827, accent #2563EB, light canvas #F8FAFC; success #138A64, caution #A96E12, danger #B42318 with text/icon in addition to color. Confirm contrast under WCAG AA and Atlassian design consistency. Reduced motion, keyboard focus and ARIA labels. Accessible HTML/table fallback for every graph.
React Flow/xyflow is a candidate under MIT (not yet installed). Optimize bundle size and verify actual Forge Custom UI capability. Third-party reference screenshots/paid templates are not product assets.

## Presentation assets / measurements
- Workflow DAG: actual states and dependencies from typed IR.
- Evidence reliability chart: SOURCE_OBSERVED / STALE / CONFLICT / UNKNOWN counts; NOT a probability of objective truth.
- Policy timeline: planned vs allowed vs actually executed.
- Lineage graph: source references and hashes attached to actual runs.
- Demo-time actual traces: synthetic data labeled SYNTHETIC; durations and savings only measured on comparable runs.
- Optional PDF (5–8 pages) / Devpost images: problem, competitive gap, architecture, real before/after evidence, security trust boundary, results, future roadmap. PDF is NOT a competition hard requirement.

## 5-minute demonstration draft (~4m25s)
00:00–00:25 real business problem and contradictory issue context.
00:25–00:50 app installed in real Jira; show naturally worded request.
00:50–01:35 evidence from Jira and authorized Confluence, stale/conflict sources.
01:35–02:10 generated bounded plan with graph, side effects and actor-bound policy.
02:10–02:45 human reviews and approves ONE exact Jira action.
02:45–03:20 actual execution, Jira read-back, run receipt and DataPassport trace.
03:20–03:55 denial/changed-source failure safely blocked, no duplicate write.
03:55–04:25 differentiation and applicable enterprise value; short CTA.
Avoid effects that mask actual app performance; caption English if video speech in Korean.
