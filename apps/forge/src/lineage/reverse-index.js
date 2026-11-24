import {canonical} from "../core/ir/plan.js";
const hex=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
// Compact per-review immutable index, keyed by stable dependency identity.
// All entries are scoped by the enclosing digest-validated review record.
export function buildReverseIndex(graph){
 if(!graph?.ok||!Array.isArray(graph.nodes)||!Array.isArray(graph.edges)||graph.nodes.length>600||graph.edges.length>1500)return null;
 const nodes=new Map(),out=new Map(),roots=new Map();
 for(const n of graph.nodes){
  if(!hex(n.id)||nodes.has(n.id))return null;
  nodes.set(n.id,n);out.set(n.id,[]);
  if(n.kind==="SOURCE"){if(!hex(n.ref)||roots.has(n.ref))return null;roots.set(n.ref,n.id)}
 }
 for(const e of graph.edges){if(!nodes.has(e.from_dependency)||!nodes.has(e.to_dependent)||out.get(e.from_dependency).includes(e.to_dependent))return null;out.get(e.from_dependency).push(e.to_dependent)}
 return {schema_version:"hae.review.reverse-index.v1",source_roots:[...roots].sort((a,b)=>a[0].localeCompare(b[0])),adjacency:[...out].filter(([,v])=>v.length).map(([k,v])=>[k,v.sort()]).sort((a,b)=>a[0].localeCompare(b[0]))};
}
export function validReverseIndex(graph,index){
 const expected=buildReverseIndex(graph);
 try{return !!expected&&canonical(expected)===canonical(index)}catch{return false}
}
