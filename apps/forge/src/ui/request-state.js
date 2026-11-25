// UI coordination only. Server-side approval, limits and deduplication remain authoritative.
export function createRequestGate(){
 let sequence=0,active=null;
 return {begin(){if(active!==null)return null;active=++sequence;return active},current(token){return active===token},end(token){if(active!==token)return false;active=null;return true}};
}
const terminal=new Set(["OBSERVED_SUCCESS","DEFINITE_REJECTION","BLOCKED_BEFORE_DISPATCH"]);
// Exact server denials known to occur before this invocation can dispatch.
// Never clear an existing unknown outcome merely because a later call is denied.
const preDispatchDenials=new Set(["WRITE_CONTEXT_DENIED","WRITE_PERMISSION_DENIED","WRITE_REQUEST_PERMANENTLY_BLOCKED","WRITE_REVIEW_STALE_OR_UNKNOWN","WRITE_INVOCATION_TIME_BUDGET","APPROVAL_EXPIRED","DEVELOPMENT_DAILY_BUDGET_EXHAUSTED","DEVELOPMENT_BUDGET_DAY_CHANGED","SYNTHETIC_DEMO_SCOPE_REQUIRED"]);
const validRequestId=id=>typeof id==="string"&&/^[a-f0-9]{64}$/.test(id);
const exact=(id,r)=>validRequestId(id)&&r?.request_id===id;
const exactTerminal=(id,r)=>exact(id,r)&&terminal.has(r.status)&&(
 r.status==="OBSERVED_SUCCESS"?r.ok===true&&r.execution==="JIRA_COMMENT_READBACK_OBSERVED":r.ok===false
);
const knownBeforeDispatch=(id,r)=>validRequestId(id)&&r?.ok===false&&preDispatchDenials.has(r.code)&&!r.status&&(r.request_id===undefined||exact(id,r));
export function unresolvedCommentId(previous,operation,id,result){
 if(operation==="executeDemoComment")return exactTerminal(id,result)||knownBeforeDispatch(id,result)?previous:previous||id;
 if(operation==="reconcileDemoComment"&&previous===id&&exactTerminal(id,result))return "";
 return previous;
}
export function commentResponse(operation,id,result){
 if(operation==="executeDemoComment"&&!exactTerminal(id,result)&&!knownBeforeDispatch(id,result))return {ok:false,request_id:id,status:"UNKNOWN_OUTCOME_REVIEW",code:"COMMENT_OUTCOME_UNCONFIRMED"};
 if(operation==="reconcileDemoComment"&&(!exact(id,result)||terminal.has(result?.status)&&!exactTerminal(id,result)))return {ok:false,request_id:id,status:"UNKNOWN_OUTCOME_REVIEW",code:"COMMENT_OUTCOME_UNCONFIRMED"};
 if(operation!=="prepareDemoComment"&&result?.request_id!==undefined&&!exact(id,result))return {ok:false,code:"REQUEST_RESPONSE_MISMATCH"};
 return result;
}

// Local-clock UX only. The backend rechecks authorization and evidence.
export function requestDeadline(request,state,approvedStatus,now){
 const requestAt=request?.expires_at;
 if(!Number.isSafeInteger(now)||!Number.isSafeInteger(requestAt))return {ready:false,remaining:null};
 const approved=state?.status===approvedStatus;
 if(approved&&!Number.isSafeInteger(state?.expires_at))return {ready:false,remaining:null};
 const end=approved?Math.min(requestAt,state.expires_at):requestAt;
 return {ready:end>now,remaining:Math.max(0,end-now)};
}

// Restore a known unresolved request after a saved-review recheck (including reload).
export function restoreUnresolvedComment(previous,journal){
 return previous||(journal?.status==="UNKNOWN_OUTCOME_REVIEW"&&typeof journal.request_id==="string"&&/^[a-f0-9]{64}$/.test(journal.request_id)?journal.request_id:"");
}

// A saved review is only established by the exact server plan identity.
// Keep the previous lookup ID on failure; do not retain stale approval or evidence.
export function savedReviewResponse(previousId,result,replacing=false){
 const saved=result?.saved_review,id=saved?.review_id;
 const valid=result?.ok===true&&saved?.ok===true&&validRequestId(id)&&result?.plan?.plan_hash===id&&saved.run_state==="POLICY_REVIEW"&&(!replacing||(result.revalidated_from===previousId&&id!==previousId));
 if(valid)return {ok:true,id,saved};
 return {ok:false,id:previousId,code:result?.ok===false&&typeof result.code==="string"?result.code:"REVIEW_RESPONSE_UNCONFIRMED"};
}

// Display gate only. Never infer an enabled environment from a visible Jira panel.
export function environmentReadiness(safety){
 if(safety?.ok!==true)return {ready:false,code:"ENVIRONMENT_NOT_CONFIRMED"};
 if(safety.environment!=="DEVELOPMENT")return {ready:false,code:"DEVELOPMENT_ENVIRONMENT_REQUIRED"};
 return {ready:true,code:"DEVELOPMENT_CONFIRMED"};
}

// UTC reset reported by the admission service. This is an informational hint,
// not permission to retry or a client-side replacement for the server cap.
export function budgetRetryAt(result){
 const at=result?.retry_at;
 return result?.ok===false&&result.code==="DEVELOPMENT_DAILY_BUDGET_EXHAUSTED"&&Number.isSafeInteger(at)&&at>0&&at<=8640000000000000&&at%86400000===0?at:null;
}

// A prepare result must identify the exact review currently requested. A
// well-formed request ID alone is insufficient to display an approval action.
export function preparedRequest(kind,reviewId,target,result){
 if(result?.ok!==true)return result??{ok:false,code:"REQUEST_RESPONSE_UNCONFIRMED"};
 const common=validRequestId(reviewId)&&result.review_id===reviewId&&validRequestId(result.request_id)&&Number.isSafeInteger(result.expires_at)&&result.expires_at>0&&result.authorization==="NONE";
 const valid=kind==="report"?result.status==="AWAITING_READ_ONLY_APPROVAL"&&result.effect==="READ_ONLY_REPORT"&&Array.isArray(result.operations)&&result.operations.length>0&&result.operations.every(o=>typeof o?.operation==="string"&&["READ","PURE","METADATA"].includes(o.effect)):kind==="comment"?result.status==="AWAITING_COMMENT_APPROVAL"&&typeof target==="string"&&result.target===target&&typeof result.comment==="string"&&result.comment.length>0:false;
 return common&&valid?result:{ok:false,code:"PREPARED_REQUEST_UNCONFIRMED"};
}
export function savedLookupResponse(reviewId,result){
 if(result?.ok!==true)return result??{ok:false,code:"REVIEW_RESPONSE_UNCONFIRMED"};
 return validRequestId(reviewId)&&result.review_id===reviewId?result:{ok:false,code:"REVIEW_RESPONSE_UNCONFIRMED"};
}

// Only a known partial initial journal may provide a repair lookup hint.
export function draftRepairHint(result){
 return result?.ok===false&&["REVIEW_JOURNAL_PARTIAL","REVIEW_SNAPSHOT_CONFIRMED_JOURNAL_UNCHECKED","REVIEW_DRAFT_REPAIR_OUTCOME_UNKNOWN","REVIEW_DRAFT_REPAIR_STALE","REVIEW_DRAFT_REPAIR_DENIED"].includes(result.code)&&validRequestId(result.repair_review_id)?result.repair_review_id:"";
}
