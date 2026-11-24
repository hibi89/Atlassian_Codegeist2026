// Scoped, bounded reverse dependency traversal. Observational impact only; no durable invalidation or execution authority.
import { validReverseIndex } from "./reverse-index.js";
function analyzeImpact(p,graph,freshness,index){
  const hold=code=>({ok:false,code,status:"HOLD",authorization:"NONE",execution:"DISABLED"});
  const hex=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
  const kinds=new Set(["SOURCE","CLAIM","CHECK","PLAN","POLICY","APPROVAL","STEP","RECEIPT"]);
  if(!p||!hex(p.tenant)||!hex(p.actor)||!graph?.ok||graph.installation_ref!==p.tenant||graph.actor_ref!==p.actor||graph.target!==p.target||graph.schema_version!=="hae.proofgraph.v1"||!hex(graph.graph_revision)||!Array.isArray(graph.nodes)||!Array.isArray(graph.edges)||graph.nodes.length>600||graph.edges.length>1500||!graph.nodes.length)return hold("GRAPH_SCOPE_OR_LIMIT");
  if(graph.coverage!=="BOUNDED_READ_COMPLETE"||!freshness||!["CURRENT_OBSERVED","STALE_VERSION"].includes(freshness.status)||!Array.isArray(freshness.changed)||!Array.isArray(freshness.unchanged)||!Array.isArray(freshness.unknown)||freshness.unknown.length)return hold("GRAPH_COVERAGE_UNKNOWN");
  const nodes=new Map(),out=new Map(),indegree=new Map(),sources=new Map(),seenEdges=new Set();
  for(const n of graph.nodes){
    if(!n||!hex(n.id)||!hex(n.digest)||n.installation_ref!==p.tenant||!kinds.has(n.kind)||nodes.has(n.id))return hold("GRAPH_NODE_INVALID");
    nodes.set(n.id,n);out.set(n.id,[]);indegree.set(n.id,0);
    if(n.kind==="SOURCE"){if(!hex(n.ref)||sources.has(n.ref))return hold("GRAPH_SOURCE_INVALID");sources.set(n.ref,n.id)}
  }
  for(const e of graph.edges){
    if(!e||!nodes.has(e.from_dependency)||!nodes.has(e.to_dependent)||typeof e.relation!=="string")return hold("GRAPH_EDGE_INVALID");
    const k=e.from_dependency+":"+e.to_dependent;
    if(seenEdges.has(k))return hold("GRAPH_EDGE_DUPLICATE");seenEdges.add(k);
    // Receipts are historical leaves. They cannot grant future authority.
    if(nodes.get(e.from_dependency).kind==="RECEIPT")return hold("GRAPH_RECEIPT_DEPENDENCY");
    out.get(e.from_dependency).push(e.to_dependent);indegree.set(e.to_dependent,indegree.get(e.to_dependent)+1);
  }
  const queue=[...nodes.keys()].filter(id=>indegree.get(id)===0);
  for(let i=0;i<queue.length;i++){for(const id of out.get(queue[i])){indegree.set(id,indegree.get(id)-1);if(indegree.get(id)===0)queue.push(id)}}
  if(queue.length!==nodes.size)return hold("GRAPH_CYCLE");
  // Require every observed source to be classified exactly once. Newly added or
  // inaccessible dependencies missing from this snapshot must cause a full HOLD.
  const all=[...freshness.changed,...freshness.unchanged];
  if(!sources.size||all.length!==sources.size||new Set(all).size!==all.length||all.some(ref=>!sources.has(ref))||(freshness.status==="CURRENT_OBSERVED")!==(freshness.changed.length===0))return hold("GRAPH_SOURCE_COVERAGE_MISMATCH");
  if(index!==undefined&&!validReverseIndex(graph,index))return hold("GRAPH_INDEX_INVALID");
  const traversal=index?new Map(index.adjacency):out;
  const roots=index?new Map(index.source_roots):sources;
  const affected=new Set(),walk=freshness.changed.map(ref=>roots.get(ref)),history=new Set();
  for(let i=0;i<walk.length;i++){
    const id=walk[i];if(affected.has(id)||history.has(id))continue;
    if(nodes.get(id).kind==="RECEIPT"){history.add(id);continue}
    affected.add(id);for(const next of traversal.get(id)??[])walk.push(next);
  }
  const preserved=[...nodes.values()].filter(n=>n.kind==="RECEIPT").map(n=>n.id).sort();
  const unaffected=[...nodes.keys()].filter(id=>!affected.has(id)&&nodes.get(id).kind!=="RECEIPT").sort();
  return {ok:true,status:affected.size?"STALE_REVIEW_REQUIRED":"NO_CHANGE_OBSERVED",affected:[...affected].sort(),unaffected,preserved_receipts:preserved,stale_approvals:[...affected].filter(id=>nodes.get(id).kind==="APPROVAL").sort(),recheck_order:queue.filter(id=>affected.has(id)),authorization:"NONE",execution:"DISABLED"};
}
export { analyzeImpact };
