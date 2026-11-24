import apiModule, { route } from "@forge/api";
import { resolveForgeApi } from "../forge-interop.js";
import { createHash } from "node:crypto";
const api = resolveForgeApi(apiModule);
import { readPage, validPageId } from "../adapters/confluence/reader.js";
import { readIssue } from "../adapters/jira/reader.js";
import { boundedLinks, collectEvidence } from "./bundle.js";
export const digest = text => createHash("sha256").update(text,"utf8").digest("hex");
export function scopedAdapter(context){
  let reads=0;
  const budget=()=>{if(++reads>18)throw Error("SOURCE_REQUEST_BUDGET")};
  return {
    // Keys are derived from server context or a visible Jira link, never client payload.
    read: key => {budget();return readIssue({...context,extension:{issue:{key}}}, k=>api.asUser().requestJira(route`/rest/api/3/issue/${k}?fields=summary,status,issuetype,updated,labels`,{method:"GET",headers:{Accept:"application/json"}}),()=>new Date().toISOString(),digest)},
    page: async()=>{
      const cloud=process.env.TRUSTFLOW_DEMO_CLOUD_ID,id=process.env.TRUSTFLOW_DEMO_PAGE_ID;
      if(!id)return null;
      // Optional configured page is a dependency only in the intended demo site/issue.
      if(!cloud||context.installContext!=="ari:cloud:jira::site/"+cloud||context.extension?.issue?.key!=="HTF-2")return null;
      if(!validPageId(id))return {ok:false,code:"CONFLUENCE_TARGET_INVALID"};
      budget();return readPage(id,pageId=>api.asUser().requestConfluence(route`/wiki/api/v2/pages/${pageId}?body-format=storage`,{method:"GET",headers:{Accept:"application/json"}}),Date.now,digest);
    },
    links: async key=>{
      try{budget();
        const res=await api.asUser().requestJira(route`/rest/api/3/issue/${key}?fields=issuelinks`,{method:"GET",headers:{Accept:"application/json"}});
        if(res.status!==200)return {ok:false,code:"LINKS_UNKNOWN"};
        const length=res.headers?.get?.("content-length");
        if(length&&Number(length)>131072)return {ok:false,code:"LINKS_UNKNOWN"};
        const body=await res.text();
        if(body.length>131072)return {ok:false,code:"LINKS_UNKNOWN"};
        const json=JSON.parse(body);
        if(json.key!==key)return {ok:false,code:"LINKS_UNKNOWN"};
        return boundedLinks(json.fields?.issuelinks,key);
      }catch{return {ok:false,code:"LINKS_UNKNOWN"}}
    }
  };
}
export function readCurrentEvidence(context){
  return collectEvidence(context,scopedAdapter(context),digest,Date.now);
}
