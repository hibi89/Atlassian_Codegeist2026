// Deterministic layout of the actual DAG. Never invent edges or hide a failed graph.
export function layoutGraph(nodes,edges){
 if(!Array.isArray(nodes)||!Array.isArray(edges)||!nodes.length||nodes.length>80||edges.length>180)return null;
 const ids=new Set(),depth=new Map(),out=new Map(),incoming=new Map();
 for(const n of nodes){if(!n||typeof n.id!=="string"||ids.has(n.id))return null;ids.add(n.id);depth.set(n.id,0);out.set(n.id,[]);incoming.set(n.id,0)}
 const seen=new Set();
 for(const e of edges){if(!ids.has(e?.from_dependency)||!ids.has(e?.to_dependent))return null;const k=JSON.stringify([e.from_dependency,e.to_dependent]);if(seen.has(k))return null;seen.add(k);out.get(e.from_dependency).push(e.to_dependent);incoming.set(e.to_dependent,incoming.get(e.to_dependent)+1)}
 const order=[...ids].filter(id=>incoming.get(id)===0).sort();
 for(let i=0;i<order.length;i++){const id=order[i];for(const to of out.get(id)){depth.set(to,Math.max(depth.get(to),depth.get(id)+1));incoming.set(to,incoming.get(to)-1);if(incoming.get(to)===0)order.push(to)}}
 if(order.length!==ids.size||Math.max(...depth.values())>12)return null;
 const lanes=new Map(),positions={};let maxRows=0;
 for(const n of nodes){const d=depth.get(n.id);if(!lanes.has(d))lanes.set(d,[]);lanes.get(d).push(n)}
 for(const [d,group] of lanes){group.sort((a,b)=>a.id.localeCompare(b.id));maxRows=Math.max(maxRows,group.length);group.forEach((n,i)=>{Object.defineProperty(positions,n.id,{value:{x:20+d*172,y:24+i*72},enumerable:true})})}
 return {positions,width:Math.max(220,Math.max(...depth.values())*172+172),height:Math.max(116,maxRows*72+20)};
}

// Presentation only: direct neighbors, never a computed authorization or impact closure.
export function inspectNeighbors(nodes,edges,id){
 const known=new Map(nodes.map(n=>[n.id,n]));
 if(!known.has(id))return {incoming:[],outgoing:[]};
 const incoming=[],outgoing=[];
 for(const e of edges){
  if(!known.has(e.from_dependency)||!known.has(e.to_dependent))continue;
  if(e.to_dependent===id)incoming.push({id:e.from_dependency,label:known.get(e.from_dependency).label,relation:e.relation});
  if(e.from_dependency===id)outgoing.push({id:e.to_dependent,label:known.get(e.to_dependent).label,relation:e.relation});
 }
 return {incoming,outgoing};
}

// Labels are display-only projections of the CURRENT authorized preview.
// Match check nodes by their exact incoming claim IDs, not order or guessed names.
export function describePreviewNodes(graph,evidence,review,policy){
 const nodes=Array.isArray(graph?.nodes)?graph.nodes:[],edges=Array.isArray(graph?.edges)?graph.edges:[];
 const sources=new Map((evidence?.sources??[]).map(s=>[s.source_ref,s.uri]));
 const claims=new Map((evidence?.claims??[]).filter(c=>sources.has(c.source_ref)).map(c=>[c.claim_id,c]));
 const byId=new Map(nodes.map(n=>[n.id,n])),incoming=new Map();
 for(const e of edges)if(e.relation==="COMPARE_CLAIM"&&byId.get(e.from_dependency)?.kind==="CLAIM"&&byId.get(e.to_dependent)?.kind==="CHECK"){
  if(!incoming.has(e.to_dependent))incoming.set(e.to_dependent,[]);
  incoming.get(e.to_dependent).push(byId.get(e.from_dependency).ref);
 }
 const key=ids=>JSON.stringify([...ids].sort());
 const checks=new Map();
 for(const c of review?.checks??[])if(Array.isArray(c.claim_ids)&&c.claim_ids.length&&new Set(c.claim_ids).size===c.claim_ids.length&&c.claim_ids.every(id=>claims.has(id))){
  const k=key(c.claim_ids);checks.set(k,checks.has(k)?null:c);
 }
 const subject=c=>sources.get(c.subject)??((c.predicate?.startsWith("jira.")||c.predicate==="confluence.page_version")?"Observed source":c.subject);
 return nodes.map((n,i)=>{
  let label=n.kind+" "+(i+1),detail="Observed preview only",state="OBSERVED_PREVIEW";
  if(n.kind==="SOURCE"){label=sources.get(n.ref)??"Source details unavailable";}
  if(n.kind==="CLAIM"){const c=claims.get(n.ref);if(c){label=c.predicate+" · "+subject(c);detail="Reported value: "+c.value+" · "+c.status;}else{label="Claim details unavailable";state="UNKNOWN_DETAILS";}}
  if(n.kind==="CHECK"){const ids=incoming.get(n.id),c=ids&&new Set(ids).size===ids.length?checks.get(key(ids)):null;if(c){label=c.predicate+" · "+subject(c);detail=c.status+" · "+(c.reason??"Reason unavailable");state=c.status==="CONFLICT_FOUND"?"CONFLICT_FOUND":"OBSERVED_PREVIEW";}else{label="Check details unavailable";state="UNKNOWN_DETAILS";}}
  if(n.kind==="POLICY"){label="Policy · "+(policy?.decision??"Not assessed");detail=policy?.reason??"Reason unavailable";state=policy?.decision==="DENY"||policy?.decision==="REVIEW"?"POLICY_REVIEW":"OBSERVED_PREVIEW";}
  if(n.kind==="PLAN"){label="Typed review plan";detail="Draft only · no execution authorization";}
  return {id:n.id,kind:n.kind,label,detail,state};
 });
}
