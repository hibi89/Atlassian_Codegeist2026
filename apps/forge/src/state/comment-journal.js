// Scoped, read-only projection over immutable comment attempt and result records.
const hex=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
export async function readCommentJournal(store,p,reviewId){
 if(!p||!hex(p.tenant)||!hex(p.actor)||!hex(reviewId))return {status:"JOURNAL_UNKNOWN"};
 try{
  const a=await store.get("cg:comment-review:"+p.tenant+":"+p.actor+":"+reviewId);
  if(a==null)return {status:"NO_COMMENT_ATTEMPT"};
  const scoped=r=>r?.tenant===p.tenant&&r.actor===p.actor&&r.target===p.target&&r.request_id===a.request_id&&r.payload_digest===a.payload_digest;
  if(a.schema_version!=="hae.comment.attempt.v1"||!hex(a.request_id)||!hex(a.payload_digest)||a.review_id!==reviewId||!scoped(a))return {status:"JOURNAL_UNKNOWN"};
  const key=kind=>"cg:comment:"+p.tenant+":"+p.actor+":"+a.request_id+":"+kind;
  const outcome=await store.get(key("outcome")),reconciled=await store.get(key("reconciled")),remote=await store.get(key("remote-id"));
  if(outcome!=null&&(!scoped(outcome)||outcome.schema_version!=="hae.comment.receipt.v1"||outcome.review_id!==reviewId||!["OBSERVED_SUCCESS","DEFINITE_REJECTION","BLOCKED_BEFORE_DISPATCH","UNKNOWN_OUTCOME_REVIEW"].includes(outcome.state)))return {status:"JOURNAL_UNKNOWN"};
  if(outcome?.known_comment_id!==undefined&&(typeof outcome.known_comment_id!=="string"||!/^[1-9][0-9]{0,30}$/.test(outcome.known_comment_id)||outcome.comment_id!==undefined&&outcome.comment_id!==outcome.known_comment_id))return {status:"JOURNAL_UNKNOWN"};
  if(outcome?.state==="OBSERVED_SUCCESS"&&(!hex(outcome.observation_digest)||typeof outcome.comment_id!=="string"||!/^[1-9][0-9]{0,30}$/.test(outcome.comment_id)))return {status:"JOURNAL_UNKNOWN"};
  if(reconciled!=null&&(!scoped(reconciled)||reconciled.schema_version!=="hae.comment.reconciliation.v1"||!hex(reconciled.observation_digest)||typeof reconciled.comment_id!=="string"||!/^[1-9][0-9]{0,30}$/.test(reconciled.comment_id)))return {status:"JOURNAL_UNKNOWN"};
  if(reconciled&&(outcome?.known_comment_id!==undefined&&outcome.known_comment_id!==reconciled.comment_id||outcome?.state==="BLOCKED_BEFORE_DISPATCH"||outcome?.state==="DEFINITE_REJECTION"||outcome?.state==="OBSERVED_SUCCESS"&&(outcome.comment_id!==reconciled.comment_id||outcome.observation_digest!==reconciled.observation_digest)))return {status:"JOURNAL_UNKNOWN"};
  if(remote!=null&&(!scoped(remote)||remote.schema_version!=="hae.comment.remote-id.v1"||typeof remote.comment_id!=="string"||!/^[1-9][0-9]{0,30}$/.test(remote.comment_id)||outcome?.comment_id!==undefined&&outcome.comment_id!==remote.comment_id||outcome?.known_comment_id!==undefined&&outcome.known_comment_id!==remote.comment_id||reconciled&&reconciled.comment_id!==remote.comment_id))return {status:"JOURNAL_UNKNOWN"};
  if(reconciled||outcome?.state==="OBSERVED_SUCCESS"){
   const attempt=await store.get(key("attempt")),dispatch=await store.get(key("dispatch"));
   if(!attempt||!scoped(attempt)||attempt.schema_version!=="hae.comment.attempt.v1"||attempt.review_id!==reviewId||attempt.at!==a.at||!Number.isSafeInteger(a.at)||!dispatch||dispatch.schema_version!=="hae.comment.dispatch.v1"||dispatch.request_id!==a.request_id||dispatch.payload_digest!==a.payload_digest||!Number.isSafeInteger(dispatch.at)||dispatch.at<a.at)return {status:"JOURNAL_UNKNOWN"};
  }
  // Historical observation only, not a guarantee that the comment still exists.
  return {status:reconciled?"HISTORICAL_OBSERVED_SUCCESS":outcome?.state==="OBSERVED_SUCCESS"?"HISTORICAL_OBSERVED_SUCCESS":outcome?.state??"UNKNOWN_OUTCOME_REVIEW",request_id:a.request_id};
 }catch{return {status:"JOURNAL_UNKNOWN"}}
}
