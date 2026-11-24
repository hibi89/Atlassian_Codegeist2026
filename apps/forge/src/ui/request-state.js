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
