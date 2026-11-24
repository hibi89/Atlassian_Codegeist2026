import api, { route } from "@forge/api";
import { createHash } from "node:crypto";
import { readIssue } from "./reader.js";
export function readCurrentJiraIssue(context) {
  return readIssue(context, key => api.asUser().requestJira(route`/rest/api/3/issue/${key}?fields=summary,status,issuetype,updated`, {
    method: "GET", headers: { Accept: "application/json" }
  }), () => new Date().toISOString(), value => createHash("sha256").update(value, "utf8").digest("hex"));
}
