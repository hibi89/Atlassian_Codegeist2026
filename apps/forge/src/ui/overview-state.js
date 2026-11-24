// Display state only; never grants authority.
export function overviewState({context,issue,preview,savedStatus,commentState,reportState,unresolvedId,busy}){
 const count=v=>Number.isSafeInteger(v)&&v>=0?v:null;
 const observed=preview!=null?(preview.ok?preview.evidence:null):issue?.ok?issue.evidence:null;
 const stale=savedStatus?.persisted_invalidation===true||savedStatus?.status==="STALE_REVIEW_REQUIRED";
 const policy=preview?.ok?preview.policy?.decision:null;
 let outcome={label:"No outcome established",tone:"neutral"};
 if(unresolvedId||commentState?.status==="UNKNOWN_OUTCOME_REVIEW")outcome={label:"Reconciliation required",tone:"danger"};
 else if(commentState?.ok===true&&commentState.status==="OBSERVED_SUCCESS"&&commentState.execution==="JIRA_COMMENT_READBACK_OBSERVED")outcome={label:"Comment read-back observed",tone:"success"};
 else if(reportState?.ok===true&&reportState.run_state==="SUCCEEDED"&&typeof reportState.report_digest==="string")outcome={label:"Read-only report recorded",tone:"observed"};
 else if(commentState?.status==="BLOCKED_BEFORE_DISPATCH")outcome={label:"Blocked before dispatch",tone:"warning"};
 else if(commentState?.status==="DEFINITE_REJECTION")outcome={label:"Jira rejected request",tone:"warning"};
 return {issue:context?.ok?context.key??"Unknown":"Unavailable",sourceCount:Array.isArray(observed?.sources)?observed.sources.length:null,unknownCount:count(observed?.unknown_count),coverage:observed?.coverage??"Not observed",policy:stale?"Saved review invalidated":policy==="ALLOW_PREVIEW"?"Preview only":policy==="REVIEW"?"Review required":policy==="DENY"?"Denied":"Not assessed",policyTone:stale||policy==="DENY"?"danger":policy==="REVIEW"?"warning":"neutral",outcome,busy:busy===true};
}
