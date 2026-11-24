import {canonical} from "../core/ir/plan.js";
import {validateCommentPlan} from "../security/write-policy.js";
import {readCommentJournal} from "../state/comment-journal.js";
const hex=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
const fail=code=>({ok:false,code,authorization:"NONE",execution:"DISABLED"});
export async function historicalGraph({store,p,record,current,projection,stale,run,digest,clock}){
 try{
  const g=record.graph;
  const currentSources=new Map(current.evidence.sources.map(s=>[s.source_ref,s]));
  if(g.installation_ref!==p.tenant||g.actor_ref!==p.actor||g.target!==p.target||record.id!==run.events[0].plan_hash||g.nodes.some(n=>n.kind==="SOURCE"&&(!currentSources.has(n.ref)||Date.parse(currentSources.get(n.ref).freshness_deadline)<=clock())))return fail("HISTORY_ACCESS_UNKNOWN");
  const affected=new Set(projection?.affected??[]);
  const labels=new Map();
  const nodes=g.nodes.map((n,i)=>{
    const label=n.kind==="SOURCE"?currentSources.get(n.ref).uri:n.kind+" "+(i+1);
    labels.set(n.id,label);
    return {id:n.id,kind:n.kind,label,state:stale?(projection?(affected.has(n.id)?"STALE_AT_INVALIDATION":"UNCHANGED_AT_INVALIDATION"):"UNKNOWN_AT_INVALIDATION"):"CURRENTLY_REOBSERVED"};
  });
  const edges=g.edges.map(e=>({...e}));
  const seen=new Set(nodes.map(n=>n.id));if(seen.size!==nodes.length||edges.some(e=>!seen.has(e.from_dependency)||!seen.has(e.to_dependent)))return fail("HISTORY_GRAPH_INVALID");
  function append(lineage,baseRevision){
   if(!lineage||baseRevision!==g.graph_revision||!Array.isArray(lineage.nodes)||!Array.isArray(lineage.edges)||lineage.nodes.length>8||lineage.edges.length>12)return false;
   for(const n of lineage.nodes){
    if(!hex(n.id)||!hex(n.digest)||seen.has(n.id)||!["PLAN","POLICY","APPROVAL","STEP","RECEIPT"].includes(n.kind))return false;
    seen.add(n.id);nodes.push({id:n.id,kind:n.kind,label:"Historical "+n.kind,state:"HISTORICAL_RECEIPT_CHAIN"});
   }
   for(const e of lineage.edges){if(!seen.has(e.from_dependency)||!seen.has(e.to_dependent)||typeof e.relation!=="string"||e.relation.length>60)return false;edges.push({...e})}
   return true;
  }
  const journal=await readCommentJournal(store,p,record.id);
  if(journal.status==="JOURNAL_UNKNOWN")return fail("HISTORY_JOURNAL_UNKNOWN");
  if(journal.status==="HISTORICAL_OBSERVED_SUCCESS"){
   const id=journal.request_id;
   const plan=await store.get("cg:comment-request:"+p.tenant+":"+p.actor+":"+id);
   const prefix="cg:comment:"+p.tenant+":"+p.actor+":"+id+":";
   const a=await store.get(prefix+"reconciled")??await store.get(prefix+"outcome");
   if(!validateCommentPlan(p,plan,clock(),{allowExpired:true}).ok||digest(canonical(plan))!==id||plan.review_id!==record.id||plan.dependency_digest!==g.graph_revision||a?.tenant!==p.tenant||a.actor!==p.actor||a.target!==p.target||a.request_id!==id||!hex(a.observation_digest)||!append(a.lineage,a.lineage?.base_graph_revision))return fail("HISTORY_COMMENT_LINEAGE_UNKNOWN");
  }
  const last=run.events[run.events.length-1];
  if(run.state==="SUCCEEDED"&&last.execution_kind==="READ_ONLY_REPORT"){
   const id=last.report_request_id;
   if(!hex(id))return fail("HISTORY_REPORT_UNKNOWN");
   const receipt=await store.get("cg:report:"+p.tenant+":"+p.actor+":"+id+":receipt");
   if(receipt?.schema_version!=="hae.report.receipt.v2"||receipt.tenant!==p.tenant||receipt.actor!==p.actor||receipt.target!==p.target||receipt.review_id!==record.id||receipt.request_id!==id||receipt.report_digest!==last.receipt||!append(receipt.lineage,receipt.lineage?.graph_revision))return fail("HISTORY_REPORT_LINEAGE_UNKNOWN");
  }
  if(nodes.length>620||edges.length>1524)return fail("HISTORY_GRAPH_LIMIT");
  return {ok:true,review_id:record.id,status:stale?"HISTORICAL_STALE":"HISTORICAL_CURRENT_OBSERVATION",nodes,edges,metadata:{classification:"DERIVED_METADATA_ONLY",record_bytes:Buffer.byteLength(JSON.stringify(record),"utf8"),record_digest:record.record_digest,graph_revision:g.graph_revision,expires_at:record.expires_at,source_count:record.evidence.sources.length,node_count:nodes.length,edge_count:edges.length},authorization:"NONE",execution:"DISABLED"};
 }catch{return fail("HISTORY_STORAGE_UNKNOWN")}
}
