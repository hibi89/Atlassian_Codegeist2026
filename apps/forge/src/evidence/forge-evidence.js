import api, { route } from "@forge/api";
import { createHash } from "node:crypto";
import { readIssue } from "../adapters/jira/reader.js";
import { boundedLinks, collectEvidence } from "./bundle.js";
export const digest = text => createHash("sha256").update(text,"utf8").digest("hex");
export function scopedAdapter(context){
  return {
    // Keys are derived from server context or a visible Jira link, never client payload.
    read: key => readIssue({...context,extension:{issue:{key}}}, k=>api.asUser().requestJira(route`/rest/api/3/issue/${k}?fields=summary,status,issuetype,updated,labels`,{method:"GET",headers:{Accept:"application/json"}}),()=>new Date().toISOString(),digest),
    links: async key=>{
      try{
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
