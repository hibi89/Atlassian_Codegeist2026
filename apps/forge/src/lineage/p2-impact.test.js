import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {analyzeImpact} from "./impact.js";
import {buildReverseIndex} from "./reverse-index.js";
const h=s=>createHash("sha256").update(s).digest("hex"),p={tenant:h("tenant"),actor:h("actor"),target:"DEMO-1"};
const kinds={A:"SOURCE",B:"SOURCE",C:"CLAIM",D:"CLAIM",E:"CLAIM",F:"CHECK",G:"CHECK",H:"PLAN",I:"POLICY",J:"APPROVAL",K:"STEP",L:"RECEIPT",M:"PLAN",N:"POLICY",O:"APPROVAL",P:"STEP",Q:"RECEIPT"};
const base=()=>({ok:true,schema_version:"hae.proofgraph.v1",installation_ref:p.tenant,actor_ref:p.actor,target:p.target,coverage:"BOUNDED_READ_COMPLETE",graph_revision:h("graph"),nodes:Object.entries(kinds).map(([k,kind])=>({id:h(k),ref:h("ref"+k),kind,installation_ref:p.tenant,digest:h("digest"+k)})),edges:["AC","AD","CF","DF","FH","HI","IJ","JK","KL","BE","EG","GM","MN","NO","OP","PQ"].map(s=>({from_dependency:h(s[0]),to_dependent:h(s[1]),relation:"TEST_DEPENDENCY"}))});
const freshness=(changed=[],unknown=[])=>({status:unknown.length?"UNKNOWN":changed.length?"STALE_VERSION":"CURRENT_OBSERVED",changed:changed.map(k=>h("ref"+k)),unchanged:["A","B"].filter(k=>!changed.includes(k)&&!unknown.includes(k)).map(k=>h("ref"+k)),unknown:unknown.map(k=>h("ref"+k))});
const ids=s=>[...s].map(h).sort();
for(const [name,changed,expected] of [["no change",[],""],["diamond A",["A"],"ACDFHIJK"],["branch B",["B"],"BEGMNOP"],["both branches",["A","B"],"ABCDEFGH IJKMNOP".replaceAll(" ","")]]){
 test("P2 oracle "+name,()=>{const g=base(),before=JSON.stringify(g),f=freshness(changed),a=analyzeImpact(p,g,f,buildReverseIndex(g));assert.equal(a.ok,true);assert.deepEqual(a.affected,ids(expected));assert.deepEqual(a.preserved_receipts,ids("LQ"));assert.deepEqual(a.unaffected,ids(Object.keys(kinds).filter(k=>!expected.includes(k)&&!["L","Q"].includes(k)).join("")));assert.equal(JSON.stringify(g),before);assert.deepEqual(a,analyzeImpact(p,g,f));});
}
const faults=[
 ["foreign tenant",g=>g.installation_ref=h("other")],
 ["foreign actor",g=>g.actor_ref=h("other")],
 ["foreign target",g=>g.target="OTHER-1"],
 ["duplicate node",g=>g.nodes.push(g.nodes[0])],
 ["duplicate source",g=>g.nodes[1].ref=g.nodes[0].ref],
 ["unknown kind",g=>g.nodes[2].kind="UNKNOWN"],
 ["foreign node",g=>g.nodes[2].installation_ref=h("other")],
 ["bad digest",g=>g.nodes[2].digest="bad"],
 ["orphan edge",g=>g.edges.push({from_dependency:h("missing"),to_dependent:h("H"),relation:"TEST"})],
 ["duplicate edge",g=>g.edges.push(g.edges[0])],
 ["cycle",g=>g.edges.push({from_dependency:h("K"),to_dependent:h("C"),relation:"TEST"})],
 ["receipt used as authority",g=>g.edges.push({from_dependency:h("L"),to_dependent:h("O"),relation:"TEST"})],
 ["orphan node",g=>g.edges=g.edges.filter(e=>e.to_dependent!==h("C"))],
 ["source with parent",g=>g.edges.push({from_dependency:h("P"),to_dependent:h("A"),relation:"TEST"})],
 ["incomplete coverage",g=>g.coverage="INCOMPLETE_OR_UNKNOWN"],
 ["node cap",g=>g.nodes=Array.from({length:601},()=>g.nodes[0])],
 ["edge cap",g=>g.edges=Array.from({length:1501},()=>g.edges[0])]
];
for(const [name,mutate] of faults)test("P2 deny "+name,()=>{const g=base();mutate(g);const r=analyzeImpact(p,g,freshness(["A"]));assert.equal(r.ok,false);assert.equal(r.execution,"DISABLED")});
test("P2 missing access, new dependency, duplicate classification and forged index",()=>{
 const g=base(),index=buildReverseIndex(g);
 for(const f of [freshness([],["A"]),freshness(["X"]),{...freshness(["A"]),unchanged:[h("refA"),h("refB")]},{...freshness(["A"]),unchanged:[]}])assert.equal(analyzeImpact(p,g,f,index).ok,false);
 index.adjacency[0][1]=[];assert.equal(analyzeImpact(p,g,freshness(["A"]),index).code,"GRAPH_INDEX_INVALID");
});

test("P2 600-node graph with separate branches preserves exact unrelated paths and receipt history",()=>{
 const g=base();g.nodes=[];g.edges=[];
 const kind=["SOURCE","CLAIM","CHECK","PLAN","POLICY","APPROVAL","STEP","RECEIPT"];
 for(let branch=0;branch<2;branch++){
  for(let n=0;n<300;n++){const k=n===0?"SOURCE":n===299?"RECEIPT":kind[1+(n-1)%6];g.nodes.push({id:h(branch+":"+n),ref:h("ref"+branch+":"+n),kind:k,installation_ref:p.tenant,digest:h("digest"+branch+":"+n)});if(n)g.edges.push({from_dependency:h(branch+":"+(n-1)),to_dependent:h(branch+":"+n),relation:"TEST_DEPENDENCY"})}
 }
 const fr={status:"STALE_VERSION",changed:[h("ref0:0")],unchanged:[h("ref1:0")],unknown:[]},index=buildReverseIndex(g),a=analyzeImpact(p,g,fr,index);
 assert.equal(a.ok,true);assert.deepEqual(a.affected,Array.from({length:299},(_,n)=>h("0:"+n)).sort());assert.deepEqual(a.unaffected,Array.from({length:299},(_,n)=>h("1:"+n)).sort());assert.deepEqual(a.preserved_receipts,[h("0:299"),h("1:299")].sort());
 assert.equal(analyzeImpact(p,{...g,nodes:[...g.nodes,g.nodes[0]]},fr).ok,false);
});
