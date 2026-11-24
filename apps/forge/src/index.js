import Resolver from "@forge/resolver";
import { issueHint } from "./security-context.js";
import { previewTypedIntent } from "./core/ir/preview.js";
import { readCurrentJiraIssue } from "./adapters/jira/forge-reader.js";
const resolver = new Resolver();
// Extension issue key is a hint, never a grant. Jira asUser enforces access.
// No client-provided tenant, issue key, scopes, approval or URL is trusted.
resolver.define("getPanelContext", ({ context }) => issueHint(context));
resolver.define("readCurrentIssue", ({ context }) => readCurrentJiraIssue(context));
resolver.define("previewIntent", ({ context, payload }) => previewTypedIntent(context, payload?.intent));
export const handler = resolver.getDefinitions();
