import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {compareEvidence,collectEvidence} from "../evidence/bundle.js";
import {typedTags} from "../evidence/typed-claims.js";
import {createApprovalBroker} from "./approval/broker.js";
import {previewTypedIntent} from "../core/ir/preview.js";
import {canonical,validatePlan} from "../core/ir/plan.js";
import {guardedPreview} from "./policy.js";
import {createReviewService} from "../state/review-service.js";
const now=Date.parse("2026-11-24T12:00:00Z"),clock=()=>now,h=s=>createHash("sha256").update(s).digest("hex"),ctx={accountId:"synthetic",installContext:"ari:cloud:jira::site/demo",extension:{issue:{key:"DEMO-1"}}};
const fixture=(version="2026-11-24T11:00:00Z",reportedTags=typedTags([]))=>({ok:true,snapshot:{objectId:"1",key:"DEMO-1",status:"Open",issueType:"Task",reportedTags},source:{provider:"jira",objectId:"1",uri:"/browse/DEMO-1",version,retrievedAt:new Date(now).toISOString(),visibility:"OBSERVED_AS_USER",contentHash:h(version+JSON.stringify(reportedTags))}});
const adapter={read:async()=>fixture(),links:async()=>({ok:true,keys:[],complete:true})};
test("P2 duplicate, cross-scope and future source fail closed; unknown labels not missing",async()=>{
 const before=(await collectEvidence(ctx,adapter,h,clock)).evidence;
 for(const sources of [[...before.sources,...before.sources], [{...before.sources[0],installation_ref:h("foreign")}],[{...before.sources[0],version:new Date(now+1000).toISOString()}]])assert.equal(compareEvidence(before,{...before,sources},now).status,"UNKNOWN");
 const unknown=await collectEvidence(ctx,{...adapter,read:async()=>fixture(undefined,typedTags(null))},h,clock);assert.equal(unknown.evidence.coverage,"INCOMPLETE_OR_UNKNOWN");
});
test("P2 corrupt invalidation marker cannot create current status or reveal historical graph",async()=>{
 let version="2026-11-24T11:00:00Z";
 const m=new Map(),store={get:async k=>m.get(k),create:async(k,v)=>{if(m.has(k))throw Error("conflict");m.set(k,JSON.parse(JSON.stringify(v)))}};
 const preview=(c,i,saved)=>guardedPreview(c,i,{adapter:{...adapter,read:async()=>fixture(version)},digest:h,clock,preview:previewTypedIntent,checkPlan:validatePlan,planDigest:p=>h(canonical(p))},saved);
 const service=createReviewService({store,clock,digest:h,preview,development:()=>true});
 const saved=await service.save(ctx,"review change");assert.equal(saved.ok,true);const id=saved.saved_review.review_id;
 version="2026-11-24T11:05:00Z";assert.equal((await service.refresh(ctx,id)).status,"STALE_REVIEW_REQUIRED");
 const marker=[...m.keys()].find(k=>k.endsWith(":invalidated"));m.get(marker).projection.affected=[];
 assert.equal((await service.refresh(ctx,id)).ok,false);assert.equal((await service.history(ctx,id)).ok,false);
});
test("P2 approval cannot survive shortened request expiration or legacy receipt",async()=>{
 const m=new Map(),store={get:async k=>m.get(k),create:async(k,v)=>{if(m.has(k))throw Error("conflict");m.set(k,v)}},p={tenant:h("tenant"),actor:h("actor"),target:"DEMO-1"},b={plan_hash:h("plan"),evidence_bundle_hash:h("evidence"),dependency_digest:h("deps"),policy_version:"policy-v2",capability_lock:"cap-v2",request_digest:h("request"),expires_at:now+10000,graph_status:"VALID",policy_decision:"ALLOW"};
 const broker=createApprovalBroker(store,clock);assert.equal((await broker.issue(p,b,b.request_digest)).ok,true);
 assert.equal((await broker.consume(p,b.request_digest,{...b,expires_at:now+1000})).ok,false);
 const key=[...m.keys()][0];m.get(key).schema_version="hae.approval.v1";assert.equal((await broker.consume(p,b.request_digest,b)).ok,false);
});

import {performance} from "node:perf_hooks";
import {buildReverseIndex} from "../lineage/reverse-index.js";
test("P2 paired source benchmark: selective and full decision agree across fixed scenarios",async()=>{
 let version="2026-11-24T11:00:00Z",denied=false;
 const a={links:async()=>({ok:true,keys:["DEMO-2"],complete:true}),read:async k=>{
  if(denied&&k==="DEMO-2")return {ok:false,code:"SOURCE_ACCESS_UNKNOWN"};
  const v=k==="DEMO-1"?version:"2026-11-24T11:00:00Z",objectId=k.slice(-1);
  return {ok:true,snapshot:{objectId,key:k,status:"Open",issueType:"Task",reportedTags:typedTags(["tf-req-"+k,"tf-test-"+k+"-pass"])},source:{provider:"jira",objectId,uri:"/browse/"+k,version:v,retrievedAt:new Date(now).toISOString(),visibility:"OBSERVED_AS_USER",contentHash:h(k+v)}};
 }};
 const deps={adapter:a,digest:h,clock,preview:(c,i,n)=>previewTypedIntent(c,i,n,()=>"benchmark-plan"),checkPlan:validatePlan,planDigest:p=>h(canonical(p))};
 const baseline=await guardedPreview(ctx,"review change",deps);
 const saved={evidence:baseline.evidence,graph:baseline.graph,reverse_index:buildReverseIndex(baseline.graph)};
 const rows=[];
 for(const [scenario,v,d,expectedReuse] of [["unchanged","2026-11-24T11:00:00Z",false,8],["changed","2026-11-24T11:05:00Z",false,4],["denied","2026-11-24T11:05:00Z",true,0]]){
  version=v;denied=d;let fullMs=0,selectMs=0;
  for(let i=0;i<20;i++){
   const start=performance.now();const full=await guardedPreview(ctx,"review change",deps);const mid=performance.now();const selective=await guardedPreview(ctx,"review change",deps,saved);const end=performance.now();fullMs+=mid-start;selectMs+=end-mid;
   assert.deepEqual(selective.policy,full.policy);assert.deepEqual(selective.claim_review.checks,full.claim_review.checks);assert.equal(selective.graph.graph_revision,full.graph.graph_revision);assert.equal(selective.claim_review.revalidation.reused,expectedReuse);
  }
  rows.push({scenario,pairs:20,full_ms:Number(fullMs.toFixed(3)),selective_ms:Number(selectMs.toFixed(3)),reused_groups:expectedReuse,decision_equal:true});
 }
 console.log("CG_P2_PAIRED_BENCHMARK:"+JSON.stringify(rows));
});

test("P2 over-limit or duplicate linked keys cannot claim complete coverage",async()=>{
 for(const keys of [Array.from({length:7},(_,i)=>"DEMO-"+(i+2)),["DEMO-2","DEMO-2"]]){
  const r=await collectEvidence(ctx,{...adapter,links:async()=>({ok:true,keys,complete:true}),read:async k=>{const x=fixture();return {...x,snapshot:{...x.snapshot,key:k,objectId:k.slice(5)},source:{...x.source,objectId:k.slice(5),uri:"/browse/"+k,contentHash:h(k)}}}},h,clock);
  assert.equal(r.evidence.coverage,"INCOMPLETE_OR_UNKNOWN");
 }
});

import {developmentAdmission,syntheticReadiness,syntheticScopeAllowed,demoInstallMatches,demoIssueMatches} from "./installation-policy.js";
test("installation policy preserves development-only authority and exact synthetic scope",()=>{
 const id="00000000-0000-4000-8000-000000000001",other="00000000-0000-4000-8000-000000000002",ctx={installContext:"ari:cloud:jira::site/"+id,extension:{issue:{key:"HTF-2"}}},wrong={...ctx,installContext:"ari:cloud:jira::site/"+other},issue={...ctx,extension:{issue:{key:"HTF-3"}}};
 const operations=["read","preview","save","refresh","history","revalidate","recoverReport","repairDraft","prepare","approve","generate","revoke","provider","comment:prepare","comment:approve","comment:execute","comment:revoke","comment:reconcile"];
 for(const op of operations){assert.equal(developmentAdmission(ctx,true,id,op).ok,true);for(const env of [false,undefined,"PRODUCTION","DEVELOPMENT",null])assert.equal(developmentAdmission(ctx,env,id,op).ok,false);if(op!=="read"&&op!=="preview"){for(const c of [wrong,issue,null])assert.equal(developmentAdmission(c,true,id,op).ok,false);for(const cloud of [undefined,"demo",other])assert.equal(developmentAdmission(ctx,true,cloud,op).ok,false)}}
 for(const op of ["unknown","comment:constructor","constructor","__proto__","comment:dispatch",null,undefined]){assert.equal(syntheticScopeAllowed(ctx,op,id),false);assert.equal(developmentAdmission(ctx,true,id,op).code,"DEVELOPMENT_OPERATION_DENIED")}
 assert.equal(syntheticReadiness(ctx,true,id),"READY_FOR_SYNTHETIC_REQUESTS");assert.equal(syntheticReadiness(ctx,false,id),"DEVELOPMENT_ENVIRONMENT_REQUIRED");assert.equal(syntheticReadiness(issue,true,id),"SYNTHETIC_ISSUE_REQUIRED");assert.equal(syntheticReadiness(ctx,true,"demo"),"DEMO_SITE_NOT_CONFIGURED");assert.equal(syntheticReadiness(wrong,true,id),"DEMO_SITE_MISMATCH");assert.equal(demoInstallMatches(issue,id),true);assert.equal(demoIssueMatches(issue,id),false);assert.equal(demoIssueMatches({...ctx,installContext:"ari:cloud:jira::site/demo"},"demo"),false);assert.equal(developmentAdmission(wrong,true,undefined,"read").ok,true);
});
