// UI coordination only. Server-side approval, limits and deduplication remain authoritative.
export function createRequestGate(){
 let sequence=0,active=null;
 return {begin(){if(active!==null)return null;active=++sequence;return active},current(token){return active===token},end(token){if(active!==token)return false;active=null;return true}};
}
const terminal=new Set(["OBSERVED_SUCCESS","DEFINITE_REJECTION","BLOCKED_BEFORE_DISPATCH"]);
// Exact server denials known to occur before this invocation can dispatch.
// Never clear an existing unknown outcome merely because a later call is denied.
const preDispatchDenials=new Set(["WRITE_CONTEXT_DENIED","WRITE_PERMISSION_DENIED","WRITE_REQUEST_PERMANENTLY_BLOCKED","WRITE_REVIEW_STALE_OR_UNKNOWN","WRITE_INVOCATION_TIME_BUDGET","APPROVAL_EXPIRED","DEVELOPMENT_DAILY_BUDGET_EXHAUSTED","DEVELOPMENT_BUDGET_DAY_CHANGED","SYNTHETIC_DEMO_SCOPE_REQUIRED"]);
const knownBeforeDispatch=r=>r?.ok===false&&preDispatchDenials.has(r.code)&&!r.status;
export function unresolvedCommentId(previous,operation,id,result){
 if(operation==="executeDemoComment")return terminal.has(result?.status)||knownBeforeDispatch(result)?previous:id;
 if(operation==="reconcileDemoComment"&&previous===id&&terminal.has(result?.status))return "";
 return previous;
}
export function commentResponse(operation,result){
 if(operation==="executeDemoComment"&&!terminal.has(result?.status)&&!knownBeforeDispatch(result))return {...result,ok:false,status:"UNKNOWN_OUTCOME_REVIEW"};
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
