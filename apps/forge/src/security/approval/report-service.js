import { canonical } from "../../core/ir/plan.js";
import { principal } from "../../evidence/bundle.js";
import { createReviewStore } from "../../lineage/review-store.js";
import { createRunLedger } from "../../state/run-ledger.js";
import { createApprovalBroker } from "./broker.js";
const hex=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
const aliases={"change-review":"review change","incident-coordinate":"coordinate incident","release-review":"review release"};
const policyVersion="cg-readonly-report-v1";
const fail=code=>({ok:false,code,authorization:"NONE",execution:"DISABLED"});
function createReportService({store,clock,digest,preview,development,nonce}){
 function actor(context){return development()?principal(context,digest):null}
 function key(p,id,kind){return "cg:report:"+p.tenant+":"+p.actor+":"+id+":"+kind}
 async function material(p,context,reviewId){
  const verified=await createReviewStore(store,p,clock,digest).authorizeReadOnly(reviewId,intent=>preview(context,aliases[intent]));
  if(!verified.ok)return verified;
  const run=await createRunLedger(store,p,clock).read(reviewId);
  if(!run.ok||run.state!=="POLICY_REVIEW"||run.events[0].plan_hash!==reviewId)return fail("REPORT_JOURNAL_UNKNOWN");
  const {record,current}=verified,plan=record.plan;
  // This is an independent, deliberately narrow runtime policy: an evidence
  // report may read already authorized Jira data and render metadata only.
  // No future writer may treat this policy or approval as a WRITE grant.
  const expected=plan.intent==="incident-coordinate"?["jira.issue.read","jira.issue.links.read","evidence.version.check","evidence.contradiction.check","report.evidence.generate"]:["jira.issue.read","evidence.version.check","evidence.contradiction.check","report.evidence.generate"];
  if(plan.steps.length!==expected.length||plan.steps.some((s,i)=>s.op_id!==expected[i]||!["READ","PURE","METADATA"].includes(s.side_effect)||s.permitted_scopes.some(x=>x!=="read:jira-work")))return fail("REPORT_EFFECT_DENIED");
  const freshUntil=Math.min(...current.evidence.sources.map(s=>Date.parse(s.freshness_deadline)));
  if(!Number.isFinite(freshUntil)||freshUntil<=clock())return fail("REPORT_EVIDENCE_EXPIRED");
  return {ok:true,record,current,freshUntil,binding:{plan_hash:reviewId,evidence_bundle_hash:record.evidence.bundle_hash,dependency_digest:record.graph.graph_revision,policy_version:policyVersion,capability_lock:plan.capability_lock,policy_decision:"ALLOW",graph_status:"VALID"}};
 }
 async function load(p,id){
  if(!hex(id))return null;
  const r=await store.get(key(p,id,"request"));
  if(!r||r.schema_version!=="hae.report.request.v1"||r.tenant!==p.tenant||r.actor!==p.actor||r.target!==p.target||r.effect!=="READ_ONLY_REPORT"||!hex(r.review_id)||!hex(r.nonce)||!Number.isSafeInteger(r.expires_at)||r.expires_at<=clock()||digest(canonical(r))!==id)return null;
  return r;
 }
 function binding(r,m,id){
  if(!m.ok||Object.keys(m.binding).some(k=>m.binding[k]!==r.binding[k])||r.expires_at>m.freshUntil||r.expires_at<=clock())return null;
  return {...m.binding,request_digest:id,expires_at:r.expires_at};
 }
 async function prepare(context,reviewId){
  const p=actor(context);if(!p||!hex(reviewId))return fail("REPORT_CONTEXT_DENIED");
  try{
   const m=await material(p,context,reviewId);if(!m.ok)return m;
   const n=nonce(),now=clock(),expires=Math.min(now+120000,m.freshUntil,Date.parse(m.record.plan.expires_at));
   if(!hex(n)||!Number.isSafeInteger(expires)||expires<=now)return fail("REPORT_REQUEST_INVALID");
   const r={schema_version:"hae.report.request.v1",tenant:p.tenant,actor:p.actor,target:p.target,review_id:reviewId,effect:"READ_ONLY_REPORT",nonce:n,expires_at:expires,binding:m.binding};
   const id=digest(canonical(r));await store.create(key(p,id,"request"),r);
   return {ok:true,request_id:id,review_id:reviewId,expires_at:expires,status:"AWAITING_READ_ONLY_APPROVAL",effect:r.effect,operations:m.record.plan.steps.map(s=>({operation:s.op_id,effect:s.side_effect})),authorization:"NONE"};
  }catch{return fail("REPORT_STORAGE_UNKNOWN")}
 }
 async function approve(context,id,confirmation){
  const p=actor(context);if(!p||!hex(id)||confirmation!==id)return fail("REPORT_CONFIRMATION_DENIED");
  try{
   const r=await load(p,id);if(!r)return fail("REPORT_REQUEST_UNAVAILABLE");
   const m=await material(p,context,r.review_id),b=binding(r,m,id);if(!b)return fail("REPORT_REVIEW_STALE_OR_EXPIRED");
   const a=await createApprovalBroker(store,clock).issue(p,b,confirmation);
   return a.ok?{ok:true,request_id:id,status:"READ_ONLY_APPROVED",expires_at:a.expires_at,authorization:"READ_ONLY_REPORT_ONLY"}:a;
  }catch{return fail("REPORT_STORAGE_UNKNOWN")}
 }
 async function generate(context,id){
  const p=actor(context);if(!p||!hex(id))return fail("REPORT_CONTEXT_DENIED");
  try{
   const r=await load(p,id);if(!r)return fail("REPORT_REQUEST_UNAVAILABLE");
   const m=await material(p,context,r.review_id),b=binding(r,m,id);if(!b)return fail("REPORT_REVIEW_STALE_OR_EXPIRED");
   const approved=await createApprovalBroker(store,clock).consume(p,id,b);if(!approved.ok)return approved;
   const report={schema_version:"hae.readonly.report.v1",review_id:r.review_id,status:"OBSERVED_NOT_INDEPENDENTLY_CERTIFIED",sources:m.current.evidence.sources.map(s=>({uri:s.uri,version:s.version,status:s.status})),checks:m.current.claim_review.checks.map(c=>({predicate:c.predicate,values:c.values,status:c.status,reason:c.reason})),missing:m.current.claim_review.missing_predicates??[],policy:policyVersion,generated_at:clock()};
   const reportDigest=digest(canonical(report));
   // Receipt is metadata only, not report content. Consumption precedes report
   // creation; a storage failure is ambiguous and never retried automatically.
   await store.create(key(p,id,"receipt"),{schema_version:"hae.report.receipt.v1",request_id:id,review_id:r.review_id,report_digest:reportDigest,at:clock(),effect:"READ_ONLY_REPORT"});
   return {ok:true,request_id:id,status:"READ_ONLY_REPORT_GENERATED",report,report_digest:reportDigest,authorization:"CONSUMED",execution:"NO_JIRA_MUTATION"};
  }catch{return fail("REPORT_OUTCOME_OR_STORAGE_UNKNOWN")}
 }
 async function revoke(context,id){
  const p=actor(context);if(!p||!hex(id))return fail("REPORT_CONTEXT_DENIED");
  try{
   const r=await load(p,id);if(!r)return fail("REPORT_REQUEST_UNAVAILABLE");
   const a=await createApprovalBroker(store,clock).revoke(p,id);
   return a.ok?{ok:true,status:"READ_ONLY_APPROVAL_REVOKED",request_id:id}:a;
  }catch{return fail("REPORT_STORAGE_UNKNOWN")}
 }
 return {prepare,approve,generate,revoke};
}
export {createReportService};
