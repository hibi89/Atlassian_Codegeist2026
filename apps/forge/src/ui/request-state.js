// UI coordination only. Server-side approval, limits and deduplication remain authoritative.
export function createRequestGate(){
 let sequence=0,active=null;
 return {begin(){if(active!==null)return null;active=++sequence;return active},current(token){return active===token},end(token){if(active!==token)return false;active=null;return true}};
}
const terminal=new Set(["OBSERVED_SUCCESS","DEFINITE_REJECTION","BLOCKED_BEFORE_DISPATCH"]);
export function unresolvedCommentId(previous,operation,id,result){
 if(operation==="executeDemoComment")return terminal.has(result?.status)?previous:id;
 if(operation==="reconcileDemoComment"&&previous===id&&terminal.has(result?.status))return "";
 return previous;
}
export function commentResponse(operation,result){
 if(operation==="executeDemoComment"&&!terminal.has(result?.status))return {...result,ok:false,status:"UNKNOWN_OUTCOME_REVIEW"};
 return result;
}
