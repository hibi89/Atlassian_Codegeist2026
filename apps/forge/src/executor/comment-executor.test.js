import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {typedTags} from "../evidence/typed-claims.js";
import {guardedPreview} from "../security/policy.js";
import {previewTypedIntent} from "../core/ir/preview.js";
import {canonical,validatePlan} from "../core/ir/plan.js";
import {createReviewService} from "../state/review-service.js";
import {readCommentJournal} from "../state/comment-journal.js";
import {principal} from "../evidence/bundle.js";
import {createCommentExecutor} from "./comment-executor.js";
import {createCommentService} from "../security/approval/comment-service.js";
import {createDevelopmentStore} from "../state/forge-review.js";
const digest=s=>createHash("sha256").update(s).digest("hex");
function fixture(labels=["tf-req-DEMO-1","tf-test-DEMO-1-pass","tf-policy-DEMO-v1","tf-owner-DEMO-1-OPS"],linkedLabels=null,canDispatch=()=>true,cloudId="demo"){
 const map=new Map(),ctx={accountId:"synthetic",installContext:"ari:cloud:jira::site/"+cloudId,extension:{issue:{key:"HTF-2"}}};
 let now=Date.parse("2026-11-24T12:00:00Z"),version="2026-11-24T11:00:00Z",allowed=true,add=true,posts=0,counter=0,mode="ok",reads=0,changeAt=Infinity;
 const clock=()=>now;
 const store={get:async k=>map.get(k),create:async(k,v)=>{if(map.has(k))throw Error("conflict");map.set(k,JSON.parse(JSON.stringify(v)))}};
 const adapter={links:async()=>({ok:true,keys:linkedLabels===null?[]:["HTF-3"],complete:true}),read:async k=>{if(++reads===changeAt)version="2026-11-24T11:05:00Z";const root=k==="HTF-2",v=root?version:"2026-11-24T11:00:00Z",tags=root?labels:linkedLabels,objectId=root?"2":"3";return {ok:true,snapshot:{objectId,key:k,status:"Open",issueType:"Task",reportedTags:typedTags(tags)},source:{provider:"jira",objectId,uri:"/browse/"+k,version:v,retrievedAt:new Date(clock()).toISOString(),visibility:"OBSERVED_AS_USER",contentHash:digest(k+v+JSON.stringify(tags))}}}};
 const preview=(c,i,saved)=>guardedPreview(c,i,{adapter,digest,clock,preview:previewTypedIntent,checkPlan:validatePlan,planDigest:p=>digest(canonical(p))},saved);
 let comments=[];
 const transport={permissions:async()=>({browse:true,add}),post:async(key,body)=>{posts++;if(mode==="reject")return {status:403};if(mode==="lost")throw Error("timeout");comments.push({id:String(posts),author:{accountId:ctx.accountId},body});if(mode==="wrong-id"||mode==="wrong-id-network"){comments[comments.length-1].id="999";return {status:201,id:"1"}};if(mode==="marked"){comments[comments.length-1].body.content[0].content[0].marks=[{type:"strong"}]};if(mode==="timeout")throw Error("timeout after effect");return {status:201,id:String(posts)}},get:async(key,id)=>{if(mode==="wrong-id-network")throw Error("read timeout");return {status:200,comment:comments.find(c=>c.id===id)}},recent:async()=>({status:200,comments:mode==="hidden"?[]:comments})};
 const deps={store,clock,digest,preview,development:()=>true,nonce:()=>digest("nonce"+(++counter)),allowedInstall:()=>allowed,transport,canDispatch};
 const reviews=createReviewService(deps),writes=createCommentService(deps);
 async function request(intent="review change"){const saved=await reviews.save(ctx,intent);assert.equal(saved.ok,true);return writes.prepare(ctx,saved.saved_review.review_id)}
 async function approved(){const r=await request();assert.equal(r.ok,true);assert.equal((await writes.approve(ctx,r.request_id,r.request_id)).ok,true);return r.request_id}
 return {ctx,map,store,reviews,writes,request,approved,preview,deps,posts:()=>posts,setNow:t=>{now=t},advance:ms=>{now+=ms},change:()=>{version="2026-11-24T11:05:00Z"},restore:()=>{version="2026-11-24T11:00:00Z"},deny:()=>{add=false},allow:()=>{add=true},unconfigure:()=>{allowed=false},expire:()=>{now+=121000},setMode:m=>{mode=m},changeOnFinal:()=>{changeAt=reads+3}};
}
test("actual comment service only dispatches exact approved synthetic annotation once",async()=>{
 const f=fixture(),r=await f.request();assert.equal(r.ok,true);assert.match(r.comment,/not a certification/);
 assert.equal((await f.writes.execute(f.ctx,r.request_id)).ok,false);
 assert.equal((await f.writes.approve(f.ctx,r.request_id,true)).ok,false);
 assert.equal((await f.writes.approve({...f.ctx,accountId:"other"},r.request_id,r.request_id)).ok,false);
 assert.equal((await f.writes.approve(f.ctx,r.request_id,r.request_id)).ok,true);
 const pair=await Promise.all([f.writes.execute(f.ctx,r.request_id),f.writes.execute(f.ctx,r.request_id)]);
 assert.equal(pair.filter(x=>x.ok).length,1);assert.equal(f.posts(),1);assert.equal(pair.find(x=>x.ok).comment_id,"1");assert.equal(pair.find(x=>x.ok).lineage.nodes.length,5);assert.equal(pair.find(x=>x.ok).lineage.edges.length,5);assert.match(pair.find(x=>x.ok).observation_digest,/^[a-f0-9]{64}$/);
 assert.equal((await f.writes.reconcile(f.ctx,r.request_id)).status,"OBSERVED_SUCCESS");assert.equal(f.posts(),1);
 const journal=await readCommentJournal(f.store,principal(f.ctx,digest),r.review_id);assert.equal(journal.status,"HISTORICAL_OBSERVED_SUCCESS");assert.equal(journal.request_id,r.request_id);const history=await f.reviews.history(f.ctx,r.review_id);assert.equal(history.ok,true);assert.deepEqual(history.run_timeline.map(e=>e.state),["DRAFT","EVIDENCE_PENDING","POLICY_REVIEW"]);assert.equal(history.comment_journal.status,"HISTORICAL_OBSERVED_SUCCESS");assert.equal(history.comment_journal.request_id,r.request_id);assert.ok(history.nodes.some(n=>n.kind==="RECEIPT"));assert.equal((await f.reviews.history({...f.ctx,accountId:"other"},r.review_id)).ok,false);
});
test("stale, reverted, revoked, expired, wrong target and denied permission never POST",async()=>{
 const f=fixture(),id=await f.approved();f.change();assert.equal((await f.writes.execute(f.ctx,id)).ok,false);f.restore();assert.equal((await f.writes.execute(f.ctx,id)).ok,false);assert.equal(f.posts(),0);
 const g=fixture(),gid=await g.approved();assert.equal((await g.writes.revoke(g.ctx,gid)).ok,true);assert.equal((await g.writes.execute(g.ctx,gid)).ok,false);assert.equal(g.posts(),0);
 const h=fixture(),hid=await h.approved();h.expire();assert.equal((await h.writes.execute(h.ctx,hid)).ok,false);assert.equal(h.posts(),0);
 const j=fixture(),jid=await j.approved();j.deny();assert.equal((await j.writes.execute(j.ctx,jid)).ok,false);j.allow();assert.equal((await j.writes.execute(j.ctx,jid)).ok,false);assert.equal(j.posts(),0);
 const k=fixture(),kid=await k.approved();assert.equal((await k.writes.execute({...k.ctx,extension:{issue:{key:"HTF-3"}}},kid)).ok,false);k.unconfigure();assert.equal((await k.writes.execute(k.ctx,kid)).ok,false);assert.equal(k.posts(),0);
 const l=fixture();assert.equal((await l.request("review release")).ok,false);assert.equal(l.posts(),0);
});
test("source change at final interlock blocks actual writer even after approval consumption",async()=>{
 const f=fixture(),id=await f.approved();f.changeOnFinal();const result=await f.writes.execute(f.ctx,id);assert.equal(result.status,"BLOCKED_BEFORE_DISPATCH");assert.equal(f.posts(),0);f.restore();assert.equal((await f.writes.execute(f.ctx,id)).ok,false);
});
test("timeout reconciliation uses observed comment, no duplicate or blind retry",async()=>{
 const f=fixture(),id=await f.approved();f.setMode("timeout");const r=await f.writes.execute(f.ctx,id);assert.equal(r.status,"OBSERVED_SUCCESS");assert.equal(f.posts(),1);
 const g=fixture(),gid=await g.approved();g.setMode("lost");assert.equal((await g.writes.execute(g.ctx,gid)).status,"UNKNOWN_OUTCOME_REVIEW");assert.equal((await g.writes.execute(g.ctx,gid)).ok,false);assert.equal((await g.writes.reconcile(g.ctx,gid)).status,"UNKNOWN_OUTCOME_REVIEW");assert.equal(g.posts(),1);
 const h=fixture(),hid=await h.approved();h.setMode("reject");assert.equal((await h.writes.execute(h.ctx,hid)).status,"DEFINITE_REJECTION");assert.equal(h.posts(),1);
});

test("critical reported evidence gaps deny writes and incident ownership is required",async()=>{
 const f=fixture([]);assert.equal((await f.request()).code,"WRITE_CRITICAL_EVIDENCE_MISSING");assert.equal(f.posts(),0);
 const g=fixture(["tf-req-DEMO-1","tf-test-DEMO-2-pass","tf-policy-DEMO-v1"]);assert.equal((await g.request()).code,"WRITE_REQUIREMENT_TEST_LINK_MISSING");assert.equal(g.posts(),0);
 const h=fixture(["tf-req-DEMO-1","tf-test-DEMO-1-pass","tf-policy-DEMO-v1"]);assert.equal((await h.request("coordinate incident")).code,"WRITE_CRITICAL_EVIDENCE_MISSING");assert.equal(h.posts(),0);
 const j=fixture();assert.equal((await j.request("coordinate incident")).ok,true);
});

test("full change journey denies stale approval, creates new draft, preserves unrelated checks and writes once",async()=>{
 const f=fixture(undefined,["tf-req-OTHER-1","tf-test-OTHER-1-pass"]);
 const old=await f.request();assert.equal(old.ok,true);
 assert.equal((await f.writes.approve(f.ctx,old.request_id,old.request_id)).ok,true);
 f.change();
 assert.equal((await f.writes.execute(f.ctx,old.request_id)).ok,false);assert.equal(f.posts(),0);
 const replacement=await f.reviews.revalidate(f.ctx,old.review_id);
 assert.equal(replacement.ok,true);assert.notEqual(replacement.saved_review.review_id,old.review_id);
 assert.ok(replacement.revalidation.reused>0);assert.ok(replacement.revalidation.recomputed>0);
 const next=await f.writes.prepare(f.ctx,replacement.saved_review.review_id);assert.equal(next.ok,true);
 assert.equal((await f.writes.execute(f.ctx,next.request_id)).ok,false);assert.equal(f.posts(),0);
 assert.equal((await f.writes.approve(f.ctx,next.request_id,next.request_id)).ok,true);
 const observed=await f.writes.execute(f.ctx,next.request_id);assert.equal(observed.status,"OBSERVED_SUCCESS");assert.equal(f.posts(),1);
 assert.equal((await f.writes.execute(f.ctx,old.request_id)).ok,false);assert.equal(f.posts(),1);
 assert.equal((await f.reviews.history(f.ctx,old.review_id)).status,"HISTORICAL_STALE");
 assert.ok((await f.reviews.history(f.ctx,next.review_id)).nodes.some(n=>n.kind==="RECEIPT"));
});
test("incident linked ownership conflict is cited and denies save/action",async()=>{
 const f=fixture(undefined,["tf-owner-DEMO-1-SEC"]);
 const result=await f.preview(f.ctx,"coordinate incident");
 assert.equal(result.policy.decision,"REVIEW");
 const conflict=result.claim_review.checks.find(c=>c.predicate==="ownership.reported_team");
 assert.equal(conflict.status,"CONFLICT_FOUND");assert.equal(conflict.source_refs.length,2);
 assert.equal((await f.reviews.save(f.ctx,"coordinate incident")).ok,false);assert.equal(f.posts(),0);
 const g=fixture(undefined,["tf-owner-DEMO-1-OPS"]);
 const prepared=await g.request("coordinate incident");assert.equal(prepared.ok,true);
 assert.equal((await g.writes.approve(g.ctx,prepared.request_id,prepared.request_id)).ok,true);
 assert.equal((await g.writes.execute(g.ctx,prepared.request_id)).status,"OBSERVED_SUCCESS");assert.equal(g.posts(),1);
});

test("P2 direct writer cannot bypass persisted approval; malformed receipt and unexpected body stay unknown",async()=>{
 const f=fixture(),r=await f.request(),plan=[...f.map.values()].find(x=>x?.schema_version==="hae.forge.comment-plan.v1");
 const p=principal(f.ctx,digest);let directPosts=0;
 const ex=createCommentExecutor({store:f.store,p,clock:()=>Date.parse("2026-11-24T12:00:00Z"),digest,accountId:f.ctx.accountId,transport:{post:async()=>{directPosts++;return {status:201}}}});
 assert.equal((await ex.dispatch(plan,r.request_id,async()=>({ok:true,plan_hash:r.request_id}))).ok,false);assert.equal(directPosts,0);
 assert.equal((await f.writes.approve(f.ctx,r.request_id,r.request_id)).ok,true);
 assert.equal((await ex.dispatch(plan,r.request_id,async()=>({ok:true,plan_hash:r.request_id}))).ok,false);assert.equal(directPosts,0);
 f.setMode("marked");assert.equal((await f.writes.execute(f.ctx,r.request_id)).status,"UNKNOWN_OUTCOME_REVIEW");assert.equal(f.posts(),1);
 assert.equal((await f.writes.reconcile(f.ctx,r.request_id)).status,"UNKNOWN_OUTCOME_REVIEW");assert.equal(f.posts(),1);
 const g=fixture(),q=await g.request();await g.writes.approve(g.ctx,q.request_id,q.request_id);assert.equal((await g.writes.execute(g.ctx,q.request_id)).ok,true);
 const outcome=[...g.map.values()].find(x=>x?.schema_version==="hae.comment.receipt.v1");outcome.observation_digest="corrupt";
 assert.equal((await readCommentJournal(g.store,principal(g.ctx,digest),q.review_id)).status,"JOURNAL_UNKNOWN");
});

test("P2 durable dispatch latch acknowledgement lost: no POST and no replay",async()=>{
 const f=fixture(),id=await f.approved(),create=f.store.create;
 f.store.create=async(k,v)=>{await create(k,v);if(k.endsWith(":dispatch"))throw Error("synthetic acknowledgement lost")};
 const r=await f.writes.execute(f.ctx,id);assert.equal(r.status,"UNKNOWN_OUTCOME_REVIEW");assert.equal(f.posts(),0);
 f.store.create=create;assert.equal((await f.writes.execute(f.ctx,id)).ok,false);assert.equal((await f.writes.reconcile(f.ctx,id)).status,"UNKNOWN_OUTCOME_REVIEW");assert.equal(f.posts(),0);
});
test("P2 effect observed but receipt acknowledgement lost: read-only reconciliation recovers without POST retry",async()=>{
 const f=fixture(),id=await f.approved(),create=f.store.create;
 f.store.create=async(k,v)=>{await create(k,v);if(k.endsWith(":outcome"))throw Error("synthetic acknowledgement lost")};
 const r=await f.writes.execute(f.ctx,id);assert.equal(r.status,"UNKNOWN_OUTCOME_REVIEW");assert.equal(f.posts(),1);
 f.store.create=create;assert.equal((await f.writes.execute(f.ctx,id)).ok,false);const recovered=await f.writes.reconcile(f.ctx,id);assert.equal(recovered.status,"OBSERVED_SUCCESS");assert.equal(f.posts(),1);
});
test("P2 effect observed but receipt write rejected: read-only reconciliation reconstructs observation",async()=>{
 const f=fixture(),id=await f.approved(),create=f.store.create;
 f.store.create=async(k,v)=>{if(k.endsWith(":outcome"))throw Error("synthetic storage unavailable");await create(k,v)};
 const r=await f.writes.execute(f.ctx,id);assert.equal(r.status,"UNKNOWN_OUTCOME_REVIEW");assert.equal(f.posts(),1);
 f.store.create=create;assert.equal((await f.writes.reconcile(f.ctx,id)).status,"OBSERVED_SUCCESS");assert.equal((await f.writes.execute(f.ctx,id)).ok,false);assert.equal(f.posts(),1);
});

test("P2 insufficient invocation time before approval consumption or after final interlock blocks POST",async()=>{
 const f=fixture(undefined,null,()=>false),id=await f.approved();
 assert.equal((await f.writes.execute(f.ctx,id)).code,"WRITE_INVOCATION_TIME_BUDGET");assert.equal(f.posts(),0);
 let checks=0;const g=fixture(undefined,null,()=>++checks<2),gid=await g.approved();
 const r=await g.writes.execute(g.ctx,gid);assert.equal(r.status,"BLOCKED_BEFORE_DISPATCH");assert.equal(r.code,"WRITE_INVOCATION_TIME_BUDGET");assert.equal(g.posts(),0);
 let afterLatch=0;const h=fixture(undefined,null,()=>++afterLatch<3),hid=await h.approved();
 const result=await h.writes.execute(h.ctx,hid);assert.equal(result.status,"BLOCKED_BEFORE_DISPATCH");assert.equal(result.code,"WRITE_INVOCATION_TIME_BUDGET");assert.equal(h.posts(),0);
 assert.equal((await h.writes.reconcile(h.ctx,hid)).status,"BLOCKED_BEFORE_DISPATCH");
});

test("P2 known comment ID cannot be replaced by another matching comment",async()=>{
 const f=fixture(),id=await f.approved();f.setMode("wrong-id");
 assert.equal((await f.writes.execute(f.ctx,id)).status,"UNKNOWN_OUTCOME_REVIEW");
 assert.equal((await f.writes.reconcile(f.ctx,id)).status,"UNKNOWN_OUTCOME_REVIEW");assert.equal(f.posts(),1);
});
test("P2 corrupted historical comment graph is denied even with valid-looking digests",async()=>{
 const f=fixture(),r=await f.request();await f.writes.approve(f.ctx,r.request_id,r.request_id);assert.equal((await f.writes.execute(f.ctx,r.request_id)).ok,true);
 const rec=[...f.map.values()].find(x=>x.schema_version==="hae.comment.receipt.v1");assert.ok(rec);
 assert.equal((await f.reviews.history(f.ctx,r.review_id)).ok,true);
 const edge=rec.lineage.edges[0],old=edge.relation;edge.relation="FORGED";
 assert.equal((await f.reviews.history(f.ctx,r.review_id)).ok,false);edge.relation=old;
 rec.observation_digest="f".repeat(64);assert.equal((await f.reviews.history(f.ctx,r.review_id)).ok,false);
});

test("P2 known response ID survives readback transport failure and reconciliation cannot substitute",async()=>{
 const f=fixture(),id=await f.approved();f.setMode("wrong-id-network");
 assert.equal((await f.writes.execute(f.ctx,id)).status,"UNKNOWN_OUTCOME_REVIEW");
 const receipt=[...f.map.values()].find(x=>x.schema_version==="hae.comment.receipt.v1");assert.equal(receipt.known_comment_id,"1");
 f.setMode("ok");assert.equal((await f.writes.reconcile(f.ctx,id)).status,"UNKNOWN_OUTCOME_REVIEW");assert.equal(f.posts(),1);
});

test("P2 remote ID remains bound when final outcome write is rejected",async()=>{
 const f=fixture(),id=await f.approved(),create=f.store.create;f.setMode("wrong-id");
 f.store.create=async(k,v)=>{if(k.endsWith(":outcome"))throw Error("receipt unavailable");await create(k,v)};
 assert.equal((await f.writes.execute(f.ctx,id)).status,"UNKNOWN_OUTCOME_REVIEW");assert.equal(f.posts(),1);
 f.store.create=create;assert.equal((await f.writes.reconcile(f.ctx,id)).status,"UNKNOWN_OUTCOME_REVIEW");assert.equal(f.posts(),1);
 const remote=[...f.map.values()].find(x=>x.schema_version==="hae.comment.remote-id.v1");assert.equal(remote.comment_id,"1");
});
test("P2 remote ID storage acknowledgement lost is recovered by exact record comparison",async()=>{
 const f=fixture(),id=await f.approved(),create=f.store.create;
 f.store.create=async(k,v)=>{await create(k,v);if(k.endsWith(":remote-id"))throw Error("lost acknowledgement")};
 assert.equal((await f.writes.execute(f.ctx,id)).status,"OBSERVED_SUCCESS");assert.equal(f.posts(),1);
 f.store.create=create;assert.equal((await f.writes.reconcile(f.ctx,id)).status,"OBSERVED_SUCCESS");assert.equal(f.posts(),1);
});


test("P2 comment UTC rollover after dispatch latch blocks POST without retry",async()=>{
 const f=fixture();f.setNow(Date.parse("2026-11-24T23:59:59.900Z"));const id=await f.approved(),create=f.store.create;
 f.store.create=async(k,v)=>{await create(k,v);if(k.endsWith(":dispatch"))f.advance(200)};
 const r=await f.writes.execute(f.ctx,id);assert.equal(r.status,"BLOCKED_BEFORE_DISPATCH");assert.equal(r.code,"DEMO_WRITE_DAY_CHANGED");assert.equal(f.posts(),0);assert.equal((await f.writes.reconcile(f.ctx,id)).status,"BLOCKED_BEFORE_DISPATCH");assert.equal((await f.writes.execute(f.ctx,id)).ok,false);assert.equal(f.posts(),0);
});
test("P2 approval expiration while persisting dispatch latch blocks POST",async()=>{
 const f=fixture(),id=await f.approved(),create=f.store.create;
 const approval=[...f.map.values()].find(x=>x.schema_version==="hae.approval.v2");approval.expires_at=approval.created_at+100;
 f.store.create=async(k,v)=>{await create(k,v);if(k.endsWith(":dispatch"))f.advance(101)};
 const r=await f.writes.execute(f.ctx,id);assert.equal(r.status,"BLOCKED_BEFORE_DISPATCH");assert.equal(r.code,"WRITE_EXPIRED_AT_DISPATCH");assert.equal(f.posts(),0);
});


test("P2 prior reconciliation fixes remote identity even when recent window no longer contains the comment",async()=>{
 const f=fixture(),id=await f.approved(),create=f.store.create;f.setMode("timeout");
 f.store.create=async(k,v)=>{if(k.endsWith(":outcome"))throw Error("receipt unavailable");await create(k,v)};
 assert.equal((await f.writes.execute(f.ctx,id)).status,"UNKNOWN_OUTCOME_REVIEW");assert.equal(f.posts(),1);
 f.store.create=create;const first=await f.writes.reconcile(f.ctx,id);assert.equal(first.status,"OBSERVED_SUCCESS");assert.equal(first.comment_id,"1");
 assert.equal([...f.map.keys()].some(k=>k.endsWith(":remote-id")),false);
 f.setMode("hidden");const second=await f.writes.reconcile(f.ctx,id);assert.equal(second.status,"OBSERVED_SUCCESS");assert.equal(second.comment_id,"1");assert.equal(f.posts(),1);
});
test("P2 malformed or conflicting reconciliation identity cannot produce an observed success",async()=>{
 const f=fixture(),r=await f.request();await f.writes.approve(f.ctx,r.request_id,r.request_id);
 f.setMode("timeout");assert.equal((await f.writes.execute(f.ctx,r.request_id)).ok,true);assert.equal((await f.writes.reconcile(f.ctx,r.request_id)).ok,true);
 const prior=[...f.map.values()].find(x=>x.schema_version==="hae.comment.reconciliation.v1"),outcome=[...f.map.values()].find(x=>x.schema_version==="hae.comment.receipt.v1");
 prior.observation_digest="f".repeat(64);assert.equal((await f.writes.reconcile(f.ctx,r.request_id)).code,"RECONCILIATION_RECORD_INVALID");prior.observation_digest=outcome.observation_digest;
 outcome.known_comment_id="999";assert.equal((await f.writes.reconcile(f.ctx,r.request_id)).code,"OUTCOME_RECORD_INVALID");assert.equal((await readCommentJournal(f.store,principal(f.ctx,digest),r.review_id)).status,"JOURNAL_UNKNOWN");assert.equal(f.posts(),1);
});

test("P2 historical success requires exact attempt reservation and durable dispatch evidence",async()=>{
 const f=fixture(),r=await f.request();await f.writes.approve(f.ctx,r.request_id,r.request_id);assert.equal((await f.writes.execute(f.ctx,r.request_id)).ok,true);
 const p=principal(f.ctx,digest),reservationKey=[...f.map.keys()].find(k=>k.startsWith("cg:comment-review:")),dispatchKey=[...f.map.keys()].find(k=>k.endsWith(":dispatch")),dispatch=f.map.get(dispatchKey);
 assert.equal((await readCommentJournal(f.store,p,r.review_id)).status,"HISTORICAL_OBSERVED_SUCCESS");
 f.map.delete(dispatchKey);assert.equal((await readCommentJournal(f.store,p,r.review_id)).status,"JOURNAL_UNKNOWN");assert.equal((await f.reviews.history(f.ctx,r.review_id)).ok,false);assert.equal((await f.writes.reconcile(f.ctx,r.request_id)).status,"UNKNOWN_OUTCOME_REVIEW");
 f.map.set(dispatchKey,dispatch);f.map.get(reservationKey).at+=1;assert.equal((await f.writes.reconcile(f.ctx,r.request_id)).code,"WRITE_ATTEMPT_RESERVATION_INVALID");assert.equal((await readCommentJournal(f.store,p,r.review_id)).status,"JOURNAL_UNKNOWN");assert.equal(f.posts(),1);
});

 test("P2 preparing another comment for an attempted review returns original recovery reference without a new draft",async()=>{
 const f=fixture(),r=await f.request();await f.writes.approve(f.ctx,r.request_id,r.request_id);f.setMode("lost");assert.equal((await f.writes.execute(f.ctx,r.request_id)).status,"UNKNOWN_OUTCOME_REVIEW");
 const count=()=>[...f.map.values()].filter(v=>v.schema_version==="hae.forge.comment-plan.v1").length;assert.equal(count(),1);
 const again=await f.writes.prepare(f.ctx,r.review_id);assert.equal(again.ok,false);assert.equal(again.status,"UNKNOWN_OUTCOME_REVIEW");assert.equal(again.request_id,r.request_id);assert.equal(count(),1);assert.equal(f.posts(),1);
 const refreshed=await f.reviews.refresh(f.ctx,r.review_id);assert.equal(refreshed.comment_journal.request_id,r.request_id);assert.equal(refreshed.comment_journal.status,"UNKNOWN_OUTCOME_REVIEW");
 });

test("P2 guarded comment and recovery fit the production storage adapter budget per invocation",async()=>{
 const f=fixture();let reads=0,writes=0,maxReads=0,maxWrites=0;
 const kvs={get:async(k,o)=>{reads++;assert.deepEqual(o.metadataFields,["EXPIRE_TIME"]);return f.map.has(k)?{key:k,value:structuredClone(f.map.get(k)),expireTime:new Date(f.deps.clock()+86400000).toISOString()}:undefined},set:async(k,v,o)=>{writes++;assert.equal(o.keyPolicy,"FAIL_IF_EXISTS");assert.deepEqual(o.ttl,{unit:"DAYS",value:1});if(f.map.has(k))throw Error("conflict");f.map.set(k,structuredClone(v))}};
 const call=async(fn)=>{reads=0;writes=0;const deps={...f.deps,store:createDevelopmentStore(kvs,f.deps.clock)};const result=await fn(createReviewService(deps),createCommentService(deps));maxReads=Math.max(maxReads,reads);maxWrites=Math.max(maxWrites,writes);assert.equal(result.ok,true,result.code);return result};
 const saved=await call(r=>r.save(f.ctx,"review change")),reviewId=saved.saved_review.review_id;const prepared=await call((r,s)=>s.prepare(f.ctx,reviewId)),id=prepared.request_id;
 await call((r,s)=>s.approve(f.ctx,id,id));const observed=await call((r,s)=>s.execute(f.ctx,id));assert.equal(observed.status,"OBSERVED_SUCCESS");await call((r,s)=>s.reconcile(f.ctx,id));await call(r=>r.history(f.ctx,reviewId));await call(r=>r.refresh(f.ctx,reviewId));
 assert.equal(f.posts(),1);assert.ok(maxReads<=64);assert.ok(maxWrites<=12);console.log("CG_P2_COMMENT_STORAGE_PEAK:"+JSON.stringify({reads:maxReads,writes:maxWrites}));
});

test("P2 receipt chronology and conflicting remote identity cannot imply historical success or no effect",async()=>{
 const f=fixture(),q=await f.request();await f.writes.approve(f.ctx,q.request_id,q.request_id);assert.equal((await f.writes.execute(f.ctx,q.request_id)).ok,true);
 const p=principal(f.ctx,digest),receipt=[...f.map.values()].find(v=>v.schema_version==="hae.comment.receipt.v1"),original=structuredClone(receipt);
 for(const patch of [{at:original.at-1},{observed_at:original.at-1},{observed_at:f.deps.clock()+1},{state:"BLOCKED_BEFORE_DISPATCH"},{state:"DEFINITE_REJECTION"}]){
  Object.assign(receipt,original,patch);
  assert.equal((await readCommentJournal(f.store,p,q.review_id,f.deps.clock)).status,"JOURNAL_UNKNOWN");
  assert.equal((await f.reviews.history(f.ctx,q.review_id)).ok,false);
  assert.equal((await f.writes.reconcile(f.ctx,q.request_id)).status,"UNKNOWN_OUTCOME_REVIEW");
 }
 Object.assign(receipt,original);
 assert.equal((await readCommentJournal(f.store,p,q.review_id,f.deps.clock)).status,"HISTORICAL_OBSERVED_SUCCESS");
 assert.equal((await f.writes.reconcile(f.ctx,q.request_id)).ok,true);assert.equal(f.posts(),1);
});

import {loadProjectDashboard} from "../dashboard/project-dashboard.js";
test("project dashboard bounded sample verifies real comment receipt chain without a second dispatch",async()=>{
 const cloud="00000000-0000-4000-8000-000000000001",f=fixture(undefined,null,()=>true,cloud),context={...f.ctx,extension:{type:"jira:projectPage",project:{id:"10001",key:"HTF"}}};
 for(const intent of ["review change","review release","coordinate incident"]){assert.equal((await f.reviews.save(f.ctx,intent)).ok,true);f.advance(1000)}
 const prepared=await f.request();assert.equal(prepared.ok,true);assert.equal((await f.writes.approve(f.ctx,prepared.request_id,prepared.request_id)).ok,true);assert.equal((await f.writes.execute(f.ctx,prepared.request_id)).ok,true);
 const p=principal(f.ctx,digest),prefix="cg:review:"+p.tenant+":"+p.actor+":",clock=f.deps.clock;
 const page={results:[...f.map.entries()].filter(([k])=>k.startsWith(prefix)&&k.endsWith(":snapshot")).map(([key,value])=>({key,value,expireTime:new Date(value.expires_at).toISOString()})).reverse(),nextCursor:"synthetic-next-page"};
 let pointReads=0;const input={development:true,cloudId:cloud,digest,clock,admit:async()=>({ok:true}),readProjectIssue:async()=>({key:"HTF-2",id:"2",project_id:"10001",project_key:"HTF"}),readEvidence:async()=>({ok:true,snapshot:{objectId:"2"},evidence:(await f.preview(f.ctx,"review change")).evidence}),readStored:async k=>{pointReads++;return f.store.get(k)},queryReviews:async (key,limit)=>{assert.equal(key,prefix);assert.equal(limit,12);return page}};
 const size=f.map.size;let result=await loadProjectDashboard(context,input);assert.equal(result.ok,true);assert.equal(result.rows.length,3);assert.equal(result.scan_truncated,true);assert.equal(result.rows_truncated,true);assert.equal(result.rows[0].review_id,prepared.review_id);assert.equal(result.rows[0].comment_state,"HISTORICAL_OBSERVED_SUCCESS");assert.equal(result.rows[0].journal_state,"POLICY_REVIEW");assert.ok(pointReads<=60);assert.equal(f.posts(),1);assert.equal(f.map.size,size);
 const receipt=[...f.map.values()].find(v=>v.schema_version==="hae.comment.receipt.v1");receipt.observation_digest="bad";pointReads=0;result=await loadProjectDashboard(context,input);assert.equal(result.rows[0].comment_state,"NOT_ESTABLISHED");assert.ok(pointReads<=60);assert.equal(f.posts(),1);assert.equal(f.map.size,size);
});

test("preview explains the same reported evidence prerequisites enforced by actual comment preparation",async()=>{
 const cases=[
  [fixture([]),"review change","WRITE_CRITICAL_EVIDENCE_MISSING"],
  [fixture(["tf-req-DEMO-1","tf-test-DEMO-2-pass","tf-policy-DEMO-v1"]),"review change","WRITE_REQUIREMENT_TEST_LINK_MISSING"],
  [fixture(["tf-req-DEMO-1","tf-test-DEMO-1-pass","tf-policy-DEMO-v1"]),"coordinate incident","WRITE_CRITICAL_EVIDENCE_MISSING"]
 ];
 for(const [f,intent,code] of cases){const preview=await f.preview(f.ctx,intent);assert.equal(preview.comment_readiness.status,"BLOCKED");assert.equal(preview.comment_readiness.code,code);assert.equal(preview.comment_readiness.authorization,"NONE");assert.equal((await f.request(intent)).code,code);assert.equal(f.posts(),0)}
 const f=fixture(),good=await f.preview(f.ctx,"review change");assert.equal(good.comment_readiness.status,"EVIDENCE_PREREQUISITES_PRESENT");assert.equal(good.comment_readiness.execution,"DISABLED");assert.equal((await f.request()).ok,true);assert.equal(f.posts(),0);
 assert.equal((await f.preview(f.ctx,"review release")).comment_readiness.status,"NOT_APPLICABLE");
 const conflict=fixture(undefined,["tf-owner-DEMO-1-SEC"]);assert.equal((await conflict.preview(conflict.ctx,"coordinate incident")).comment_readiness.code,"WRITE_DEPENDENCY_OR_POLICY_DENIED");assert.equal(conflict.posts(),0);
});


test("P2 report corruption preserves independently scoped unresolved comment recovery reference",async()=>{
 const f=fixture(),r=await f.request();assert.equal(r.ok,true);
 assert.equal((await f.writes.approve(f.ctx,r.request_id,r.request_id)).ok,true);
 f.setMode("timeout");const uncertain=await f.writes.execute(f.ctx,r.request_id);assert.equal(uncertain.status,"UNKNOWN_OUTCOME_REVIEW");assert.equal(f.posts(),1);
 const {createReportService}=await import("../security/approval/report-service.js"),reports=createReportService(f.deps);
 const q=await reports.prepare(f.ctx,r.review_id);assert.equal(q.ok,true);assert.equal((await reports.approve(f.ctx,q.request_id,q.request_id)).ok,true);
 assert.equal((await reports.generate(f.ctx,q.request_id)).ok,true);
 const receipt=[...f.map.values()].find(x=>x.schema_version==="hae.report.receipt.v2");assert.ok(receipt);receipt.lineage.edges[0].relation="FORGED";
 const v=await f.reviews.refresh(f.ctx,r.review_id);assert.equal(v.receipt_status,"UNCONFIRMED");assert.equal(v.run_state,"REPORT_OUTCOME_REVIEW_REQUIRED");assert.deepEqual(v.comment_journal,{status:"UNKNOWN_OUTCOME_REVIEW",request_id:r.request_id});assert.equal(v.report_digest,undefined);
 const history=await f.reviews.history(f.ctx,r.review_id);assert.equal(history.ok,false);assert.equal(history.recovery_comment_journal,undefined);
 assert.equal((await f.reviews.refresh({...f.ctx,accountId:"other"},r.review_id)).ok,false);
 const {restoreUnresolvedComment}=await import("../ui/request-state.js");assert.equal(restoreUnresolvedComment("",v.comment_journal),r.request_id);
 assert.equal(f.posts(),1);
});
