import apiModule, { route } from "@forge/api";
import { resolveForgeApi } from "../../forge-interop.js";
import { createHash } from "node:crypto";
const api = resolveForgeApi(apiModule);
import { readIssue } from "./reader.js";
export function readCurrentJiraIssue(context) {
  return readIssue(context, key => api.asUser().requestJira(route`/rest/api/3/issue/${key}?fields=summary,status,issuetype,updated`, {
    method: "GET", headers: { Accept: "application/json" }
  }), () => new Date().toISOString(), value => createHash("sha256").update(value, "utf8").digest("hex"));
}
