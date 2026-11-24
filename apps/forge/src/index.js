import ResolverModule from "@forge/resolver";
import { resolveResolver } from "./forge-interop.js";
import { issueHint } from "./security-context.js";
import { previewWithPolicy } from "./security/forge-policy.js";
import { readCurrentEvidence } from "./evidence/forge-evidence.js";
import { saveCurrentReview, refreshSavedReview, prepareReadOnlyReport, approveReadOnlyReport, generateReadOnlyReport, revokeReadOnlyReport } from "./state/forge-review.js";
const Resolver = resolveResolver(ResolverModule);
const resolver = new Resolver();
// Extension issue key is a hint, never a grant. Jira asUser enforces access.
// No client-provided tenant, issue key, scopes, approval or URL is trusted.
resolver.define("getPanelContext", ({ context }) => issueHint(context));
resolver.define("readCurrentIssue", ({ context }) => readCurrentEvidence(context));
resolver.define("previewIntent", ({ context, payload }) => previewWithPolicy(context, payload?.intent));
resolver.define("saveCurrentReview", ({context,payload})=>saveCurrentReview(context,payload?.intent));
resolver.define("refreshSavedReview", ({context,payload})=>refreshSavedReview(context,payload?.review_id));
resolver.define("prepareReadOnlyReport",({context,payload})=>prepareReadOnlyReport(context,payload?.review_id));
resolver.define("approveReadOnlyReport",({context,payload})=>approveReadOnlyReport(context,payload?.request_id,payload?.expected_digest));
resolver.define("generateReadOnlyReport",({context,payload})=>generateReadOnlyReport(context,payload?.request_id));
resolver.define("revokeReadOnlyReport",({context,payload})=>revokeReadOnlyReport(context,payload?.request_id));
export const handler = resolver.getDefinitions();
