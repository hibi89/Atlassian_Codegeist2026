import {canonical} from "../core/ir/plan.js";
const hex=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
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
  return {...result,report_integrity:"SHA256_MATCH",canonical_report:json};
 }catch{return fail("REPORT_CLIENT_DIGEST_UNKNOWN")}
}
