import {canonical} from "../../core/ir/plan.js";
import {principal} from "../../evidence/bundle.js";
import {createReviewStore} from "../../lineage/review-store.js";
import {createRunLedger} from "../../state/run-ledger.js";
import {readCommentJournal} from "../../state/comment-journal.js";
import {createApprovalBroker} from "./broker.js";
import {makeCommentPlan,validateCommentPlan,writeBinding,denyWrite,DEMO_ISSUE} from "../write-policy.js";
import {createCommentExecutor} from "../../executor/comment-executor.js";
const hex=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
const aliases={"change-review":"review change","incident-coordinate":"coordinate incident","release-review":"review release"};
export function createCommentService({store,clock,digest,preview,development,nonce,allowedInstall,transport,canDispatch=()=>true}){
 function actor(context){const p=development()&&allowedInstall(context)?principal(context,digest):null;return p?.target===DEMO_ISSUE?p:null}
 const key=(p,id)=>"cg:comment-request:"+p.tenant+":"+p.actor+":"+id;
 async function material(p,context,reviewId){
  const m=await createReviewStore(store,p,clock,digest).authorizeReadOnly(reviewId,(intent,record)=>preview(context,aliases[intent],record));
  if(!m.ok)return m;
  const run=await createRunLedger(store,p,clock).read(reviewId);
  if(!run.ok||run.state!=="POLICY_REVIEW"||run.events[0].plan_hash!==reviewId)return denyWrite("WRITE_REVIEW_JOURNAL_UNAVAILABLE");
  return m;
 }
 async function permissions(p,write=true){
  try{const r=await transport.permissions(p.target);return r?.browse===true&&(!write||r.add===true)}catch{return false}
 }
 async function load(p,id,allowExpired=false){
  if(!hex(id))return null;
  const plan=await store.get(key(p,id));
  return validateCommentPlan(p,plan,clock(),{allowExpired}).ok&&digest(canonical(plan))===id?plan:null;
 }
 async function current(p,context,plan,id){
  const blockKey="cg:comment-block:"+p.tenant+":"+p.actor+":"+id;
  try{
   if(await store.get(blockKey)!=null)return denyWrite("WRITE_REQUEST_PERMANENTLY_BLOCKED");
   async function block(code){
    try{await store.create(blockKey,{schema_version:"hae.comment.block.v1",request_id:id,review_id:plan.review_id,code,at:clock()})}
    catch{if(await store.get(blockKey)==null)return denyWrite("WRITE_BLOCK_STORAGE_UNKNOWN")}
    return denyWrite(code);
   }
   if(!actor(context)||!await permissions(p))return await block("WRITE_PERMISSION_DENIED");
   const m=await material(p,context,plan.review_id);
   if(!m.ok)return await block("WRITE_REVIEW_STALE_OR_UNKNOWN");
   const binding=writeBinding(p,plan,m.record,m.current,id,digest,clock());
   if(!binding.ok)return await block(binding.code);
   return binding;
  }catch{return denyWrite("WRITE_INTERLOCK_STORAGE_UNKNOWN")}
 }
 async function prepare(context,reviewId){
  const p=actor(context);if(!p||!hex(reviewId))return denyWrite("DEMO_WRITE_NOT_CONFIGURED_OR_CONTEXT_DENIED");
  try{
   if(!await permissions(p))return denyWrite("WRITE_PERMISSION_DENIED");
   const m=await material(p,context,reviewId);if(!m.ok)return m;
   const journal=await readCommentJournal(store,p,reviewId);
   if(journal.status!=="NO_COMMENT_ATTEMPT")return {...denyWrite("WRITE_REVIEW_ALREADY_ATTEMPTED_OR_UNKNOWN"),status:journal.status,...(hex(journal.request_id)?{request_id:journal.request_id}:{})};
   const plan=makeCommentPlan(p,m.record,nonce(),clock(),Math.min(...m.current.evidence.sources.map(s=>Date.parse(s.freshness_deadline))));if(!plan)return denyWrite("WRITE_PLAN_UNAVAILABLE");
   const id=digest(canonical(plan)),checked=writeBinding(p,plan,m.record,m.current,id,digest,clock());if(!checked.ok)return checked;
   await store.create(key(p,id),plan);
   return {ok:true,request_id:id,review_id:reviewId,target:p.target,comment:plan.typed_args.comment,expires_at:plan.expires_at,status:"AWAITING_COMMENT_APPROVAL",authorization:"NONE"};
  }catch{return denyWrite("WRITE_PREPARE_STORAGE_UNKNOWN")}
 }
 async function approve(context,id,confirmation){
  const p=actor(context);if(!p||!hex(id)||confirmation!==id)return denyWrite("WRITE_CONFIRMATION_DENIED");
  try{
   const plan=await load(p,id);if(!plan)return denyWrite("WRITE_REQUEST_UNAVAILABLE");
   const c=await current(p,context,plan,id);if(!c.ok)return c;
   const a=await createApprovalBroker(store,clock).issue(p,c.binding,confirmation);
   return a.ok?{ok:true,request_id:id,status:"COMMENT_APPROVED",expires_at:a.expires_at}:a;
  }catch{return denyWrite("WRITE_APPROVAL_STORAGE_UNKNOWN")}
 }
 async function execute(context,id){
  const p=actor(context);if(!p||!hex(id))return denyWrite("WRITE_CONTEXT_DENIED");
  try{
   const plan=await load(p,id);if(!plan)return denyWrite("WRITE_REQUEST_UNAVAILABLE");
   const c=await current(p,context,plan,id);if(!c.ok)return c;
   if(!canDispatch())return denyWrite("WRITE_INVOCATION_TIME_BUDGET");
   const broker=createApprovalBroker(store,clock),a=await broker.consume(p,id,c.binding);if(!a.ok)return a;
   // Re-read authoritative evidence and permission again at actual executor boundary.
   // A consumed token is never restored, including when final recheck blocks.
   return await createCommentExecutor({store,p,clock,digest,transport,accountId:context.accountId,canDispatch}).dispatch(plan,id,async()=>{
    const final=await current(p,context,plan,id);
    if(!final.ok)return final;
    if(Object.keys(c.binding).some(k=>c.binding[k]!==final.binding[k])||a.receipt.expires_at<=clock())return denyWrite("WRITE_APPROVAL_STALE");
    return {ok:true,plan_hash:id};
   });
  }catch{return denyWrite("WRITE_EXECUTION_OR_STORAGE_UNKNOWN")}
 }
 async function revoke(context,id){
  const p=actor(context);if(!p||!hex(id))return denyWrite("WRITE_CONTEXT_DENIED");
  try{if(!await load(p,id,true))return denyWrite("WRITE_REQUEST_UNAVAILABLE");const r=await createApprovalBroker(store,clock).revoke(p,id);return r.ok?{ok:true,status:"COMMENT_APPROVAL_REVOKED",request_id:id}:r}catch{return denyWrite("WRITE_REVOKE_UNKNOWN")}
 }
 async function reconcile(context,id){
  const p=actor(context);if(!p||!hex(id))return denyWrite("WRITE_CONTEXT_DENIED");
  try{const plan=await load(p,id,true);if(!plan||!await permissions(p,false))return denyWrite("WRITE_RECONCILE_ACCESS_DENIED");return await createCommentExecutor({store,p,clock,digest,transport,accountId:context.accountId}).reconcile(plan,id)}catch{return denyWrite("WRITE_RECONCILE_UNKNOWN")}
 }
 return {prepare,approve,execute,revoke,reconcile};
}
