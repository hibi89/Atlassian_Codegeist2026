import {canonical} from "../core/ir/plan.js";
import {sourceNavigationPath} from "./source-navigation.js";
const hex=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
// Hash matching alone is not schema validation. All rendered report fields must
// have bounded types and claim citations must resolve to the returned sources.
export function reportContentShape(report){
 const bounded=(x,max=512)=>typeof x==="string"&&x.length>0&&x.length<=max;
 if(!report||report.policy!=="cg-readonly-report-v1"||!Number.isSafeInteger(report.generated_at)||report.generated_at<=0||report.generated_at>8640000000000000||!Array.isArray(report.sources)||!report.sources.length||report.sources.length>8||!Array.isArray(report.checks)||report.checks.length>256||!Array.isArray(report.missing)||report.missing.length>32||!report.missing.every(x=>bounded(x,80)))return false;
 const visible=new Set();
 for(const s of report.sources){
  if(!sourceNavigationPath(s?.uri)||visible.has(s.uri)||!bounded(s.version,80)||!Number.isFinite(Date.parse(s.version))||s.status!=="VERSION_OBSERVED")return false;
  visible.add(s.uri);
 }
 const strings=(a,max=256)=>Array.isArray(a)&&a.length<=256&&a.every(x=>bounded(x,max));
 const cites=a=>strings(a,128)&&a.length>0&&a.every(x=>visible.has(x));
 const checks=new Set();
 for(const c of report.checks){
  if(!bounded(c?.subject)||!bounded(c.predicate,80)||!strings(c.values)||!bounded(c.reason,128)||!["SOURCE_OBSERVED","UNVERIFIED_CLAIM","CONFLICT_FOUND"].includes(c.status)||!cites(c.source_uris))return false;
  if((c.predicate.startsWith("jira.")||c.predicate==="confluence.page_version")&&(!visible.has(c.subject)||!c.source_uris.includes(c.subject)))return false;
  const key=JSON.stringify([c.subject,c.predicate]);if(checks.has(key))return false;checks.add(key);
 }
 // The assessment arrays are rendered as separate panels. Reject malformed
 // or out-of-scope citations without treating reported values as certification.
 const list=(a,fn)=>Array.isArray(a)&&a.length<=256&&a.every(fn);
 const state=x=>bounded(x,80),refs=a=>Array.isArray(a)&&a.length<=8&&a.every(x=>visible.has(x));
 const a=report.release_assessment,b=report.incident_assessment;
 if(a!==undefined&&b!==undefined)return false;
 if(a!==undefined&&(!a||a.schema_version!=="hae.release.assessment.v1"||a.authorization!=="NONE"||a.execution!=="NO_JIRA_MUTATION"||a.certification!=="NOT_INDEPENDENTLY_CERTIFIED"||!state(a.status)||a.source_count!==visible.size||!strings(a.missing_predicates,80)||!list(a.requirements,x=>bounded(x?.requirement)&&state(x.state)&&refs(x.source_refs)&&(x.ownership_state===undefined||state(x.ownership_state)&&strings(x.reported_teams)&&refs(x.ownership_source_refs)))||!list(a.unmatched_tests,x=>bounded(x?.subject)&&strings(x.values)&&state(x.status)&&refs(x.source_refs))||a.unmatched_owners!==undefined&&!list(a.unmatched_owners,x=>bounded(x?.subject)&&strings(x.values)&&state(x.status)&&refs(x.source_refs))||!list(a.conflicts,x=>bounded(x?.subject)&&state(x.predicate)&&refs(x.sources))))return false;
 if(b!==undefined&&(!b||b.schema_version!=="hae.incident.assessment.v1"||b.authorization!=="NONE"||b.execution!=="NO_JIRA_MUTATION"||b.certification!=="REPORTED_EVIDENCE_ONLY"||!state(b.status)||b.source_count!==visible.size||!list(b.ownership,x=>bounded(x?.subject)&&strings(x.teams)&&state(x.state)&&refs(x.source_uris))||!list(b.unmatched_owners,x=>bounded(x?.subject)&&strings(x.teams)&&state(x.state)&&refs(x.source_uris))||!list(b.policy_versions,x=>bounded(x?.subject)&&strings(x.versions)&&state(x.state)&&refs(x.source_uris))))return false;
 return true;
}
// This verifies the exact returned bytes, not the truth of claims or a new approval.
export async function verifyGeneratedReport(reviewId,requestId,result,subtle=globalThis.crypto?.subtle){
 const fail=code=>({ok:false,code,request_id:requestId,report_integrity:"UNCONFIRMED"});
 if(result?.ok===false)return fail(typeof result.code==="string"?result.code:"REPORT_UNAVAILABLE");
 const report=result?.report;
 if(!hex(reviewId)||!hex(requestId)||result?.ok!==true||result.request_id!==requestId||result.status!=="READ_ONLY_REPORT_GENERATED"||result.run_state!=="SUCCEEDED"||result.authorization!=="CONSUMED"||result.execution!=="NO_JIRA_MUTATION"||!hex(result.report_digest)||report?.schema_version!=="hae.readonly.report.v1"||report.review_id!==reviewId||report.status!=="OBSERVED_NOT_INDEPENDENTLY_CERTIFIED"||!Array.isArray(report.sources)||!report.sources.length||report.sources.length>8||!Array.isArray(report.checks)||report.checks.length>256||!Array.isArray(report.missing)||!Number.isSafeInteger(report.generated_at))return fail("REPORT_CONTENT_UNCONFIRMED");
 if(!subtle||typeof subtle.digest!=="function")return fail("REPORT_CLIENT_DIGEST_UNAVAILABLE");
 try{
  const json=canonical(report),bytes=new TextEncoder().encode(json);
  if(bytes.length>262144)return fail("REPORT_CLIENT_SIZE_LIMIT");
  const hash=Array.from(new Uint8Array(await subtle.digest("SHA-256",bytes)),b=>b.toString(16).padStart(2,"0")).join("");
  if(hash!==result.report_digest)return fail("REPORT_CONTENT_DIGEST_MISMATCH");
  if(!reportContentShape(report))return fail("REPORT_CONTENT_SCHEMA_UNCONFIRMED");
  return {...result,report_integrity:"SHA256_MATCH",canonical_report:json};
 }catch{return fail("REPORT_CLIENT_DIGEST_UNKNOWN")}
}
