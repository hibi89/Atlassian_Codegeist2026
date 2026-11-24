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
