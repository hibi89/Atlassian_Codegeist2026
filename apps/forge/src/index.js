import ResolverModule from "@forge/resolver";
import { resolveResolver } from "./forge-interop.js";
import { issueHint } from "./security-context.js";
import { previewWithPolicy } from "./security/forge-policy.js";
import { readCurrentEvidence } from "./evidence/forge-evidence.js";
const Resolver = resolveResolver(ResolverModule);
const resolver = new Resolver();
// Extension issue key is a hint, never a grant. Jira asUser enforces access.
// No client-provided tenant, issue key, scopes, approval or URL is trusted.
resolver.define("getPanelContext", ({ context }) => issueHint(context));
resolver.define("readCurrentIssue", ({ context }) => readCurrentEvidence(context));
resolver.define("previewIntent", ({ context, payload }) => previewWithPolicy(context, payload?.intent));
export const handler = resolver.getDefinitions();
