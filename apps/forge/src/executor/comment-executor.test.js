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
const digest=s=>createHash("sha256").update(s).digest("hex");
function fixture(labels=["tf-req-DEMO-1","tf-test-DEMO-1-pass","tf-policy-DEMO-v1","tf-owner-DEMO-1-OPS"],linkedLabels=null){
 const map=new Map(),ctx={accountId:"synthetic",installContext:"ari:cloud:jira::site/demo",extension:{issue:{key:"HTF-2"}}};
 let now=Date.parse("2026-11-24T12:00:00Z"),version="2026-11-24T11:00:00Z",allowed=true,add=true,posts=0,counter=0,mode="ok",reads=0,changeAt=Infinity;
 const clock=()=>now;
 const store={get:async k=>map.get(k),create:async(k,v)=>{if(map.has(k))throw Error("conflict");map.set(k,JSON.parse(JSON.stringify(v)))}};
 const adapter={links:async()=>({ok:true,keys:linkedLabels===null?[]:["HTF-3"],complete:true}),read:async k=>{if(++reads===changeAt)version="2026-11-24T11:05:00Z";const root=k==="HTF-2",v=root?version:"2026-11-24T11:00:00Z",tags=root?labels:linkedLabels,objectId=root?"2":"3";return {ok:true,snapshot:{objectId,key:k,status:"Open",issueType:"Task",reportedTags:typedTags(tags)},source:{provider:"jira",objectId,uri:"/browse/"+k,version:v,retrievedAt:new Date(clock()).toISOString(),visibility:"OBSERVED_AS_USER",contentHash:digest(k+v+JSON.stringify(tags))}}}};
 const preview=(c,i,saved)=>guardedPreview(c,i,{adapter,digest,clock,preview:previewTypedIntent,checkPlan:validatePlan,planDigest:p=>digest(canonical(p))},saved);
 let comments=[];
 const transport={permissions:async()=>({browse:true,add}),post:async(key,body)=>{posts++;if(mode==="reject")return {status:403};if(mode==="lost")throw Error("timeout");comments.push({id:String(posts),author:{accountId:ctx.accountId},body});if(mode==="marked"){comments[comments.length-1].body.content[0].content[0].marks=[{type:"strong"}]};if(mode==="timeout")throw Error("timeout after effect");return {status:201,id:String(posts)}},get:async(key,id)=>({status:200,comment:comments.find(c=>c.id===id)}),recent:async()=>({status:200,comments:mode==="hidden"?[]:comments})};
 const deps={store,clock,digest,preview,development:()=>true,nonce:()=>digest("nonce"+(++counter)),allowedInstall:()=>allowed,transport};
 const reviews=createReviewService(deps),writes=createCommentService(deps);
 async function request(intent="review change"){const saved=await reviews.save(ctx,intent);assert.equal(saved.ok,true);return writes.prepare(ctx,saved.saved_review.review_id)}
 async function approved(){const r=await request();assert.equal(r.ok,true);assert.equal((await writes.approve(ctx,r.request_id,r.request_id)).ok,true);return r.request_id}
 return {ctx,map,store,reviews,writes,request,approved,preview,posts:()=>posts,change:()=>{version="2026-11-24T11:05:00Z"},restore:()=>{version="2026-11-24T11:00:00Z"},deny:()=>{add=false},allow:()=>{add=true},unconfigure:()=>{allowed=false},expire:()=>{now+=121000},setMode:m=>{mode=m},changeOnFinal:()=>{changeAt=reads+3}};
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
 const journal=await readCommentJournal(f.store,principal(f.ctx,digest),r.review_id);assert.equal(journal.status,"HISTORICAL_OBSERVED_SUCCESS");assert.equal(journal.request_id,r.request_id);const history=await f.reviews.history(f.ctx,r.review_id);assert.equal(history.ok,true);assert.ok(history.nodes.some(n=>n.kind==="RECEIPT"));assert.equal((await f.reviews.history({...f.ctx,accountId:"other"},r.review_id)).ok,false);
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
