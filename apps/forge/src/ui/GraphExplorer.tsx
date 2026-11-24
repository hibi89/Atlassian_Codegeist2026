import React,{useId,useState} from "react";
import {layoutGraph} from "./graph-layout.js";
type Node={id:string;kind:string;label:string;state?:string};
type Edge={from_dependency:string;to_dependent:string;relation:string};
export function GraphExplorer({nodes,edges}:{nodes:Node[];edges:Edge[]}){
 const [selected,setSelected]=useState("");const uid=useId();const layout=layoutGraph(nodes,edges);const lookup=new Map(nodes.map(n=>[n.id,n]));
 const current=lookup.get(selected)??nodes[0];
 if(!layout)return <p className="muted">Diagram exceeds the compact layout limit or cannot be laid out safely. Use the full dependency table below.</p>;
 const tone=(state?:string)=>state?.startsWith("STALE")?"stale":state?.startsWith("UNKNOWN")?"unknown":state?.startsWith("HISTORICAL")?"history":"observed";
 return <div className="graph-explorer">
 <div className="graph-legend"><span>Observed</span><span className="stale">Stale at invalidation</span><span className="unknown">Unknown</span><span className="history">Historical receipt</span></div>
 <div className="graph-scroll" tabIndex={0} role="region" aria-label="Scrollable dependency diagram">
 <svg viewBox={"0 0 "+layout.width+" "+layout.height} width={layout.width} height={layout.height} role="img" aria-label="Actual directed evidence dependencies. Use the node selector or dependency table to inspect.">
 <defs><marker id={uid+"-arrow"} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 L10 5 L0 10z" fill="#69778a"/></marker></defs>
 {edges.map((e,i)=>{const a=layout.positions[e.from_dependency],b=layout.positions[e.to_dependent];return <path key={i} d={`M ${a.x+140} ${a.y+24} C ${a.x+156} ${a.y+24}, ${b.x-16} ${b.y+24}, ${b.x} ${b.y+24}`} className={current&&(e.from_dependency===current.id||e.to_dependent===current.id)?"edge-selected":"edge"} markerEnd={"url(#"+uid+"-arrow)"}/>})}
 {nodes.map(n=>{const {x,y}=layout.positions[n.id];return <g key={n.id} className={"graph-node "+tone(n.state)+(current?.id===n.id?" selected":"")} onClick={()=>setSelected(n.id)}><title>{n.label} · {n.state??"Observed only"}</title><rect x={x} y={y} width="140" height="48" rx="8"/><text x={x+10} y={y+17} className="node-kind">{n.kind}</text><text x={x+10} y={y+35}>{n.label.length>19?n.label.slice(0,18)+"…":n.label}</text></g>})}
 </svg></div>
 <label htmlFor={uid}>Inspect node</label><select id={uid} value={current?.id??""} onChange={e=>setSelected(e.target.value)}>{nodes.map(n=><option key={n.id} value={n.id}>{n.label} · {n.kind}</option>)}</select>
 {current&&<div className="node-inspector" aria-live="polite"><strong>{current.label}</strong><p>{current.state??"Observed preview only"}</p><p>Node digest reference: <code>{current.id}</code></p><ul>{edges.filter(e=>e.from_dependency===current.id||e.to_dependent===current.id).map((e,i)=><li key={i}>{lookup.get(e.from_dependency)?.label} → {e.relation} → {lookup.get(e.to_dependent)?.label}</li>)}</ul></div>}
 </div>;
}
