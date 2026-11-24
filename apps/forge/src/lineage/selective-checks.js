import {canonical} from "../core/ir/plan.js";
import {compareEvidence} from "../evidence/bundle.js";
import {analyzeImpact} from "./impact.js";
// Only reuse a deterministic check when EVERY claim node and source revision
// matches an immutable, digest-validated saved graph and fresh authorized reads.
export function selectiveChecks(p,record,evidence,digest,now){
 const none=()=>null;
 const f=compareEvidence(record?.evidence,evidence,now),impact=analyzeImpact(p,record?.graph,f,record?.reverse_index);
 if(!impact.ok)return none;
 const unaffected=new Set(impact.unaffected),fresh=new Set(f.unchanged);
 const nodes=new Map(record.graph.nodes.map(n=>[n.id,n]));
 const edges=new Set(record.graph.edges.map(e=>canonical([e.from_dependency,e.to_dependent,e.relation])));
 const sources=new Map(evidence.sources.map(s=>[s.source_ref,s]));
 return group=>{
  if(!Array.isArray(group)||!group.length||group.some(c=>!fresh.has(c.source_ref)))return null;
  const claimIds=[];
  for(const c of group){
   const source=sources.get(c.source_ref);
   if(!source||source.revision_key!==c.revision_key||Date.parse(source.freshness_deadline)<=now)return null;
   const sid=digest(canonical([p.tenant,"SOURCE",c.source_ref,c.revision_key]));
   const cid=digest(canonical([p.tenant,"CLAIM",c.claim_id,c.revision_key]));
   const n=nodes.get(cid),sn=nodes.get(sid);
   if(!unaffected.has(sid)||!unaffected.has(cid)||sn?.kind!=="SOURCE"||sn.digest!==digest(canonical([source.version,source.content_digest,source.status]))||n?.kind!=="CLAIM"||n.digest!==digest(canonical([c.predicate,c.status,c.value]))||!edges.has(canonical([sid,cid,"OBSERVED_CLAIM"])))return null;
   claimIds.push(cid);
  }
  const ref=digest(canonical([group[0].subject,group[0].predicate,group.map(c=>c.claim_id).sort()]));
  const checkId=digest(canonical([p.tenant,"CHECK",ref,"cg-claims-v1"])),check=nodes.get(checkId);
  if(!unaffected.has(checkId)||check?.kind!=="CHECK"||check.version!=="cg-claims-v1"||claimIds.some(id=>!edges.has(canonical([id,checkId,"COMPARE_CLAIM"]))))return null;
  const choices=[{status:"CONFLICT_FOUND",reason:"COMPARABLE_VALUES_DIFFER"},group[0].predicate.startsWith("jira.")?{status:"SOURCE_OBSERVED",reason:"OBSERVED_FIELD_NOT_CERTIFICATION"}:{status:"UNVERIFIED_CLAIM",reason:"REPORTED_LABEL_NOT_INDEPENDENT_TEST_OR_POLICY"}];
  return choices.find(c=>check.digest===digest(canonical([c.status,c.reason])))??null;
 };
}
