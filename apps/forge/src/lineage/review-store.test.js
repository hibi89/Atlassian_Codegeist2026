import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {guardedPreview} from "../security/policy.js";
import {previewTypedIntent} from "../core/ir/preview.js";
import {canonical,validatePlan} from "../core/ir/plan.js";
import {createReviewService} from "../state/review-service.js";
import {getKvs,createDevelopmentStore,syntheticScopeAllowed} from "../state/forge-review.js";
const digest=s=>createHash("sha256").update(s).digest("hex");
test("development save and recheck use immutable metadata and never revive stale review",async()=>{
 const map=new Map(),clock=()=>Date.parse("2026-11-24T12:00:00Z"),ctx={accountId:"synthetic",installContext:"ari:cloud:jira::site/test-a",extension:{issue:{key:"DEMO-1"}}};
 const store={get:async k=>map.get(k),create:async(k,v)=>{if(map.has(k))throw Error("conflict");map.set(k,JSON.parse(JSON.stringify(v)))}};
 let version="2026-11-24T11:00:00Z",denied=false;
 const adapter={links:async()=>({ok:true,keys:[],complete:true}),read:async k=>denied?{ok:false,code:"SOURCE_ACCESS_UNKNOWN"}:{ok:true,snapshot:{objectId:"1",key:k,status:"Open",issueType:"Task",summary:"RAW_SECRET_FIXTURE"},source:{provider:"jira",objectId:"1",uri:"/browse/"+k,version,retrievedAt:new Date(clock()).toISOString(),visibility:"OBSERVED_AS_USER",contentHash:digest(k+version)}}};
 const preview=(c,i,saved)=>guardedPreview(c,i,{adapter,digest,clock,preview:previewTypedIntent,checkPlan:validatePlan,planDigest:p=>digest(canonical(p))},saved);
 const service=createReviewService({store,clock,digest,preview,development:()=>true});
 assert.equal((await createReviewService({store,clock,digest,preview,development:()=>false}).save(ctx,"review change")).ok,false);
 const saved=await service.save(ctx,"review change");assert.equal(saved.ok,true);assert.equal(saved.saved_review.run_state,"POLICY_REVIEW");assert.equal(saved.saved_review.metadata.raw_originals,"NOT_STORED");assert.ok(saved.saved_review.metadata.record_bytes>0);const id=saved.saved_review.review_id;
 assert.equal(JSON.stringify([...map.values()]).includes("RAW_SECRET_FIXTURE"),false);assert.equal(JSON.stringify([...map.values()]).includes("/browse/"),false);
 const unchanged=await service.refresh(ctx,id);assert.equal(unchanged.status,"NO_CHANGE_OBSERVED");assert.equal(unchanged.revalidation.reused,2);assert.equal(unchanged.revalidation.recomputed,0);
 assert.equal((await service.refresh({...ctx,accountId:"other"},id)).ok,false);
 version="2026-11-24T11:05:00Z";assert.equal((await service.refresh(ctx,id)).status,"STALE_REVIEW_REQUIRED");
 version="2026-11-24T11:00:00Z";assert.equal((await service.refresh(ctx,id)).status,"STALE_REVIEW_REQUIRED");
 const fresh=await service.save(ctx,"review change");assert.equal(fresh.ok,true);denied=true;assert.equal((await service.refresh(ctx,fresh.saved_review.review_id)).ok,false);denied=false;
 assert.equal((await service.refresh(ctx,fresh.saved_review.review_id)).status,"STALE_REVIEW_REQUIRED");
});
test("KVS adapter uses only bounded conditional writes, package export resolved",async()=>{
 const actual=getKvs();assert.equal(typeof actual.get,"function");assert.equal(typeof actual.set,"function");
 const map=new Map();const kvs={get:async(k,o)=>{assert.deepEqual(o.metadataFields,["EXPIRE_TIME"]);return map.has(k)?{key:k,value:map.get(k),expireTime:new Date(Date.now()+86400000).toISOString()}:undefined},set:async(k,v,o)=>{assert.equal(o.keyPolicy,"FAIL_IF_EXISTS");assert.equal(o.ttl.value,1);if(map.has(k))throw Error("conflict");map.set(k,v)}};
 const store=createDevelopmentStore(kvs);await store.create("test:one",{x:1});await assert.rejects(store.create("test:one",{x:2}));assert.equal((await store.get("test:one")).x,1);
 await assert.rejects(store.create("test:large",{x:"x".repeat(61441)}));
});

import {createReportService} from "../security/approval/report-service.js";
import {reserveDailySlot} from "../state/daily-budget.js";
test("read-only approval is exact, consumed once and refuses changed evidence or revocation",async()=>{
 const map=new Map(),clock=()=>Date.parse("2026-11-24T12:00:00Z"),ctx={accountId:"synthetic",installContext:"ari:cloud:jira::site/test-a",extension:{issue:{key:"DEMO-1"}}};
 const store={get:async k=>map.get(k),create:async(k,v)=>{if(map.has(k))throw Error("conflict");map.set(k,JSON.parse(JSON.stringify(v)))}};
 let version="2026-11-24T11:00:00Z",counter=0;
 const adapter={links:async()=>({ok:true,keys:[],complete:true}),read:async k=>({ok:true,snapshot:{objectId:"1",key:k,status:"Open",issueType:"Task",summary:"RAW_SECRET_FIXTURE"},source:{provider:"jira",objectId:"1",uri:"/browse/"+k,version,retrievedAt:new Date(clock()).toISOString(),visibility:"OBSERVED_AS_USER",contentHash:digest(k+version)}})};
 const preview=(c,i,saved)=>guardedPreview(c,i,{adapter,digest,clock,preview:previewTypedIntent,checkPlan:validatePlan,planDigest:p=>digest(canonical(p))},saved);
 const deps={store,clock,digest,preview,development:()=>true,nonce:()=>digest("nonce"+(++counter))};
 const reviews=createReviewService(deps),reports=createReportService(deps);
 const create=async()=>{const saved=await reviews.save(ctx,"review release");assert.equal(saved.ok,true);const q=await reports.prepare(ctx,saved.saved_review.review_id);assert.equal(q.ok,true);return q.request_id};
 const id=await create();
 assert.equal((await reports.generate(ctx,id)).ok,false);
 assert.equal((await reports.approve(ctx,id,true)).ok,false);
 assert.equal((await reports.approve({...ctx,accountId:"other"},id,id)).ok,false);
 assert.equal((await reports.approve(ctx,id,id)).ok,true);
 const pair=await Promise.all([reports.generate(ctx,id),reports.generate(ctx,id)]);assert.equal(pair.filter(x=>x.ok).length,1);
 const result=pair.find(x=>x.ok);assert.equal(result.execution,"NO_JIRA_MUTATION");assert.equal(result.run_state,"SUCCEEDED");assert.equal(result.lineage.nodes.length,3);assert.equal(result.report.sources[0].uri,"/browse/DEMO-1");assert.equal(result.report.release_assessment.status,"MISSING_REPORTED_EVIDENCE");assert.equal((await reviews.refresh(ctx,result.report.review_id)).run_state,"SUCCEEDED");const history=await reviews.history(ctx,result.report.review_id);assert.equal(history.ok,true);assert.ok(history.nodes.some(n=>n.kind==="RECEIPT"));assert.equal((await reviews.history({...ctx,accountId:"other"},result.report.review_id)).ok,false);assert.equal((await reports.prepare(ctx,result.report.review_id)).ok,false);
 const receipt=[...map.values()].find(x=>x.schema_version==="hae.report.receipt.v2");const edge=receipt.lineage.edges[0],relation=edge.relation;edge.relation="FORGED";assert.equal((await reviews.history(ctx,result.report.review_id)).ok,false);edge.relation=relation;assert.equal((await reviews.history(ctx,result.report.review_id)).ok,true);
 assert.equal(JSON.stringify([...map.values()]).includes("RAW_SECRET_FIXTURE"),false);
 const stale=await create();assert.equal((await reports.approve(ctx,stale,stale)).ok,true);version="2026-11-24T11:05:00Z";assert.equal((await reports.generate(ctx,stale)).ok,false);version="2026-11-24T11:00:00Z";assert.equal((await reports.generate(ctx,stale)).ok,false);
 const revoked=await create();assert.equal((await reports.approve(ctx,revoked,revoked)).ok,true);assert.equal((await reports.revoke(ctx,revoked)).ok,true);assert.equal((await reports.generate(ctx,revoked)).ok,false);
});
test("development daily budget admits at most the configured number, fails closed on storage errors",async()=>{
 const m=new Map(),kvs={get:async k=>m.get(k),set:async(k,v,o)=>{assert.equal(o.keyPolicy,"FAIL_IF_EXISTS");if(m.has(k))throw Error("conflict");m.set(k,v)}};
 assert.equal((await reserveDailySlot(kvs,1000,2)).ok,true);assert.equal((await reserveDailySlot(kvs,1000,2)).ok,true);assert.equal((await reserveDailySlot(kvs,1000,2)).code,"DEVELOPMENT_DAILY_BUDGET_EXHAUSTED");assert.equal((await reserveDailySlot(kvs,86401000,2)).ok,true);
 assert.equal((await reserveDailySlot({get:async()=>{throw Error("network")}},1000)).ok,false);
});

test("selective revalidation reuses unchanged authorized groups only, recomputes changed groups",async()=>{
 const map=new Map(),clock=()=>Date.parse("2026-11-24T12:00:00Z"),ctx={accountId:"synthetic",installContext:"ari:cloud:jira::site/test-a",extension:{issue:{key:"DEMO-1"}}};
 const store={get:async k=>map.get(k),create:async(k,v)=>{if(map.has(k))throw Error("conflict");map.set(k,JSON.parse(JSON.stringify(v)))}};
 let version="2026-11-24T11:00:00Z",denied=false,reads=0;
 const adapter={links:async()=>({ok:true,keys:["DEMO-2"],complete:true}),read:async k=>{reads++;if(denied&&k==="DEMO-2")return {ok:false,code:"SOURCE_ACCESS_UNKNOWN"};const v=k==="DEMO-1"?version:"2026-11-24T11:00:00Z",objectId=k.slice(-1);return {ok:true,snapshot:{objectId,key:k,status:"Open",issueType:"Task"},source:{provider:"jira",objectId,uri:"/browse/"+k,version:v,retrievedAt:new Date(clock()).toISOString(),visibility:"OBSERVED_AS_USER",contentHash:digest(k+v)}}}};
 const preview=(c,i,saved)=>guardedPreview(c,i,{adapter,digest,clock,preview:previewTypedIntent,checkPlan:validatePlan,planDigest:p=>digest(canonical(p))},saved);
 const service=createReviewService({store,clock,digest,preview,development:()=>true});
 const s=await service.save(ctx,"review change");assert.equal(s.ok,true);const id=s.saved_review.review_id;reads=0;
 const same=await service.refresh(ctx,id);assert.equal(same.revalidation.reused,4);assert.equal(same.revalidation.recomputed,0);assert.equal(reads,4);
 version="2026-11-24T11:05:00Z";
 const changed=await service.refresh(ctx,id);assert.equal(changed.status,"STALE_REVIEW_REQUIRED");assert.equal(changed.revalidation.reused,2);assert.equal(changed.revalidation.recomputed,2);
 assert.ok(changed.affected_count>0);assert.ok(changed.unaffected_count>0);
 const replacement=await service.revalidate(ctx,id);assert.equal(replacement.ok,true);assert.notEqual(replacement.saved_review.review_id,id);assert.equal(replacement.authorization,"NONE");assert.equal(replacement.revalidation.reused,2);assert.equal(replacement.revalidation.recomputed,2);assert.equal((await service.refresh(ctx,id)).status,"STALE_REVIEW_REQUIRED");assert.equal((await service.refresh(ctx,replacement.saved_review.review_id)).status,"NO_CHANGE_OBSERVED");
 const historical=await service.history(ctx,id);assert.equal(historical.ok,true);assert.equal(historical.status,"HISTORICAL_STALE");assert.ok(historical.nodes.some(n=>n.state==="STALE_AT_INVALIDATION"));denied=true;assert.equal((await service.history(ctx,id)).ok,false);assert.equal((await service.refresh(ctx,id)).ok,false);
});

test("P2 resolver synthetic scope gate permits only configured demo storage and provider",()=>{
 const cloud="12345678-1234-1234-1234-123456789abc",ctx={installContext:"ari:cloud:jira::site/"+cloud,extension:{issue:{key:"HTF-2"}}};
 for(const op of ["save","refresh","history","revalidate","prepare","approve","generate","revoke","comment:prepare","comment:execute","comment:reconcile","provider"]){
  assert.equal(syntheticScopeAllowed(ctx,op,cloud),true);
  assert.equal(syntheticScopeAllowed(ctx,op,undefined),false);
  assert.equal(syntheticScopeAllowed({...ctx,extension:{issue:{key:"HTF-3"}}},op,cloud),false);
  assert.equal(syntheticScopeAllowed({...ctx,installContext:"ari:cloud:jira::site/other"},op,cloud),false);
 }
 assert.equal(syntheticScopeAllowed(ctx,"read",undefined),true);assert.equal(syntheticScopeAllowed(ctx,"preview",undefined),true);
});
test("P2 full daily budget and lost acknowledgement never admit an extra action",async()=>{
 const m=new Map(),kvs={get:async k=>m.get(k),set:async(k,v,o)=>{assert.equal(o.keyPolicy,"FAIL_IF_EXISTS");if(m.has(k))throw Error("conflict");m.set(k,v)}};
 for(let i=0;i<24;i++)assert.equal((await reserveDailySlot(kvs,1000)).ok,true);
 assert.equal((await reserveDailySlot(kvs,1000)).code,"DEVELOPMENT_DAILY_BUDGET_EXHAUSTED");assert.equal(m.size,24);
 const other=new Map(),lost={get:async k=>other.get(k),set:async(k,v)=>{other.set(k,v);throw Error("lost acknowledgement")}};
 assert.equal((await reserveDailySlot(lost,1000)).ok,false);assert.equal(other.size,1);
 const race=new Map(),concurrent={get:async k=>race.get(k),set:async(k,v)=>{if(race.has(k))throw Error("conflict");race.set(k,v)}};
 assert.equal((await Promise.all(Array.from({length:30},()=>reserveDailySlot(concurrent,1000)))).filter(r=>r.ok).length,1);
 assert.equal(race.size,1);
});

test("P2 real KVS adapter contract: expired returned data is denied, not treated as absent",async()=>{
 const now=Date.parse("2026-11-24T12:00:00Z");let result,reads=0,writes=0;
 const kvs={get:async(k,o)=>{reads++;assert.deepEqual(o.metadataFields,["EXPIRE_TIME"]);return result},set:async()=>{writes++}};
 const store=createDevelopmentStore(kvs,()=>now);
 assert.equal(await store.get("cg:test"),undefined);
 for(const bad of [{key:"cg:test",value:{x:1},expireTime:new Date(now).toISOString()},{key:"cg:test",value:{x:1}}, {key:"wrong",value:{x:1},expireTime:new Date(now+1000).toISOString()},{key:"cg:test",expireTime:new Date(now+1000).toISOString()}]){
  result=bad;await assert.rejects(store.get("cg:test"),/EXPIRY_UNKNOWN/);
 }
 result={key:"cg:test",value:{x:1},expireTime:new Date(now+1000).toISOString()};assert.deepEqual(await store.get("cg:test"),{x:1});
 await assert.rejects(store.get("../bad"));await assert.rejects(store.create("x".repeat(501),{x:1}));assert.equal(writes,0);assert.equal(reads,6);
});

for(const fault of ["lost-report-receipt-ack","before-success","missing-report-receipt"]){
 test("P2 report completion recovery: "+fault,async()=>{
  const map=new Map(),clock=()=>Date.parse("2026-11-24T12:00:00Z"),ctx={accountId:"synthetic",installContext:"ari:cloud:jira::site/test-a",extension:{issue:{key:"DEMO-1"}}};
  let inject=false,denied=false,nonce=0;
  const store={get:async k=>map.get(k),create:async(k,v)=>{
   if(map.has(k))throw Error("conflict");
   if(inject&&(fault==="before-success"&&v.state==="SUCCEEDED"||fault==="missing-report-receipt"&&v.schema_version==="hae.report.receipt.v2"))throw Error("synthetic write rejected");
   map.set(k,JSON.parse(JSON.stringify(v)));
   if(inject&&fault==="lost-report-receipt-ack"&&v.schema_version==="hae.report.receipt.v2")throw Error("synthetic acknowledgement lost");
  }};
  const adapter={links:async()=>({ok:true,keys:[],complete:true}),read:async k=>denied?{ok:false,code:"SOURCE_ACCESS_UNKNOWN"}:{ok:true,snapshot:{objectId:"1",key:k,status:"Open",issueType:"Task",summary:"RAW_SECRET_FIXTURE"},source:{provider:"jira",objectId:"1",uri:"/browse/"+k,version:"2026-11-24T11:00:00Z",retrievedAt:new Date(clock()).toISOString(),visibility:"OBSERVED_AS_USER",contentHash:digest(k)}}};
  const preview=(c,i,saved)=>guardedPreview(c,i,{adapter,digest,clock,preview:previewTypedIntent,checkPlan:validatePlan,planDigest:p=>digest(canonical(p))},saved);
  const deps={store,clock,digest,preview,development:()=>true,nonce:()=>digest("nonce"+(++nonce))};
  const reviews=createReviewService(deps),reports=createReportService(deps);
  const saved=await reviews.save(ctx,"review release");assert.equal(saved.ok,true);const reviewId=saved.saved_review.review_id;
  const prepared=await reports.prepare(ctx,reviewId);assert.equal(prepared.ok,true);const id=prepared.request_id;
  assert.equal((await reports.approve(ctx,id,id)).ok,true);inject=true;assert.equal((await reports.generate(ctx,id)).ok,false);inject=false;
  assert.equal((await reports.generate(ctx,id)).ok,false);
  assert.equal((await reviews.recoverReport({...ctx,accountId:"other"},reviewId)).ok,false);
  const r=await reviews.recoverReport(ctx,reviewId);
  if(fault==="missing-report-receipt"){assert.equal(r.ok,false);assert.equal((await reviews.refresh(ctx,reviewId)).run_state,"REPORT_OUTCOME_REVIEW_REQUIRED");return;}
  assert.equal(r.ok,true);assert.equal(r.run_state,"SUCCEEDED");assert.equal(r.execution,"NO_JIRA_MUTATION");assert.equal(r.report,undefined);
  assert.equal((await reviews.recoverReport(ctx,reviewId)).report_digest,r.report_digest);
  assert.equal((await reviews.history(ctx,reviewId)).ok,true);assert.equal((await reports.generate(ctx,id)).ok,false);
  const storedReceipt=[...map.values()].find(v=>v.schema_version==="hae.report.receipt.v2");const originalRelation=storedReceipt.lineage.edges[0].relation;storedReceipt.lineage.edges[0].relation="FORGED";assert.equal((await reviews.recoverReport(ctx,reviewId)).ok,false);storedReceipt.lineage.edges[0].relation=originalRelation;
  const reservation=[...map.values()].find(v=>v.schema_version==="hae.step.reservation.v1");const stepReceipt=[...map.values()].find(v=>v.schema_version==="hae.step.receipt.v1");reservation.payload_digest="0".repeat(64);stepReceipt.payload_digest=reservation.payload_digest;
  assert.equal((await reviews.recoverReport(ctx,reviewId)).ok,false);
  denied=true;assert.equal((await reviews.recoverReport(ctx,reviewId)).ok,false);
 });
}
