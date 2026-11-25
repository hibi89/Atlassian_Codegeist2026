import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {guardedPreview} from "../security/policy.js";
import {previewTypedIntent} from "../core/ir/preview.js";
import {canonical,validatePlan} from "../core/ir/plan.js";
import {createReviewService} from "../state/review-service.js";
import {getKvs,createDevelopmentStore,syntheticScopeAllowed,syntheticReadiness} from "../state/forge-review.js";
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
 const unchanged=await service.refresh(ctx,id);assert.equal(unchanged.status,"NO_CHANGE_OBSERVED");const initialHistory=await service.history(ctx,id);assert.equal(initialHistory.source_comparison.status,"CURRENT_OBSERVED");assert.deepEqual(initialHistory.run_timeline.map(e=>[e.sequence,e.state,e.kind]),[[0,"DRAFT","REVIEW"],[1,"EVIDENCE_PENDING","REVIEW"],[2,"POLICY_REVIEW","REVIEW"]]);assert.ok(initialHistory.run_timeline.every(e=>e.at===new Date(clock()).toISOString()));assert.equal(initialHistory.comment_journal.status,"NO_COMMENT_ATTEMPT");assert.deepEqual(initialHistory.source_comparison.rows,[{uri:"/browse/DEMO-1",saved_version:"2026-11-24T11:00:00.000Z",current_version:"2026-11-24T11:00:00.000Z",state:"UNCHANGED",content_changed:false,revision_changed:false}]);assert.equal(unchanged.revalidation.reused,2);assert.equal(unchanged.revalidation.recomputed,0);
 assert.equal((await service.refresh({...ctx,accountId:"other"},id)).ok,false);
 version="2026-11-24T11:05:00Z";assert.equal((await service.refresh(ctx,id)).status,"STALE_REVIEW_REQUIRED");const changedHistory=await service.history(ctx,id);assert.equal(changedHistory.source_comparison.status,"STALE_VERSION");assert.equal(changedHistory.source_comparison.rows[0].state,"CHANGED");assert.equal(changedHistory.source_comparison.rows[0].content_changed,true);assert.equal(changedHistory.source_comparison.rows[0].saved_version,"2026-11-24T11:00:00.000Z");
 version="2026-11-24T11:00:00Z";assert.equal((await service.refresh(ctx,id)).status,"STALE_REVIEW_REQUIRED");const reverted=await service.history(ctx,id);assert.equal(reverted.status,"HISTORICAL_STALE");assert.equal(reverted.source_comparison.rows[0].state,"UNCHANGED");
 const fresh=await service.save(ctx,"review change");assert.equal(fresh.ok,true);denied=true;assert.equal((await service.refresh(ctx,fresh.saved_review.review_id)).ok,false);assert.equal((await service.history(ctx,fresh.saved_review.review_id)).ok,false);denied=false;
 assert.equal((await service.refresh(ctx,fresh.saved_review.review_id)).status,"STALE_REVIEW_REQUIRED");
});
test("KVS adapter uses only bounded conditional writes, package export resolved",async()=>{
 const actual=getKvs();assert.equal(typeof actual.get,"function");assert.equal(typeof actual.set,"function");
 const map=new Map();const kvs={get:async(k,o)=>{assert.deepEqual(o.metadataFields,["EXPIRE_TIME"]);return map.has(k)?{key:k,value:map.get(k),expireTime:new Date(Date.now()+86400000).toISOString()}:undefined},set:async(k,v,o)=>{assert.equal(o.keyPolicy,"FAIL_IF_EXISTS");assert.equal(o.ttl.value,1);if(map.has(k))throw Error("conflict");map.set(k,v)}};
 const store=createDevelopmentStore(kvs);await store.create("test:one",{x:1});await assert.rejects(store.create("test:one",{x:2}));assert.equal((await store.get("test:one")).x,1);
 await assert.rejects(store.create("test:large",{x:"x".repeat(61441)}));
});

import {createReportService,reportClaimChecks} from "../security/approval/report-service.js";
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
 const result=pair.find(x=>x.ok);assert.equal(result.execution,"NO_JIRA_MUTATION");assert.equal(result.run_state,"SUCCEEDED");assert.equal(result.lineage.nodes.length,3);assert.equal(result.report.sources[0].uri,"/browse/DEMO-1");assert.equal(result.report.checks.length,2);assert.ok(result.report.checks.every(c=>c.subject==="/browse/DEMO-1"&&c.source_uris.length===1&&c.source_uris[0]==="/browse/DEMO-1"));assert.equal(result.report_digest,digest(canonical(result.report)));assert.equal(result.report.release_assessment.status,"MISSING_REPORTED_EVIDENCE");assert.equal((await reviews.refresh(ctx,result.report.review_id)).run_state,"SUCCEEDED");const history=await reviews.history(ctx,result.report.review_id);assert.equal(history.ok,true);assert.deepEqual(history.run_timeline.map(e=>e.state),["DRAFT","EVIDENCE_PENDING","POLICY_REVIEW","AWAITING_APPROVAL","READY","RUNNING","RECONCILING","SUCCEEDED"]);assert.ok(history.run_timeline.slice(3).every(e=>e.kind==="READ_ONLY_REPORT"));assert.equal(history.comment_journal.status,"NO_COMMENT_ATTEMPT");assert.ok(history.nodes.some(n=>n.kind==="RECEIPT"));assert.equal((await reviews.history({...ctx,accountId:"other"},result.report.review_id)).ok,false);assert.equal((await reports.prepare(ctx,result.report.review_id)).ok,false);
 const storedStep=[...map.values()].find(x=>x.schema_version==="hae.step.receipt.v1"),oldAt=storedStep.at;storedStep.at=new Date(clock()+1000).toISOString();assert.equal((await reviews.history(ctx,result.report.review_id)).ok,false);storedStep.at=oldAt;
 const receipt=[...map.values()].find(x=>x.schema_version==="hae.report.receipt.v2");const edge=receipt.lineage.edges[0],relation=edge.relation;edge.relation="FORGED";assert.equal((await reviews.history(ctx,result.report.review_id)).ok,false);edge.relation=relation;assert.equal((await reviews.history(ctx,result.report.review_id)).ok,true);
 assert.equal(JSON.stringify([...map.values()]).includes("RAW_SECRET_FIXTURE"),false);
 const stale=await create();assert.equal((await reports.approve(ctx,stale,stale)).ok,true);version="2026-11-24T11:05:00Z";assert.equal((await reports.generate(ctx,stale)).ok,false);version="2026-11-24T11:00:00Z";assert.equal((await reports.generate(ctx,stale)).ok,false);
 const revoked=await create();assert.equal((await reports.approve(ctx,revoked,revoked)).ok,true);assert.equal((await reports.revoke(ctx,revoked)).ok,true);assert.equal((await reports.generate(ctx,revoked)).ok,false);
});
test("development daily budget admits at most the configured number, fails closed on storage errors",async()=>{
 const m=new Map(),kvs={get:async k=>m.get(k),set:async(k,v,o)=>{assert.equal(o.keyPolicy,"FAIL_IF_EXISTS");if(m.has(k))throw Error("conflict");m.set(k,v)}};
 assert.equal((await reserveDailySlot(kvs,1000,2)).ok,true);assert.equal((await reserveDailySlot(kvs,1000,2)).ok,true);const exhausted=await reserveDailySlot(kvs,1000,2);assert.equal(exhausted.code,"DEVELOPMENT_DAILY_BUDGET_EXHAUSTED");assert.equal(exhausted.retry_at,86400000);assert.equal((await reserveDailySlot(kvs,86401000,2)).ok,true);
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
 for(const bad of [null,{key:"cg:test",value:null,expireTime:new Date(now+1000).toISOString()},{key:"cg:test",value:{x:1},expireTime:new Date(now).toISOString()},{key:"cg:test",value:{x:1}}, {key:"wrong",value:{x:1},expireTime:new Date(now+1000).toISOString()},{key:"cg:test",expireTime:new Date(now+1000).toISOString()}]){
  result=bad;await assert.rejects(store.get("cg:test"),/EXPIRY_UNKNOWN/);
 }
 result={key:"cg:test",value:{x:1},expireTime:new Date(now+1000).toISOString()};assert.deepEqual(await store.get("cg:test"),{x:1});
 await assert.rejects(store.get("../bad"));await assert.rejects(store.create("x".repeat(501),{x:1}));assert.equal(writes,0);assert.equal(reads,8);
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
  assert.equal((await reviews.history(ctx,reviewId)).ok,false);
  denied=true;assert.equal((await reviews.recoverReport(ctx,reviewId)).ok,false);
 });
}


test("P2 read-only report cannot generate after approval expiry during durable step reservation",async()=>{
 const map=new Map(),ctx={accountId:"synthetic",installContext:"ari:cloud:jira::site/test-a",extension:{issue:{key:"DEMO-1"}}};let now=Date.parse("2026-11-24T12:00:00Z"),inject=false,nonce=0;
 const clock=()=>now,store={get:async k=>map.get(k),create:async(k,v)=>{if(map.has(k))throw Error("conflict");map.set(k,JSON.parse(JSON.stringify(v)));if(inject&&v.schema_version==="hae.step.reservation.v1")now+=101}};
 const adapter={links:async()=>({ok:true,keys:[],complete:true}),read:async k=>({ok:true,snapshot:{objectId:"1",key:k,status:"Open",issueType:"Task"},source:{provider:"jira",objectId:"1",uri:"/browse/"+k,version:"2026-11-24T11:00:00Z",retrievedAt:new Date(clock()).toISOString(),visibility:"OBSERVED_AS_USER",contentHash:digest(k)}})};
 const preview=(c,i,saved)=>guardedPreview(c,i,{adapter,digest,clock,preview:previewTypedIntent,checkPlan:validatePlan,planDigest:p=>digest(canonical(p))},saved);
 const deps={store,clock,digest,preview,development:()=>true,nonce:()=>digest("nonce"+(++nonce))},reviews=createReviewService(deps),reports=createReportService(deps);
 const saved=await reviews.save(ctx,"review release"),reviewId=saved.saved_review.review_id,q=await reports.prepare(ctx,reviewId);assert.equal(q.ok,true);
 assert.equal((await reports.approve(ctx,q.request_id,q.request_id)).ok,true);const approval=[...map.values()].find(v=>v.schema_version==="hae.approval.v2");approval.expires_at=now+100;inject=true;
 const result=await reports.generate(ctx,q.request_id);assert.equal(result.code,"REPORT_APPROVAL_OR_EVIDENCE_EXPIRED");assert.equal(result.report,undefined);assert.equal([...map.values()].some(v=>v.schema_version==="hae.report.receipt.v2"),false);assert.equal((await reviews.recoverReport(ctx,reviewId)).ok,false);assert.equal((await reports.generate(ctx,q.request_id)).ok,false);
});

test("P2 full report journey fits the production storage adapter budget per invocation",async()=>{
 const map=new Map(),clock=()=>Date.parse("2026-11-24T12:00:00Z"),ctx={accountId:"synthetic",installContext:"ari:cloud:jira::site/test-a",extension:{issue:{key:"HTF-2"}}};let reads=0,writes=0,maxReads=0,maxWrites=0,nonce=0;
 const kvs={get:async(k,o)=>{reads++;assert.deepEqual(o.metadataFields,["EXPIRE_TIME"]);return map.has(k)?{key:k,value:structuredClone(map.get(k)),expireTime:new Date(clock()+86400000).toISOString()}:undefined},set:async(k,v,o)=>{writes++;assert.equal(o.keyPolicy,"FAIL_IF_EXISTS");assert.deepEqual(o.ttl,{unit:"DAYS",value:1});if(map.has(k))throw Error("conflict");map.set(k,structuredClone(v))}};
 const adapter={links:async()=>({ok:true,keys:[],complete:true}),read:async k=>({ok:true,snapshot:{objectId:"2",key:k,status:"Open",issueType:"Task"},source:{provider:"jira",objectId:"2",uri:"/browse/"+k,version:"2026-11-24T11:00:00Z",retrievedAt:new Date(clock()).toISOString(),visibility:"OBSERVED_AS_USER",contentHash:digest(k)}})};
 const preview=(c,i,saved)=>guardedPreview(c,i,{adapter,digest,clock,preview:previewTypedIntent,checkPlan:validatePlan,planDigest:p=>digest(canonical(p))},saved);
 const call=async(fn)=>{reads=0;writes=0;const deps={store:createDevelopmentStore(kvs,clock),clock,digest,preview,development:()=>true,nonce:()=>digest("nonce"+(++nonce))};const result=await fn(createReviewService(deps),createReportService(deps));maxReads=Math.max(maxReads,reads);maxWrites=Math.max(maxWrites,writes);assert.equal(result.ok,true,result.code);return result};
 const saved=await call(r=>r.save(ctx,"review release")),reviewId=saved.saved_review.review_id;
 const prepared=await call((r,s)=>s.prepare(ctx,reviewId)),id=prepared.request_id;
 await call((r,s)=>s.approve(ctx,id,id));const generated=await call((r,s)=>s.generate(ctx,id));assert.equal(generated.status,"READ_ONLY_REPORT_GENERATED");await call(r=>r.history(ctx,reviewId));await call(r=>r.recoverReport(ctx,reviewId));await call(r=>r.refresh(ctx,reviewId));
 assert.ok(maxReads<=64);assert.ok(maxWrites<=12);console.log("CG_P2_REPORT_STORAGE_PEAK:"+JSON.stringify({reads:maxReads,writes:maxWrites}));
});

test("P2 synthetic readiness reports precise safe setup reason without site identifiers",()=>{
 const cloud="12345678-1234-1234-1234-123456789abc",ctx={installContext:"ari:cloud:jira::site/"+cloud,extension:{issue:{key:"HTF-2"}}};
 assert.equal(syntheticReadiness(ctx,true,cloud),"READY_FOR_SYNTHETIC_REQUESTS");assert.equal(syntheticReadiness(ctx,false,cloud),"DEVELOPMENT_ENVIRONMENT_REQUIRED");assert.equal(syntheticReadiness(ctx,true,undefined),"DEMO_SITE_NOT_CONFIGURED");assert.equal(syntheticReadiness({...ctx,installContext:"foreign"},true,cloud),"DEMO_SITE_MISMATCH");assert.equal(syntheticReadiness({...ctx,extension:{issue:{key:"HTF-3"}}},true,cloud),"SYNTHETIC_ISSUE_REQUIRED");
});

test("report claim provenance resolves only current authorized sources",()=>{
 const a="a".repeat(64),b="b".repeat(64),hidden="c".repeat(64),e={sources:[{source_ref:a,uri:"/browse/DEMO-1"},{source_ref:b,uri:"/browse/DEMO-2"}]},c={subject:"REQ-1",predicate:"test.reported_result",values:["pass","fail"],status:"CONFLICT_FOUND",reason:"COMPARABLE_VALUES_DIFFER",source_refs:[a,b]};
 assert.deepEqual(reportClaimChecks(e,{checks:[c]}),[{subject:"REQ-1",predicate:c.predicate,values:c.values,status:c.status,reason:c.reason,source_uris:["/browse/DEMO-1","/browse/DEMO-2"]}]);
 for(const bad of [{...c,source_refs:[a,hidden]},{...c,source_refs:[]},{...c,source_refs:null},{...c,predicate:"jira.status",subject:hidden},{...c,predicate:"jira.status",subject:b,source_refs:[a]}])assert.equal(reportClaimChecks(e,{checks:[bad]}),null);
 assert.equal(reportClaimChecks({sources:[e.sources[0],e.sources[0]]},{checks:[c]}),null);
 assert.equal(reportClaimChecks(e,{checks:[{...c,predicate:"jira.status",subject:a,source_refs:[a]}]})[0].subject,"/browse/DEMO-1");
 assert.deepEqual(reportClaimChecks(e,{checks:[{...c,source_refs:[a,a,b]}]})[0].source_uris,["/browse/DEMO-1","/browse/DEMO-2"]);
});

test("daily exhaustion returns the next UTC midnight without allocating another slot",async()=>{
 const now=Date.parse("2026-11-25T23:59:59.000Z"),records=new Map(),kvs={get:async k=>records.get(k),set:async(k,v)=>{if(records.has(k))throw Error("duplicate");records.set(k,v)}};
 assert.equal((await reserveDailySlot(kvs,now,1)).ok,true);
 const result=await reserveDailySlot(kvs,now,1);
 assert.deepEqual(result,{ok:false,code:"DEVELOPMENT_DAILY_BUDGET_EXHAUSTED",retry_at:Date.parse("2026-11-26T00:00:00.000Z")});
 assert.equal(records.size,1);assert.equal((await reserveDailySlot(kvs,result.retry_at,1)).ok,true);assert.equal(records.size,2);
});

test("incident report includes the authorized ownership assessment and hashes the actual content",async()=>{
 const map=new Map(),clock=()=>Date.parse("2026-11-24T12:00:00Z"),ctx={accountId:"synthetic",installContext:"ari:cloud:jira::site/test-a",extension:{issue:{key:"DEMO-1"}}};
 const store={get:async k=>map.get(k),create:async(k,v)=>{if(map.has(k))throw Error("conflict");map.set(k,structuredClone(v))}};
 const {typedTags}=await import("../evidence/typed-claims.js");
 const tags=typedTags(["tf-req-DEMO-1","tf-owner-DEMO-1-OPS","tf-policy-DEMO-v1"]);
 const adapter={links:async()=>({ok:true,keys:[],complete:true}),read:async k=>({ok:true,snapshot:{objectId:"1",key:k,status:"Open",issueType:"Task",reportedTags:tags},source:{provider:"jira",objectId:"1",uri:"/browse/"+k,version:"2026-11-24T11:00:00Z",retrievedAt:new Date(clock()).toISOString(),visibility:"OBSERVED_AS_USER",contentHash:digest(k+JSON.stringify(tags))}})};
 const preview=(c,i,saved)=>guardedPreview(c,i,{adapter,digest,clock,preview:previewTypedIntent,checkPlan:validatePlan,planDigest:p=>digest(canonical(p))},saved);
 const deps={store,clock,digest,preview,development:()=>true,nonce:()=>digest("incident-nonce")},reviews=createReviewService(deps),reports=createReportService(deps);
 const saved=await reviews.save(ctx,"coordinate incident");assert.equal(saved.ok,true);const q=await reports.prepare(ctx,saved.saved_review.review_id);assert.equal(q.ok,true);assert.equal((await reports.approve(ctx,q.request_id,q.request_id)).ok,true);
 const generated=await reports.generate(ctx,q.request_id);assert.equal(generated.ok,true);assert.equal(generated.report.incident_assessment.status,"HUMAN_COORDINATION_REVIEW_REQUIRED");assert.deepEqual(generated.report.incident_assessment.ownership[0].teams,["OPS"]);assert.deepEqual(generated.report.incident_assessment.ownership[0].source_uris,["/browse/DEMO-1"]);assert.equal(generated.report_digest,digest(canonical(generated.report)));assert.equal(generated.execution,"NO_JIRA_MUTATION");
});

import {loadProjectDashboard,projectScope} from "../dashboard/project-dashboard.js";
import {projectDashboard} from "../dashboard/forge-project.js";
test("project dashboard is current-actor synthetic only and filters inaccessible or expired snapshots",async()=>{
 const now=Date.parse("2026-11-24T12:00:00Z"),clock=()=>now,cloud="00000000-0000-4000-8000-000000000001",context={accountId:"actor",installContext:"ari:cloud:jira::site/"+cloud,extension:{type:"jira:projectPage",project:{id:"10001",key:"HTF"}}};
 const scope=projectScope(context,true,cloud,digest),p=scope.p,map=new Map(),store={get:async k=>map.get(k),create:async(k,v)=>{if(map.has(k))throw Error("conflict");map.set(k,structuredClone(v))}};
 let version="2026-11-24T11:00:00Z";
 const adapter={links:async()=>({ok:true,keys:[],complete:true}),read:async k=>({ok:true,snapshot:{objectId:"2",key:k,status:"Open",issueType:"Task"},source:{provider:"jira",objectId:"2",uri:"/browse/"+k,version,retrievedAt:new Date(now).toISOString(),visibility:"OBSERVED_AS_USER",contentHash:digest(k+version)}})};
 const preview=(c,intent,saved)=>guardedPreview(c,intent,{adapter,digest,clock,preview:previewTypedIntent,checkPlan:validatePlan,planDigest:p=>digest(canonical(p))},saved);
 const saved=await createReviewService({store,clock,digest,preview,development:()=>true}).save(scope.issueContext,"review change");assert.equal(saved.ok,true);
 const prefix="cg:review:"+p.tenant+":"+p.actor+":",id=saved.saved_review.review_id,k=prefix+id+":snapshot",record=map.get(k);
 let admitted=0,queries=0,reads=0,page={results:[{key:k,value:record,expireTime:new Date(now+86400000).toISOString()}]};
 const deps={development:true,cloudId:cloud,digest,clock,admit:async()=>{admitted++;return {ok:true}},readProjectIssue:async()=>({key:"HTF-2",id:"2",project_id:"10001",project_key:"HTF"}),readEvidence:async c=>{reads++;return {ok:true,snapshot:{objectId:"2"},evidence:(await preview(c,"review change")).evidence}},readStored:store.get,queryReviews:async (pr,limit)=>{queries++;assert.equal(pr,prefix);assert.equal(limit,12);return page}};
 let result=await loadProjectDashboard(context,deps);assert.equal(result.ok,true);assert.equal(result.rows[0].review_id,id);assert.equal(result.rows[0].comparison,"CURRENT_OBSERVED");assert.equal(result.rows[0].journal_state,"POLICY_REVIEW");assert.equal(result.rows[0].comment_state,"NO_COMMENT_ATTEMPT");assert.equal(result.rows[0].invalidation,"NO_MARKER_OBSERVED");assert.equal(result.authorization,"NONE");assert.equal(result.execution,"NO_JIRA_MUTATION");assert.equal(JSON.stringify(result).includes(p.actor),false);
 for(const c of [{...context,extension:{type:"jira:projectPage",project:{id:"10001",key:"OTHER"}}},{...context,accountType:"anonymous"},{...context,installContext:"ari:cloud:jira::site/other"}])assert.equal((await loadProjectDashboard(c,deps)).ok,false);
 assert.equal((await loadProjectDashboard(context,{...deps,development:false})).ok,false);assert.equal(admitted,1);assert.equal(queries,1);
 assert.equal((await loadProjectDashboard(context,{...deps,readProjectIssue:async()=>({key:"HTF-2",id:"2",project_id:"999",project_key:"HTF"})})).ok,false);assert.equal(reads,1);
 version="2026-11-24T11:05:00Z";result=await loadProjectDashboard(context,deps);assert.equal(result.rows[0].comparison,"STALE_VERSION");
 page={results:[{key:k,value:record,expireTime:new Date(now-1).toISOString()}]};result=await loadProjectDashboard(context,deps);assert.equal(result.rows.length,0);assert.equal(result.withheld_count,1);
 page={results:[{key:"cg:review:other:other:"+id+":snapshot",value:record,expireTime:new Date(now+86400000).toISOString()}]};assert.equal((await loadProjectDashboard(context,deps)).ok,false);
 page={results:[{key:k,value:record,expireTime:new Date(now+86400000).toISOString()}]};assert.equal((await loadProjectDashboard(context,{...deps,readEvidence:async()=>({ok:false})})).ok,false);
 const exhausted={ok:false,code:"DEVELOPMENT_DAILY_BUDGET_EXHAUSTED",retry_at:now+86400000};assert.deepEqual(await loadProjectDashboard(context,{...deps,admit:async()=>exhausted}),exhausted);
 assert.equal(map.size,4);const invalidation=await createReviewService({store,clock,digest,preview,development:()=>true}).refresh(scope.issueContext,id);assert.equal(invalidation.persisted_invalidation,true);result=await loadProjectDashboard(context,deps);assert.equal(result.rows[0].invalidation,"PERSISTED_INVALIDATION");assert.equal(result.rows[0].journal_state,"POLICY_REVIEW");
 const badMarker=map.get(prefix+id+":invalidated");badMarker.marker_digest="bad";result=await loadProjectDashboard(context,deps);assert.equal(result.rows[0].journal_state,"NOT_ESTABLISHED");assert.equal(result.rows[0].invalidation,"NOT_ESTABLISHED");
 const original=map.get(k);map.delete(k);result=await loadProjectDashboard(context,deps);assert.equal(result.rows.length,0);map.set(k,original);assert.equal((await projectDashboard({})).ok,false);
});

test("dashboard verifies historical report receipts within bounded point reads and rejects corruption",async()=>{
 const now=Date.parse("2026-11-24T12:00:00Z"),clock=()=>now,cloud="00000000-0000-4000-8000-000000000001",context={accountId:"actor",installContext:"ari:cloud:jira::site/"+cloud,extension:{type:"jira:projectPage",project:{id:"10001",key:"HTF"}}};
 const {p,issueContext}=projectScope(context,true,cloud,digest),map=new Map(),store={get:async k=>map.get(k),create:async(k,v)=>{if(map.has(k))throw Error("conflict");map.set(k,structuredClone(v))}};
 const adapter={links:async()=>({ok:true,keys:[],complete:true}),read:async k=>({ok:true,snapshot:{objectId:"2",key:k,status:"Open",issueType:"Task"},source:{provider:"jira",objectId:"2",uri:"/browse/"+k,version:"2026-11-24T11:00:00Z",retrievedAt:new Date(now).toISOString(),visibility:"OBSERVED_AS_USER",contentHash:digest(k)}})};
 const preview=(c,intent,saved)=>guardedPreview(c,intent,{adapter,digest,clock,preview:previewTypedIntent,checkPlan:validatePlan,planDigest:p=>digest(canonical(p))},saved);
 const deps={store,clock,digest,preview,development:()=>true,nonce:()=>digest("project-report")},reviews=createReviewService(deps),reports=createReportService(deps);
 const saved=await reviews.save(issueContext,"review release"),id=saved.saved_review.review_id,q=await reports.prepare(issueContext,id);assert.equal((await reports.approve(issueContext,q.request_id,q.request_id)).ok,true);assert.equal((await reports.generate(issueContext,q.request_id)).ok,true);
 const key="cg:review:"+p.tenant+":"+p.actor+":"+id+":snapshot",page={results:[{key,value:map.get(key),expireTime:new Date(now+86400000).toISOString()}]};
 let reads=0;const input={development:true,cloudId:cloud,digest,clock,admit:async()=>({ok:true}),readProjectIssue:async()=>({key:"HTF-2",id:"2",project_id:"10001",project_key:"HTF"}),readEvidence:async c=>({ok:true,snapshot:{objectId:"2"},evidence:(await preview(c,"review release")).evidence}),readStored:async k=>{reads++;return store.get(k)},queryReviews:async()=>page};
 const size=map.size;let result=await loadProjectDashboard(context,input);assert.equal(result.rows[0].journal_state,"REPORT_RECEIPT_VERIFIED");assert.equal(result.rows[0].comment_state,"NO_COMMENT_ATTEMPT");assert.ok(reads<=17);assert.equal(map.size,size);
 const receipt=[...map.values()].find(v=>v.schema_version==="hae.report.receipt.v2");receipt.report_digest="bad";reads=0;result=await loadProjectDashboard(context,input);assert.equal(result.rows[0].journal_state,"NOT_ESTABLISHED");assert.ok(reads<=17);assert.equal(map.size,size);
});
