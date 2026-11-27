import { observationTime } from "../../evidence/observation-time.js";
import { typedTags } from "../../evidence/typed-claims.js";
import { fail, issueHint } from "../../security-context.js";
function classifyReadStatus(status){
  if(status===401||status===403)return "SOURCE_ACCESS_UNKNOWN";
  if(status===404)return "SOURCE_NOT_VISIBLE_OR_MISSING";
  if(status===429)return "JIRA_RATE_LIMITED";
  if(status>=500)return "JIRA_UNAVAILABLE";
  return "JIRA_READ_FAILED";
}

function normalizeIssue(raw,key,retrievedAt){
  const safeString=(v,max)=>typeof v==="string"&&v.length>0&&v.length<=max?v:null;
  if(!raw||typeof raw!=="object"||!safeString(raw.id,64)||raw.key!==key||!raw.fields||typeof raw.fields!=="object")return fail("JIRA_RESPONSE_INVALID");
  const fields=raw.fields;
  const updated=safeString(fields.updated,80);
  const updatedMs=observationTime(updated);
  const summary=safeString(fields.summary,500);
  const status=safeString(fields.status?.name,120);
  const issueType=safeString(fields.issuetype?.name,120);
  if(!summary||!status||!issueType)return fail("JIRA_RESPONSE_INVALID");
  const snapshot={objectId:raw.id,key,summary,status,issueType,reportedTags:typedTags(fields.labels),updatedAt:updatedMs!==null?new Date(updatedMs).toISOString():null};
  return {ok:true,snapshot,source:{provider:"jira",objectId:raw.id,sourceRef:"jira:issue:"+raw.id,uri:"/browse/"+key,version:snapshot.updatedAt,retrievedAt,visibility:"OBSERVED_AS_USER",status:snapshot.updatedAt?"VERSION_OBSERVED":"UNVERIFIED_VERSION"}};
}

async function readIssue(context,request,clock,digest){
  const hint=issueHint(context);
  if(!hint.ok)return hint;
  try{
    const res=await request(hint.key);
    if(!res||res.status!==200)return fail(classifyReadStatus(res?.status??0));
    const contentLength=res.headers?.get?.("content-length");
    if(contentLength&&Number(contentLength)>131072)return fail("JIRA_RESPONSE_TOO_LARGE");
    const body=await res.text();
    if(typeof body!=="string"||Buffer.byteLength(body,"utf8")>131072)return fail("JIRA_RESPONSE_TOO_LARGE");
    let raw;
    try{raw=JSON.parse(body)}catch{return fail("JIRA_RESPONSE_INVALID");}
    const out=normalizeIssue(raw,hint.key,clock());
    if(!out.ok)return out;
    return {...out,source:Object.freeze({...out.source,contentHash:digest(JSON.stringify(out.snapshot))}),snapshot:Object.freeze(out.snapshot)};
  }catch{return fail("JIRA_READ_UNAVAILABLE");}
}

export { classifyReadStatus, normalizeIssue, readIssue };
