// Metadata-only graph from server-authorized current preview. No approval, persistence or write authority.
function buildObservedGraph(p,draft,evidence,review,policy,digest,canonical){
  const bad=code=>({ok:false,code,authorization:"NONE"});
  const hash=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
  if(!p||!hash(p.tenant)||!hash(p.actor)||!draft?.plan||!hash(draft.plan.plan_hash)||draft.plan.issue_key!==p.target||evidence?.installation_ref!==p.tenant||evidence.actor_ref!==p.actor||evidence.target!==p.target||!Array.isArray(evidence.sources)||!Array.isArray(evidence.claims)||!Array.isArray(review?.checks)||evidence.sources.length>7||evidence.claims.length>256||review.checks.length>256)return bad("GRAPH_INCOMPLETE");
  try{
    const nodes=[],edges=[],ids=new Set(),sourceMap=new Map(),claimMap=new Map(),checkIds=[];
    function node(kind,ref,version,content){
      const id=digest(canonical([p.tenant,kind,ref,version]));
      if(!hash(id)||ids.has(id)||nodes.length>=600)throw Error("GRAPH_LIMIT_OR_DUPLICATE");
      ids.add(id);nodes.push({id,installation_ref:p.tenant,kind,ref,version,digest:digest(canonical(content))});return id;
    }
    function edge(from,to,relation){
      if(!ids.has(from)||!ids.has(to)||edges.length>=1500)throw Error("GRAPH_LIMIT_OR_ORPHAN");
      edges.push({from_dependency:from,to_dependent:to,relation});
    }
    for(const s of evidence.sources){
      if(s.installation_ref!==p.tenant||!hash(s.source_ref)||!hash(s.revision_key)||!hash(s.content_digest)||sourceMap.has(s.source_ref))throw Error("GRAPH_SOURCE_INVALID");
      sourceMap.set(s.source_ref,{node:node("SOURCE",s.source_ref,s.revision_key,[s.version,s.content_digest,s.status]),revision:s.revision_key});
    }
    if(!sourceMap.size)throw Error("GRAPH_EMPTY");
    for(const c of evidence.claims){
      const source=sourceMap.get(c.source_ref);
      if(!source||c.revision_key!==source.revision||!hash(c.claim_id)||claimMap.has(c.claim_id))throw Error("GRAPH_CLAIM_INVALID");
      const id=node("CLAIM",c.claim_id,c.revision_key,[c.predicate,c.status,c.value]);claimMap.set(c.claim_id,{id,source:c.source_ref});edge(source.node,id,"OBSERVED_CLAIM");
    }
    const covered=new Set();
    for(const c of review.checks){
      if(!Array.isArray(c.claim_ids)||!c.claim_ids.length||new Set(c.claim_ids).size!==c.claim_ids.length||!Array.isArray(c.source_refs))throw Error("GRAPH_CHECK_INVALID");
      const linked=c.claim_ids.map(id=>claimMap.get(id));
      if(linked.some(x=>!x)||new Set(linked.map(x=>x.source)).size!==new Set(c.source_refs).size||linked.some(x=>!c.source_refs.includes(x.source)))throw Error("GRAPH_CHECK_INVALID");
      const ref=digest(canonical([c.subject,c.predicate,[...c.claim_ids].sort()]));
      const id=node("CHECK",ref,"cg-claims-v1",[c.status,c.reason]);checkIds.push(id);
      for(let i=0;i<linked.length;i++){if(covered.has(c.claim_ids[i]))throw Error("GRAPH_CHECK_DUPLICATE");covered.add(c.claim_ids[i]);edge(linked[i].id,id,"COMPARE_CLAIM");}
    }
    if(covered.size!==claimMap.size)throw Error("GRAPH_CHECK_INCOMPLETE");
    const plan=node("PLAN",draft.plan.plan_hash,draft.plan.capability_lock,[draft.plan.plan_hash,evidence.bundle_hash]);
    for(const s of sourceMap.values())edge(s.node,plan,"PLAN_SOURCE");
    for(const id of checkIds)edge(id,plan,"PLAN_CHECK");
    const decision=node("POLICY",draft.plan.plan_hash,policy.policy_version,[policy.decision,policy.reason,policy.authorization]);edge(plan,decision,"POLICY_PLAN");
    const graph_revision=digest(canonical([nodes.map(n=>[n.id,n.digest]).sort((a,b)=>a[0].localeCompare(b[0])),edges.map(e=>[e.from_dependency,e.to_dependent,e.relation]).sort((a,b)=>canonical(a).localeCompare(canonical(b)))]));
    return {ok:true,schema_version:"hae.proofgraph.v1",installation_ref:p.tenant,actor_ref:p.actor,target:p.target,graph_revision,nodes,edges,status:"OBSERVED_PREVIEW_ONLY",coverage:evidence.coverage,authorization:"NONE",execution:"DISABLED"};
  }catch{return bad("GRAPH_INCOMPLETE_OR_LIMIT")}
}
export { buildObservedGraph };
