// Release is a read-only assessment, never a release approval or independent certification.
export function assessRelease(evidence,review,freshness){
 const checks=Array.isArray(review?.checks)?review.checks:[],sources=Array.isArray(evidence?.sources)?evidence.sources:[];
 const visible=new Map(sources.map(s=>[s.source_ref,s.uri]));
 const cite=c=>[...new Set((c?.source_refs??[]).map(r=>visible.get(r)).filter(Boolean))];
 const reqs=checks.filter(c=>c.predicate==="requirement.id");
 const tests=checks.filter(c=>c.predicate==="test.reported_result");
 const requirements=reqs.map(c=>{
  const match=tests.filter(t=>t.subject===c.subject);
  const state=c.status==="CONFLICT_FOUND"||match.some(t=>t.status==="CONFLICT_FOUND")?"CONFLICT_REVIEW":!match.length?"MISSING_REPORTED_TEST":match.some(t=>t.values.includes("fail"))?"REPORTED_FAILURE":match.some(t=>t.values.includes("pass"))?"REPORTED_PASS_NOT_CERTIFIED":"UNKNOWN";
  return {requirement:c.subject,state,source_refs:[...new Set([...cite(c),...match.flatMap(cite)])]};
 });
 const subjects=new Set(reqs.map(c=>c.subject));
 const unmatched_tests=tests.filter(t=>!subjects.has(t.subject)).map(t=>({subject:t.subject,values:t.values,status:t.status,source_refs:cite(t)}));
 const missing=[...(review?.missing_predicates??[])];
 if(!reqs.length&&!missing.includes("requirement.id"))missing.push("requirement.id");
 const inaccessible=evidence?.coverage!=="BOUNDED_READ_COMPLETE"||!freshness||!["CURRENT_OBSERVED","STALE_VERSION"].includes(freshness.status)||!review||review.reason==="CLAIMS_UNKNOWN"||requirements.some(r=>r.state==="UNKNOWN");
 const stale=freshness?.status==="STALE_VERSION";
 const conflict=review?.status==="CONFLICT_FOUND";
 const blocker=inaccessible?"ACCESS_OR_COVERAGE_UNKNOWN":stale?"STALE_EVIDENCE":conflict?"CONFLICT_REVIEW":(requirements.some(r=>r.state==="REPORTED_FAILURE")||unmatched_tests.some(t=>t.values.includes("fail")))?"REPORTED_FAILURE":missing.length||unmatched_tests.length||requirements.some(r=>r.state==="MISSING_REPORTED_TEST")?"MISSING_REPORTED_EVIDENCE":"HUMAN_RELEASE_REVIEW_REQUIRED";
 return {schema_version:"hae.release.assessment.v1",status:blocker,requirements,unmatched_tests,missing_predicates:missing,document_status:evidence?.document_status??"NOT_CONFIGURED",source_count:sources.length,unknown_count:evidence?.unknown_count??null,conflicts:checks.filter(c=>c.status==="CONFLICT_FOUND").map(c=>({predicate:c.predicate,subject:c.subject,sources:cite(c)})),authorization:"NONE",execution:"NO_JIRA_MUTATION",certification:"NOT_INDEPENDENTLY_CERTIFIED"};
}
