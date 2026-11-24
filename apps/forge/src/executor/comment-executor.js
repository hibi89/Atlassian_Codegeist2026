import {commentBody,commentObservationDigest,commentLineage} from "../lineage/receipt-lineage.js";
import {canonical} from "../core/ir/plan.js";
import {validateCommentPlan,denyWrite} from "../security/write-policy.js";
const hex=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
const validId=x=>typeof x==="string"&&/^[1-9][0-9]{0,30}$/.test(x);
export const adfComment=commentBody;
function observedComment(c,plan,accountId){
 if(!c||!validId(c.id)||typeof accountId!=="string"||c.author?.accountId!==accountId)return false;
 const b=c.body;
 // Require exact canonical ADF rather than accepting extra marks or attributes.
 try{if(canonical(b)!==canonical(adfComment(plan.typed_args.comment)))return false}catch{return false}
 return b?.version===1&&b.type==="doc"&&Array.isArray(b.content)&&b.content.length===1&&b.content[0]?.type==="paragraph"&&Array.isArray(b.content[0].content)&&b.content[0].content.length===1&&b.content[0].content[0]?.type==="text"&&b.content[0].content[0].text===plan.typed_args.comment;
}
async function readback(transport,plan,accountId,id,digest){
 try{
  if(validId(id)){
   const r=await transport.get(plan.target,id);
   if(r?.status===200&&r.comment?.id===id&&observedComment(r.comment,plan,accountId))return {state:"OBSERVED_SUCCESS",comment_id:id,observation_digest:commentObservationDigest(plan,id,digest)};
   // A known remote ID must never be substituted with a different comment.
   return {state:"UNKNOWN_OUTCOME_REVIEW",known_comment_id:id};
  }
  // For ambiguous transport responses, bounded recent-comment lookup only.
  // Absence in this window never proves that the write did not happen.
  const list=await transport.recent(plan.target);
  if(list?.status!==200||!Array.isArray(list.comments)||list.comments.length>20)return {state:"UNKNOWN_OUTCOME_REVIEW"};
  const hits=list.comments.filter(c=>observedComment(c,plan,accountId));
  return hits.length===1?{state:"OBSERVED_SUCCESS",comment_id:hits[0].id,observation_digest:commentObservationDigest(plan,hits[0].id,digest)}:{state:"UNKNOWN_OUTCOME_REVIEW"};
 }catch{return {state:"UNKNOWN_OUTCOME_REVIEW",...(validId(id)?{known_comment_id:id}:{})}}
}
export function createCommentExecutor({store,p,clock,digest,transport,accountId,canDispatch=()=>true}){
 const key=(id,kind)=>"cg:comment:"+p.tenant+":"+p.actor+":"+id+":"+kind;
 const reservationKey=plan=>"cg:comment-review:"+p.tenant+":"+p.actor+":"+plan.review_id;
 const result=(id,state,extra={})=>({ok:state==="OBSERVED_SUCCESS",request_id:id,status:state,execution:state==="OBSERVED_SUCCESS"?"JIRA_COMMENT_READBACK_OBSERVED":state==="BLOCKED_BEFORE_DISPATCH"?"NO_JIRA_MUTATION":"REVIEW_REQUIRED",...extra});
 async function dispatch(plan,id,preflight){
  if(!hex(id)||!validateCommentPlan(p,plan,clock()).ok||digest(canonical(plan))!==id||typeof preflight!=="function")return denyWrite("WRITE_EXECUTOR_BINDING_DENIED");
  const attempt={schema_version:"hae.comment.attempt.v1",tenant:p.tenant,actor:p.actor,target:p.target,request_id:id,review_id:plan.review_id,payload_digest:digest(canonical(adfComment(plan.typed_args.comment))),at:clock()};
  async function persist(state,extra={}){
   try{
    const receipt={schema_version:"hae.comment.receipt.v1",...attempt,state,...extra,observed_at:clock()};
    // schema version must not be overwritten by attempt metadata.
    receipt.schema_version="hae.comment.receipt.v1";
    await store.create(key(id,"outcome"),receipt);
    return result(id,state,{...extra,receipt_digest:digest(canonical(receipt))});
   }catch{return result(id,"UNKNOWN_OUTCOME_REVIEW",{code:"WRITE_RECEIPT_STORAGE_UNKNOWN"})}
  }
  try{
   // One immutable attempt per review, even if a second request is prepared.
   const prefix="cg:approval:"+p.tenant+":"+p.actor+":"+id+":";
   const approval=await store.get(prefix+"record"),terminal=await store.get(prefix+"terminal");
   if(approval?.schema_version!=="hae.approval.v2"||approval.approval_id!==id||approval.tenant!==p.tenant||approval.actor!==p.actor||approval.target!==p.target||approval.decision!=="APPROVED"||approval.plan_hash!==id||approval.request_digest!==id||approval.evidence_bundle_hash!==plan.evidence_bundle_hash||approval.dependency_digest!==plan.dependency_digest||approval.policy_version!==plan.policy_version||approval.capability_lock!==plan.capability_lock||!Number.isSafeInteger(approval.created_at)||approval.created_at>clock()||!Number.isSafeInteger(approval.expires_at)||approval.expires_at>plan.expires_at||approval.expires_at<=clock()||terminal?.schema_version!=="hae.approval.terminal.v1"||terminal.approval_id!==id||terminal.state!=="CONSUMED"||!Number.isSafeInteger(terminal.at)||terminal.at<approval.created_at||terminal.at>=approval.expires_at||terminal.at>clock())return denyWrite("EXECUTOR_APPROVAL_RECEIPT_DENIED");
   await store.create(reservationKey(plan),attempt);
   await store.create(key(id,"attempt"),attempt);
  }catch{return denyWrite("WRITE_RESERVATION_CONFLICT_OR_UNKNOWN")}
  try{
   // Exclusive installation-level one-comment/day cap. The final interlock
   // runs after reservation; no external POST path exists before it.
   const day=new Date(clock()).toISOString().slice(0,10);
   await store.create("cg:demo-comment-day:"+day,{schema_version:"hae.comment.daily.v1",request_id:id});
  }catch{return persist("BLOCKED_BEFORE_DISPATCH",{code:"DEMO_WRITE_DAILY_CAP_OR_UNKNOWN"})}
  let gate;
  try{gate=await preflight()}catch{gate=null}
  if(!gate?.ok||gate.plan_hash!==id||!validateCommentPlan(p,plan,clock()).ok)return persist("BLOCKED_BEFORE_DISPATCH",{code:gate?.code??"FINAL_PREFLIGHT_DENIED"});
  if(!canDispatch())return persist("BLOCKED_BEFORE_DISPATCH",{code:"WRITE_INVOCATION_TIME_BUDGET"});
  // Durable latch makes crashes conservative and prevents replay even if a
  // caller accidentally invokes dispatch twice. Never retry POST.
  try{await store.create(key(id,"dispatch"),{schema_version:"hae.comment.dispatch.v1",request_id:id,payload_digest:attempt.payload_digest,at:clock()})}
  catch{return result(id,"UNKNOWN_OUTCOME_REVIEW",{code:"DISPATCH_LATCH_UNKNOWN"})}
  if(!validateCommentPlan(p,plan,clock()).ok)return persist("BLOCKED_BEFORE_DISPATCH",{code:"WRITE_EXPIRED_AT_DISPATCH"});
  if(!canDispatch())return persist("BLOCKED_BEFORE_DISPATCH",{code:"WRITE_INVOCATION_TIME_BUDGET"});
  let response;
  try{response=await transport.post(plan.target,adfComment(plan.typed_args.comment))}catch{response=null}
  const status=response?.status;
  // Persist the remote ID independently before GET. A failed final outcome write must not discard a known ID.
  if(status===201&&validId(response?.id)){
   const known={schema_version:"hae.comment.remote-id.v1",tenant:p.tenant,actor:p.actor,target:p.target,request_id:id,payload_digest:attempt.payload_digest,comment_id:response.id};
   try{await store.create(key(id,"remote-id"),known)}catch{
    try{const saved=await store.get(key(id,"remote-id"));if(canonical(saved)!==canonical(known))return persist("UNKNOWN_OUTCOME_REVIEW",{known_comment_id:response.id,code:"REMOTE_ID_STORAGE_UNKNOWN"})}
    catch{return persist("UNKNOWN_OUTCOME_REVIEW",{known_comment_id:response.id,code:"REMOTE_ID_STORAGE_UNKNOWN"})}
   }
  }
  if([400,401,403,404,405,413,415,422,429].includes(status))return persist("DEFINITE_REJECTION",{http_status:status});
  const observed=await readback(transport,plan,accountId,response?.id,digest);
  return persist(observed.state,{...(observed.comment_id?{comment_id:observed.comment_id,observation_digest:observed.observation_digest,lineage:commentLineage(p,plan,id,observed,digest)}:observed.known_comment_id?{known_comment_id:observed.known_comment_id}:{}),...(Number.isInteger(status)?{http_status:status}:{})});
 }
 async function reconcile(plan,id){
  if(!hex(id)||!validateCommentPlan(p,plan,clock(),{allowExpired:true}).ok||digest(canonical(plan))!==id)return denyWrite("WRITE_RECONCILE_BINDING_DENIED");
  try{
   const a=await store.get(key(id,"attempt")),d=await store.get(key(id,"dispatch")),old=await store.get(key(id,"outcome")),remote=await store.get(key(id,"remote-id"));
   if(a?.schema_version!=="hae.comment.attempt.v1"||a.tenant!==p.tenant||a.actor!==p.actor||a.target!==p.target||a.request_id!==id||a.review_id!==plan.review_id||a.payload_digest!==digest(canonical(adfComment(plan.typed_args.comment))))return denyWrite("WRITE_ATTEMPT_UNAVAILABLE");
   if(old?.known_comment_id!==undefined&&!validId(old.known_comment_id))return result(id,"UNKNOWN_OUTCOME_REVIEW",{code:"OUTCOME_RECORD_INVALID"});
   if(old!=null&&(old.schema_version!=="hae.comment.receipt.v1"||old.request_id!==id||old.tenant!==p.tenant||old.actor!==p.actor||old.target!==p.target||old.payload_digest!==a.payload_digest||old.review_id!==plan.review_id))return result(id,"UNKNOWN_OUTCOME_REVIEW",{code:"OUTCOME_RECORD_INVALID"});
   if(old?.state==="BLOCKED_BEFORE_DISPATCH"||old?.state==="DEFINITE_REJECTION")return result(id,old.state,{code:old.code,http_status:old.http_status});
   if(d?.schema_version!=="hae.comment.dispatch.v1"||d.request_id!==id||d.payload_digest!==a.payload_digest)return result(id,"UNKNOWN_OUTCOME_REVIEW",{code:"DISPATCH_NOT_ESTABLISHED"});
   if(remote!=null&&(remote.schema_version!=="hae.comment.remote-id.v1"||remote.tenant!==p.tenant||remote.actor!==p.actor||remote.target!==p.target||remote.request_id!==id||remote.payload_digest!==a.payload_digest||!validId(remote.comment_id)||old?.comment_id!==undefined&&old.comment_id!==remote.comment_id||old?.known_comment_id!==undefined&&old.known_comment_id!==remote.comment_id))return result(id,"UNKNOWN_OUTCOME_REVIEW",{code:"REMOTE_ID_RECORD_INVALID"});
   const observed=await readback(transport,plan,accountId,remote?.comment_id??old?.comment_id??old?.known_comment_id,digest);
   if(observed.state!=="OBSERVED_SUCCESS")return result(id,"UNKNOWN_OUTCOME_REVIEW");
   const record={schema_version:"hae.comment.reconciliation.v1",tenant:p.tenant,actor:p.actor,target:p.target,request_id:id,payload_digest:a.payload_digest,comment_id:observed.comment_id,observation_digest:observed.observation_digest,lineage:commentLineage(p,plan,id,observed,digest)};
   try{await store.create(key(id,"reconciled"),record)}catch{
    const prior=await store.get(key(id,"reconciled"));
    if(!prior||canonical(prior)!==canonical(record))return result(id,"UNKNOWN_OUTCOME_REVIEW");
   }
   return result(id,"OBSERVED_SUCCESS",{comment_id:observed.comment_id,receipt_digest:digest(canonical(record)),observation_digest:observed.observation_digest,lineage:record.lineage,reconciled:true});
  }catch{return result(id,"UNKNOWN_OUTCOME_REVIEW")}
 }
 return {dispatch,reconcile};
}
