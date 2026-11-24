import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {guardedPreview} from "../security/policy.js";
import {previewTypedIntent} from "../core/ir/preview.js";
import {canonical,validatePlan} from "../core/ir/plan.js";
import {createReviewService} from "../state/review-service.js";
import {readCommentJournal} from "../state/comment-journal.js";
import {principal} from "../evidence/bundle.js";
import {createCommentService} from "../security/approval/comment-service.js";
const digest=s=>createHash("sha256").update(s).digest("hex");
function fixture(){
 const map=new Map(),ctx={accountId:"synthetic",installContext:"ari:cloud:jira::site/demo",extension:{issue:{key:"HTF-2"}}};
 let now=Date.parse("2026-11-24T12:00:00Z"),version="2026-11-24T11:00:00Z",allowed=true,add=true,posts=0,counter=0,mode="ok",reads=0,changeAt=Infinity;
 const clock=()=>now;
 const store={get:async k=>map.get(k),create:async(k,v)=>{if(map.has(k))throw Error("conflict");map.set(k,JSON.parse(JSON.stringify(v)))}};
 const adapter={links:async()=>({ok:true,keys:[],complete:true}),read:async k=>{if(++reads===changeAt)version="2026-11-24T11:05:00Z";return {ok:true,snapshot:{objectId:"2",key:k,status:"Open",issueType:"Task"},source:{provider:"jira",objectId:"2",uri:"/browse/"+k,version,retrievedAt:new Date(clock()).toISOString(),visibility:"OBSERVED_AS_USER",contentHash:digest(k+version)}}}};
 const preview=(c,i,saved)=>guardedPreview(c,i,{adapter,digest,clock,preview:previewTypedIntent,checkPlan:validatePlan,planDigest:p=>digest(canonical(p))},saved);
 let comments=[];
 const transport={permissions:async()=>({browse:true,add}),post:async(key,body)=>{posts++;if(mode==="reject")return {status:403};if(mode==="lost")throw Error("timeout");comments.push({id:String(posts),author:{accountId:ctx.accountId},body});if(mode==="timeout")throw Error("timeout after effect");return {status:201,id:String(posts)}},get:async(key,id)=>({status:200,comment:comments.find(c=>c.id===id)}),recent:async()=>({status:200,comments:mode==="hidden"?[]:comments})};
 const deps={store,clock,digest,preview,development:()=>true,nonce:()=>digest("nonce"+(++counter)),allowedInstall:()=>allowed,transport};
 const reviews=createReviewService(deps),writes=createCommentService(deps);
 async function request(intent="review change"){const saved=await reviews.save(ctx,intent);assert.equal(saved.ok,true);return writes.prepare(ctx,saved.saved_review.review_id)}
 async function approved(){const r=await request();assert.equal(r.ok,true);assert.equal((await writes.approve(ctx,r.request_id,r.request_id)).ok,true);return r.request_id}
 return {ctx,map,store,writes,request,approved,posts:()=>posts,change:()=>{version="2026-11-24T11:05:00Z"},restore:()=>{version="2026-11-24T11:00:00Z"},deny:()=>{add=false},allow:()=>{add=true},unconfigure:()=>{allowed=false},expire:()=>{now+=121000},setMode:m=>{mode=m},changeOnFinal:()=>{changeAt=reads+3}};
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
 const journal=await readCommentJournal(f.store,principal(f.ctx,digest),r.review_id);assert.equal(journal.status,"HISTORICAL_OBSERVED_SUCCESS");assert.equal(journal.request_id,r.request_id);
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
