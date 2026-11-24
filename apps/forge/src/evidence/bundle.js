function goodId(v,max=256){return typeof v==="string"&&v.length>0&&v.length<=max&&!/[\u0000-\u001f\u007f]/u.test(v)}

function validKey(v){return typeof v==="string"&&v.length<=64&&/^[A-Z][A-Z0-9_]*-[1-9][0-9]*$/.test(v)}

function principal(context,digest){
  if(!context||context.accountType==="anonymous"||!goodId(context.accountId)||!goodId(context.installContext)||!validKey(context.extension?.issue?.key))return null;
  return {tenant:digest("install:"+context.installContext),actor:digest("actor:"+context.accountId),target:context.extension.issue.key};
}

function boundedLinks(raw,target){
  if(!Array.isArray(raw))return {ok:false,code:"LINKS_UNKNOWN"};
  const keys=new Set();
  let malformed=0;
  for(const link of raw.slice(0,64)){
    const inward=link?.inwardIssue?.key,outward=link?.outwardIssue?.key;
    const k=inward??outward;
    if((inward&&outward)||!validKey(k)||k===target){malformed++;continue}
    keys.add(k);
  }
  const sorted=[...keys].sort();
  return {ok:true,keys:sorted.slice(0,6),complete:raw.length<=64&&sorted.length<=6&&malformed===0};
}

function validDate(v){return typeof v==="string"&&Number.isFinite(Date.parse(v))&&/^\d{4}-\d\d-\d\dT/.test(v)}

function normalizedEvidence(result,p,digest,now){
  if(!result?.ok||!result.source||!result.snapshot)return null;
  const {source:s,snapshot:x}=result;
  if(s.provider!=="jira"||!goodId(s.objectId,64)||s.objectId!==x.objectId||!validKey(x.key)||s.uri!=="/browse/"+x.key||!validDate(s.retrievedAt)||!Number.isFinite(now)||Date.parse(s.retrievedAt)>now||s.visibility!=="OBSERVED_AS_USER"||typeof s.contentHash!=="string"||!/^[a-f0-9]{64}$/.test(s.contentHash))return null;
  const version=validDate(s.version)&&Date.parse(s.version)<=now?new Date(Date.parse(s.version)).toISOString():null;
  const stable=digest("jira:"+p.tenant+":"+s.objectId);
  const revision=digest(JSON.stringify([stable,version,s.contentHash]));
  const record={schema_version:"hae.evidence.v2",source_ref:stable,installation_ref:p.tenant,source_kind:"JIRA_ISSUE",object_id:s.objectId,uri:s.uri,version,revision_key:revision,content_digest:s.contentHash,retrieved_at:s.retrievedAt,permission_check_at:s.retrievedAt,freshness_deadline:new Date(Date.parse(s.retrievedAt)+120000).toISOString(),claim_ids:[digest(revision+":status"),digest(revision+":issue_type")],comparison_rule_version:"cg-claims-v1",independent_source_group:null,status:version?"VERSION_OBSERVED":"UNVERIFIED_VERSION",status_reason:version?"AUTHORIZED_READ":"SOURCE_VERSION_UNKNOWN"};
  const claims=[{claim_id:record.claim_ids[0],source_ref:stable,revision_key:revision,subject:stable,predicate:"jira.status",value:x.status,status:"SOURCE_OBSERVED"},{claim_id:record.claim_ids[1],source_ref:stable,revision_key:revision,subject:stable,predicate:"jira.issue_type",value:x.issueType,status:"SOURCE_OBSERVED"}];
    // Jira labels are observed reports, never independent test or policy proof.
  if(x.reportedTags?.status==="OBSERVED"&&Array.isArray(x.reportedTags.values)){
    for(const tag of x.reportedTags.values){
      const claim_id=digest(JSON.stringify([revision,tag.subject,tag.predicate,tag.value]));
      record.claim_ids.push(claim_id);
      claims.push({claim_id,source_ref:stable,revision_key:revision,...tag,status:"UNVERIFIED_CLAIM"});
    }
  }
  return {record,claims};
}

async function collectEvidence(context,adapter,digest,clock){
  const p=principal(context,digest);
  if(!p)return {ok:false,code:"AUTH_CONTEXT_REQUIRED"};
  let root;
  try{root=await adapter.read(p.target)}catch{return {ok:false,code:"JIRA_READ_UNAVAILABLE"}}
  if(!root?.ok)return {ok:false,code:root?.code||"JIRA_READ_UNAVAILABLE"};
  if(root.snapshot?.key!==p.target)return {ok:false,code:"JIRA_RESPONSE_INVALID"};
  const sources=[],claims=[];
  const seen=new Set();
  const add=(result,key)=>{
    if(result?.snapshot?.key!==key)return false;
    const n=normalizedEvidence(result,p,digest,clock());
    if(!n||seen.has(n.record.source_ref))return false;
    seen.add(n.record.source_ref);sources.push(n.record);claims.push(...n.claims);return true;
  };
  if(!add(root,p.target))return {ok:false,code:"EVIDENCE_INVALID"};
  let links;
  try{links=await adapter.links(p.target)}catch{links={ok:false,code:"LINKS_UNKNOWN"}}
  let unknown=0;
  if(links?.ok&&Array.isArray(links.keys)){
    for(const key of links.keys.slice(0,6)){
      if(!validKey(key)||key===p.target){unknown++;continue}
      try{if(!add(await adapter.read(key),key))unknown++}catch{unknown++}
    }
  }else unknown++;
  const complete=links?.ok===true&&links.complete===true&&unknown===0;
  const bundle_hash=digest(JSON.stringify(sources.map(x=>[x.source_ref,x.revision_key]).sort((a,b)=>a[0].localeCompare(b[0]))));
  return {ok:true,snapshot:root.snapshot,source:root.source,evidence:{schema_version:"hae.evidence.bundle.v2",installation_ref:p.tenant,actor_ref:p.actor,target:p.target,sources,claims,bundle_hash,coverage:complete?"BOUNDED_READ_COMPLETE":"INCOMPLETE_OR_UNKNOWN",unknown_count:unknown,authorization:"NONE",status:"OBSERVED_NOT_VERIFIED"}};
}

function compareEvidence(before,after,now){
  if(!before||!after||before.installation_ref!==after.installation_ref||before.actor_ref!==after.actor_ref||before.target!==after.target||!Array.isArray(before.sources)||!Array.isArray(after.sources)||!Number.isFinite(now))return {status:"UNKNOWN",reason:"SCOPE_OR_BUNDLE_UNKNOWN",changed:[],unchanged:[]};
  const current=new Map(after.sources.map(s=>[s.source_ref,s]));
  const changed=[],unchanged=[],unknown=[];
  for(const prior of before.sources){
    const fresh=current.get(prior.source_ref);
    if(!fresh||fresh.status!=="VERSION_OBSERVED"||!fresh.version||!validDate(fresh.freshness_deadline)||Date.parse(fresh.freshness_deadline)<=now||!prior.version){unknown.push(prior.source_ref);continue}
    if(prior.revision_key!==fresh.revision_key||prior.version!==fresh.version||prior.content_digest!==fresh.content_digest)changed.push(prior.source_ref);
    else unchanged.push(prior.source_ref);
    current.delete(prior.source_ref);
  }
  // New dependencies are changes, not silently ignored.
  for(const [id] of current)if(!unknown.includes(id))changed.push(id);
  const partial=before.coverage!=="BOUNDED_READ_COMPLETE"||after.coverage!=="BOUNDED_READ_COMPLETE";
  return {status:unknown.length||partial?"UNKNOWN":changed.length?"STALE_VERSION":"CURRENT_OBSERVED",reason:unknown.length||partial?"INCOMPLETE_OR_STALE_ACCESS":changed.length?"DEPENDENCY_CHANGED":"SAME_BOUNDED_OBSERVATIONS",changed,unchanged,unknown,authorization:"NONE"};
}

async function refreshEvidence(context,adapter,digest,clock){
  const first=await collectEvidence(context,adapter,digest,clock);
  if(!first.ok)return first;
  const second=await collectEvidence(context,adapter,digest,clock);
  if(!second.ok)return {ok:false,code:second.code||"SOURCE_ACCESS_UNKNOWN"};
  return {...second,freshness:compareEvidence(first.evidence,second.evidence,clock())};
}

export { principal, boundedLinks, normalizedEvidence, collectEvidence, compareEvidence, refreshEvidence };
