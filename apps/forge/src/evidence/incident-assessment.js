// Read-only incident coordination: reported ownership is never actual assignment.
export function assessIncident(evidence,review,freshness){
 const sources=Array.isArray(evidence?.sources)?evidence.sources:[],checks=Array.isArray(review?.checks)?review.checks:[];
 const visible=new Map(sources.map(s=>[s.source_ref,s.uri]));
 const cite=c=>[...new Set((Array.isArray(c?.source_refs)?c.source_refs:[]).map(id=>visible.get(id)).filter(Boolean))];
 const reqs=checks.filter(c=>c.predicate==="requirement.id"),owners=checks.filter(c=>c.predicate==="ownership.reported_team"),policies=checks.filter(c=>c.predicate==="policy.reported_version");
 const subjects=new Set(reqs.map(c=>c.subject));
 const ownership=reqs.map(c=>{
  const matches=owners.filter(o=>o.subject===c.subject),teams=[...new Set(matches.flatMap(o=>o.values))];
  return {subject:c.subject,teams,state:matches.some(o=>o.status==="CONFLICT_FOUND")||teams.length>1?"OWNERSHIP_CONFLICT":teams.length===1?"REPORTED_OWNER_NOT_VERIFIED":"MISSING_REPORTED_OWNER",source_uris:[...new Set([...cite(c),...matches.flatMap(cite)])]};
 });
 const unmatched_owners=owners.filter(c=>!subjects.has(c.subject)).map(c=>({subject:c.subject,teams:c.values,state:c.status,source_uris:cite(c)}));
 const policy_versions=policies.map(c=>({subject:c.subject,versions:c.values,state:c.status,source_uris:cite(c)}));
 const incomplete=evidence?.coverage!=="BOUNDED_READ_COMPLETE"||!review||review.reason==="CLAIMS_UNKNOWN"||!["CURRENT_OBSERVED","STALE_VERSION"].includes(freshness?.status);
 const status=incomplete?"ACCESS_OR_COVERAGE_UNKNOWN":freshness.status==="STALE_VERSION"?"STALE_EVIDENCE":review.status==="CONFLICT_FOUND"?"CONFLICT_REVIEW":!reqs.length||!policies.length||unmatched_owners.length||ownership.some(o=>o.state==="MISSING_REPORTED_OWNER")?"MISSING_OR_UNMATCHED_COORDINATION_EVIDENCE":"HUMAN_COORDINATION_REVIEW_REQUIRED";
 return {schema_version:"hae.incident.assessment.v1",status,ownership,unmatched_owners,policy_versions,source_count:sources.length,authorization:"NONE",execution:"NO_JIRA_MUTATION",certification:"REPORTED_EVIDENCE_ONLY"};
}
