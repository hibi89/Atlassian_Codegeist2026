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

// Navigation hints, not a workflow completion score or a permission grant.
export function workbenchGuide({context,issue,preview,savedStatus,reviewId,reportRequest,reportState,reportDeadline,commentRequest,commentState,commentDeadline,unresolvedId,safety}){
 const hex=id=>typeof id==="string"&&/^[a-f0-9]{64}$/.test(id),saved=hex(reviewId)&&savedStatus?.ok===true&&savedStatus.review_id===reviewId;
 const stale=saved&&(savedStatus.persisted_invalidation===true||savedStatus.status==="STALE_REVIEW_REQUIRED");
 const observed=preview?.ok===true?preview.evidence:issue?.ok===true?issue.evidence:null;
 const draft=preview?.ok===true&&hex(preview.plan?.plan_hash);
 const reportBound=hex(reviewId)&&reportRequest?.review_id===reviewId&&requestMatches(reportRequest,reportState);
 const commentBound=hex(reviewId)&&commentRequest?.review_id===reviewId&&requestMatches(commentRequest,commentState);
 const reportUncertain=saved&&(savedStatus.receipt_status==="UNCONFIRMED"||savedStatus.run_state==="REPORT_OUTCOME_REVIEW_REQUIRED");
 const commentUncertain=!!unresolvedId||commentState?.status==="UNKNOWN_OUTCOME_REVIEW"||saved&&["UNKNOWN_OUTCOME_REVIEW","JOURNAL_UNKNOWN"].includes(savedStatus.comment_journal?.status);
 const reportVerified=reportBound&&reportState.ok===true&&reportState.report_integrity==="SHA256_MATCH"&&reportState.status==="READ_ONLY_REPORT_GENERATED";
 const commentVerified=commentBound&&commentState.ok===true&&commentState.status==="OBSERVED_SUCCESS"&&commentState.execution==="JIRA_COMMENT_READBACK_OBSERVED";
 const steps=[
 {key:"issue",title:"Issue",href:"#issue-heading",label:issue?.ok===true?"Read observed":issue?.ok===false?"Read unavailable":"Not read",tone:issue?.ok===true?"observed":issue?.ok===false?"warning":"neutral"},
 {key:"evidence",title:"Evidence & plan",href:"#review-workspace",label:preview?.ok===false?"Preview unavailable":draft?preview.policy?.decision==="ALLOW_PREVIEW"?"Read-only draft": "Review or denial":observed?"Sources observed":"Not observed",tone:preview?.ok===false||draft&&preview.policy?.decision!=="ALLOW_PREVIEW"?"warning":observed?"observed":"neutral"},
 {key:"saved",title:"Saved review",href:"#saved-workspace",label:stale?"Invalidated":saved?"Record observed":hex(reviewId)?"Lookup required":"Not selected",tone:stale?"danger":saved?"observed":"neutral"},
 {key:"report",title:"Evidence report",href:"#report-workspace",...(reportUncertain?{label:"Receipt review required",tone:"warning"}:reportBound?requestStage("report",reportRequest,reportState,reportDeadline):{label:"Not prepared",tone:"neutral"})},
 ...(context?.key==="HTF-2"?[{key:"comment",title:"Guarded action",href:"#comment-workspace",...(commentUncertain?{label:"Reconciliation required",tone:"danger"}:commentBound?requestStage("comment",commentRequest,commentState,commentDeadline):{label:"Not prepared",tone:"neutral"})}]:[]),
 {key:"history",title:"ProofGraph",href:"#lineage-workspace",label:commentUncertain||reportUncertain?"Review recorded outcome":commentVerified||reportVerified?"Session result available":saved?"Saved reference available":"Not inspected",tone:commentUncertain||reportUncertain?"warning":saved||commentVerified||reportVerified?"observed":"neutral"}
 ];
 let next="issue",reason="Read the current issue or choose a supported intent.";
 if(commentUncertain){next=context?.key==="HTF-2"?"comment":"history";reason="Inspect the unresolved comment before further execution."}
 else if(reportUncertain){next="history";reason="Recover or inspect the existing report receipt rather than generate again."}
 else if(stale){next="saved";reason="Inspect invalidation and explicitly revalidate; old approval is not restored."}
 else if(commentVerified||reportVerified){next="history";reason="Inspect the recorded lineage and outcome."}
 else if(commentBound){next="comment";reason="Inspect the exact action and its current recorded request state."}
 else if(reportBound){next="report";reason="Inspect the exact report and its current recorded request state."}
 else if(saved){next="report";reason="Inspect the selected saved review and available report workflow."}
 else if(hex(reviewId)){next="saved";reason="Recheck the selected reference before preparing a request."}
 else if(draft){next=preview.policy?.decision==="ALLOW_PREVIEW"&&safety?.synthetic_storage_ready===true?"saved":"evidence";reason=next==="saved"?"Inspect the draft and save it only if appropriate.":"Inspect the evidence and policy limitations."}
 else if(issue?.ok===true){next="evidence";reason="Choose an intent and inspect a read-only draft."}
 return {steps,next,reason};
}
