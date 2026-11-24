function typedTags(labels){
  if(!Array.isArray(labels)||labels.length>100||labels.some(x=>typeof x!=="string"||x.length>255))return {status:"UNKNOWN",values:[]};
  const values=[];
  for(const tag of new Set(labels)){
    let m;
    if((m=/^tf-req-([A-Z][A-Z0-9]{0,15}-[1-9][0-9]{0,8})$/u.exec(tag)))values.push({subject:m[1],predicate:"requirement.id",value:m[1]});
    else if((m=/^tf-test-([A-Z][A-Z0-9]{0,15}-[1-9][0-9]{0,8})-(pass|fail)$/u.exec(tag)))values.push({subject:m[1],predicate:"test.reported_result",value:m[2]});
    else if((m=/^tf-policy-([A-Z][A-Z0-9]{0,15})-v([1-9][0-9]{0,8})$/u.exec(tag)))values.push({subject:m[1],predicate:"policy.reported_version",value:m[2]});
    else if((m=/^tf-owner-([A-Z][A-Z0-9]{0,15}-[1-9][0-9]{0,8})-([A-Z][A-Z0-9]{0,15})$/u.exec(tag)))values.push({subject:m[1],predicate:"ownership.reported_team",value:m[2]});
  }
  if(values.length>32)return {status:"UNKNOWN",values:[]};
  return {status:"OBSERVED",values:values.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))};
}

function reviewClaims(bundle){
  if(!bundle||!Array.isArray(bundle.claims)||!Array.isArray(bundle.sources)||bundle.claims.length>256)return {status:"HUMAN_REVIEW_REQUIRED",checks:[],reason:"CLAIMS_UNKNOWN"};
  const ids=new Set(bundle.sources.map(x=>x.source_ref));
  const groups=new Map(),checks=[];
  const known=["jira.status","jira.issue_type","requirement.id","test.reported_result","policy.reported_version","ownership.reported_team"];
  for(const c of bundle.claims){
    if(!c||!ids.has(c.source_ref)||!known.includes(c.predicate)||typeof c.subject!=="string"||typeof c.value!=="string"||typeof c.claim_id!=="string")return {status:"HUMAN_REVIEW_REQUIRED",checks:[],reason:"CLAIMS_UNKNOWN"};
    const k=JSON.stringify([c.subject,c.predicate]);
    if(!groups.has(k))groups.set(k,[]);
    groups.get(k).push(c);
  }
  for(const group of groups.values()){
    const values=[...new Set(group.map(c=>c.value))],refs=[...new Set(group.map(c=>c.source_ref))],predicate=group[0].predicate;
    const conflict=values.length>1;
    checks.push({subject:group[0].subject,predicate,values,source_refs:refs,claim_ids:group.map(c=>c.claim_id),status:conflict?"CONFLICT_FOUND":predicate.startsWith("jira.")?"SOURCE_OBSERVED":"UNVERIFIED_CLAIM",reason:conflict?"COMPARABLE_VALUES_DIFFER":predicate.startsWith("jira.")?"OBSERVED_FIELD_NOT_CERTIFICATION":"REPORTED_LABEL_NOT_INDEPENDENT_TEST_OR_POLICY"});
  }
  const predicates=new Set(bundle.claims.map(c=>c.predicate));
  const missing=["requirement.id","test.reported_result","policy.reported_version","ownership.reported_team"].filter(x=>!predicates.has(x));
  const conflict=checks.some(x=>x.status==="CONFLICT_FOUND");
  return {status:conflict?"CONFLICT_FOUND":"HUMAN_REVIEW_REQUIRED",reason:conflict?"COMPARABLE_VALUES_DIFFER":"NO_INDEPENDENT_CERTIFICATION",missing_predicates:missing,checks,authorization:"NONE"};
}

export { typedTags,reviewClaims };
