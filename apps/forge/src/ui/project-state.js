// Strict display contract. A malformed success is never a known empty sample.
const hex=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
const intents=new Set(["change-review","incident-coordinate","release-review"]);
const states=new Set(["DRAFT","EVIDENCE_PENDING","POLICY_REVIEW","AWAITING_APPROVAL","READY","RUNNING","RECONCILING","REPORT_RECEIPT_VERIFIED","FAILED","PAUSED","CANCELED","UNKNOWN_OUTCOME_REVIEW","NOT_ESTABLISHED"]);
const comments=new Set(["NO_COMMENT_ATTEMPT","HISTORICAL_OBSERVED_SUCCESS","DEFINITE_REJECTION","BLOCKED_BEFORE_DISPATCH","UNKNOWN_OUTCOME_REVIEW","NOT_ESTABLISHED"]);
const markers=new Set(["PERSISTED_INVALIDATION","NO_MARKER_OBSERVED","NOT_ESTABLISHED"]);
const bad=()=>({ok:false,code:"PROJECT_RESPONSE_UNCONFIRMED"});
export function projectResponse(x){
 if(x?.ok===false&&typeof x.code==="string")return x;
 if(x?.ok!==true||x.scope!=="CURRENT_ACTOR_SYNTHETIC_PROJECT_SAMPLE"||x.project_key!=="HTF"||x.target!=="HTF-2"||x.authorization!=="NONE"||x.execution!=="NO_JIRA_MUTATION"||!Number.isSafeInteger(x.observed_at)||x.observed_at<=0||x.observed_at>8640000000000000||x.scan_limit!==12||x.row_limit!==3||typeof x.scan_truncated!=="boolean"||typeof x.rows_truncated!=="boolean"||!Number.isSafeInteger(x.withheld_count)||x.withheld_count<0||!Array.isArray(x.rows)||x.rows.length>3||x.withheld_count+x.rows.length>12||new Set(x.rows.map(r=>r?.review_id)).size!==x.rows.length)return bad();
 if(x.rows.some(r=>!hex(r?.review_id)||!intents.has(r.intent)||!Number.isSafeInteger(r.created_at)||!Number.isSafeInteger(r.expires_at)||r.created_at<=0||r.created_at>x.observed_at||r.expires_at<=x.observed_at||r.expires_at-r.created_at!==86400000||r.expires_at>8640000000000000||!Number.isSafeInteger(r.source_count)||r.source_count<1||r.source_count>8||!["CURRENT_OBSERVED","STALE_VERSION"].includes(r.comparison)||!states.has(r.journal_state)||!comments.has(r.comment_state)||!markers.has(r.invalidation)))return bad();
 return x;
}
const filters={
 all:()=>true,
 changed:r=>r.comparison==="STALE_VERSION"||r.invalidation==="PERSISTED_INVALIDATION",
 reports:r=>r.journal_state==="REPORT_RECEIPT_VERIFIED",
 comments:r=>r.comment_state==="HISTORICAL_OBSERVED_SUCCESS",
 unresolved:r=>["RUNNING","RECONCILING","UNKNOWN_OUTCOME_REVIEW","NOT_ESTABLISHED"].includes(r.journal_state)||["UNKNOWN_OUTCOME_REVIEW","NOT_ESTABLISHED"].includes(r.comment_state)||r.invalidation==="NOT_ESTABLISHED"
};
export function projectSampleRows(x,filter){
 const safe=projectResponse(x);if(!safe.ok||!Object.hasOwn(filters,filter))return null;
 return safe.rows.filter(filters[filter]);
}
export function projectSampleCounts(x){
 const safe=projectResponse(x);if(!safe.ok)return null;
 return {total:safe.rows.length,changed_or_invalidated:safe.rows.filter(filters.changed).length,report_receipts:safe.rows.filter(filters.reports).length,comment_observations:safe.rows.filter(filters.comments).length,unconfirmed:safe.rows.filter(filters.unresolved).length};
}
