// Display state only; never grants authority.
export function overviewState({context,issue,preview,savedStatus,commentState,reportState,unresolvedId,busy}){
 const count=v=>Number.isSafeInteger(v)&&v>=0?v:null;
 const observed=preview!=null?(preview.ok?preview.evidence:null):issue?.ok?issue.evidence:null;
 const stale=savedStatus?.persisted_invalidation===true||savedStatus?.status==="STALE_REVIEW_REQUIRED";
 const policy=preview?.ok?preview.policy?.decision:null;
 let outcome={label:"No outcome established",tone:"neutral"};
 if(unresolvedId||commentState?.status==="UNKNOWN_OUTCOME_REVIEW")outcome={label:"Reconciliation required",tone:"danger"};
 else if(commentState?.ok===true&&commentState.status==="OBSERVED_SUCCESS"&&commentState.execution==="JIRA_COMMENT_READBACK_OBSERVED")outcome={label:"Comment read-back observed",tone:"success"};
 else if(reportState?.ok===true&&reportState.status==="READ_ONLY_REPORT_GENERATED"&&reportState.run_state==="SUCCEEDED"&&/^[a-f0-9]{64}$/.test(reportState.request_id??"")&&/^[a-f0-9]{64}$/.test(reportState.report_digest??""))outcome={label:"Read-only report recorded",tone:"observed"};
 else if(commentState?.status==="BLOCKED_BEFORE_DISPATCH")outcome={label:"Blocked before dispatch",tone:"warning"};
 else if(commentState?.status==="DEFINITE_REJECTION")outcome={label:"Jira rejected request",tone:"warning"};
 return {issue:context?.ok?context.key??"Unknown":"Unavailable",sourceCount:Array.isArray(observed?.sources)?observed.sources.length:null,unknownCount:count(observed?.unknown_count),coverage:observed?.coverage??"Not observed",policy:stale?"Saved review invalidated":policy==="ALLOW_PREVIEW"?"Preview only":policy==="REVIEW"?"Review required":policy==="DENY"?"Denied":"Not assessed",policyTone:stale||policy==="DENY"?"danger":policy==="REVIEW"?"warning":"neutral",outcome,busy:busy===true};
}

// Chart counts are server observations; an absent count is never zero.
export function countBreakdown(first,second){
 if(![first,second].every(x=>Number.isSafeInteger(x)&&x>=0)||!Number.isSafeInteger(first+second))return null;
 const total=first+second;return {first,second,total,share:total?first/total*100:null};
}
export function requestMatches(request,result){
 return typeof request?.request_id==="string"&&/^[a-f0-9]{64}$/.test(request.request_id)&&request.request_id===result?.request_id;
}
export function requestStage(kind,request,result,deadline,unresolvedId=""){
 if(kind==="comment"&&unresolvedId)return {label:"Reconciliation required",tone:"danger"};
 if(!requestMatches(request,result))return {label:"Current request status not established",tone:"neutral"};
 const s=result.status;
 if(result.ok===true&&s===(kind==="comment"?"AWAITING_COMMENT_APPROVAL":"AWAITING_READ_ONLY_APPROVAL"))return {label:deadline?.ready?"Awaiting explicit approval":"Approval window unavailable or expired",tone:"warning"};
 if(result.ok===true&&s===(kind==="comment"?"COMMENT_APPROVED":"READ_ONLY_APPROVED"))return {label:deadline?.ready?"Approved · not executed":"Approval window unavailable or expired",tone:"warning"};
 if(kind==="comment"&&result.ok===true&&s==="OBSERVED_SUCCESS"&&result.execution==="JIRA_COMMENT_READBACK_OBSERVED")return {label:"Read-back observed",tone:"success"};
 if(kind==="report"&&result.ok===true&&s==="READ_ONLY_REPORT_GENERATED"&&result.run_state==="SUCCEEDED"&&/^[a-f0-9]{64}$/.test(result.report_digest??""))return {label:"Read-only report recorded",tone:"observed"};
 if(s==="UNKNOWN_OUTCOME_REVIEW")return {label:"Reconciliation required",tone:"danger"};
 if(s==="BLOCKED_BEFORE_DISPATCH"||s==="DEFINITE_REJECTION"||s==="COMMENT_APPROVAL_REVOKED"||s==="READ_ONLY_APPROVAL_REVOKED")return {label:s,tone:"warning"};
 return {label:"Outcome not established",tone:"neutral"};
}

// Separate denominators: source version observations and deterministic check
// outcomes. Neither is a probability of truth or an execution authorization.
export function evidenceDistribution(evidence,review){
 const group=(items,allowed)=>{if(!Array.isArray(items))return null;const counts=Object.fromEntries(allowed.map(k=>[k,0]));counts.UNKNOWN=0;for(const item of items){const status=item?.status;counts[allowed.includes(status)?status:"UNKNOWN"]++;}return {total:items.length,counts};};
 return {sources:group(evidence?.sources,["VERSION_OBSERVED","UNVERIFIED_VERSION"]),checks:review?.reason==="CLAIMS_UNKNOWN"?null:group(review?.checks,["SOURCE_OBSERVED","UNVERIFIED_CLAIM","CONFLICT_FOUND"])};
}
