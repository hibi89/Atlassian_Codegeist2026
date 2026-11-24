import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { principal,boundedLinks,collectEvidence,refreshEvidence,compareEvidence } from "./bundle.js";
import { guardedPreview,evaluatePolicy } from "../security/policy.js";
import { previewTypedIntent } from "../core/ir/preview.js";
import { canonical,validatePlan } from "../core/ir/plan.js";
const digest=s=>createHash("sha256").update(s).digest("hex");
const now=Date.parse("2026-11-24T12:00:00Z"),clock=()=>now;
const ctx={accountId:"synthetic",installContext:"ari:cloud:jira::site/test-a",extension:{issue:{key:"DEMO-1"}}};
const sample=(key,version="2026-11-24T11:00:00Z")=>{const id=key.split("-")[1];return {ok:true,snapshot:{objectId:id,key,status:"Open",issueType:"Task"},source:{provider:"jira",objectId:id,uri:"/browse/"+key,version,retrievedAt:new Date(now).toISOString(),visibility:"OBSERVED_AS_USER",contentHash:digest(key+version)}}};
const adapter={read:async k=>sample(k),links:async()=>boundedLinks([{outwardIssue:{key:"DEMO-2"}},{inwardIssue:{key:"DEMO-2"}}],"DEMO-1")};
test("authorized scope, link dedupe, no inaccessible source identity",async()=>{
 const a=await collectEvidence(ctx,adapter,digest,clock);assert.equal(a.evidence.sources.length,2);assert.equal(a.evidence.claims.length,4);
 const b=await collectEvidence({...ctx,installContext:"ari:cloud:jira::site/test-b"},adapter,digest,clock);assert.notEqual(a.evidence.sources[0].source_ref,b.evidence.sources[0].source_ref);
 assert.equal((await collectEvidence({...ctx,installContext:undefined},adapter,digest,clock)).ok,false);
 const d=await collectEvidence(ctx,{...adapter,read:async k=>k==="DEMO-2"?{ok:false,code:"SOURCE_ACCESS_UNKNOWN"}:sample(k)},digest,clock);assert.equal(d.evidence.coverage,"INCOMPLETE_OR_UNKNOWN");assert.equal(d.evidence.sources.length,1);assert.equal(JSON.stringify(d.evidence).includes("/browse/DEMO-2"),false);
 assert.equal(boundedLinks([{outwardIssue:{key:"../x"}}],"DEMO-1").complete,false);
 assert.equal(boundedLinks(Array.from({length:8},(_,i)=>({outwardIssue:{key:"DEMO-"+(i+2)}})),"DEMO-1").keys.length,6);
});
test("actual re-read, changed revision and expiry fail closed",async()=>{
 const f=await refreshEvidence(ctx,adapter,digest,clock);assert.equal(f.freshness.status,"CURRENT_OBSERVED");
 let i=0;const c=await refreshEvidence(ctx,{...adapter,read:async k=>sample(k,k==="DEMO-1"&&++i>1?"2026-11-24T11:05:00Z":"2026-11-24T11:00:00Z")},digest,clock);assert.equal(c.freshness.status,"STALE_VERSION");assert.equal(c.freshness.changed.length,1);
 assert.equal(compareEvidence(f.evidence,f.evidence,now+120000).status,"UNKNOWN");
});
test("actual typed preview policy and denial of stale/forged/cross-tenant",async()=>{
 const services={adapter,digest,clock,preview:previewTypedIntent,checkPlan:validatePlan,planDigest:p=>digest(canonical(p))};
 const g=await guardedPreview(ctx,"review change",services);assert.equal(g.policy.decision,"ALLOW_PREVIEW");assert.equal(g.policy.execution,"DISABLED");assert.equal(g.policy.authorization,"NONE");
 const p=principal(ctx,digest);
 assert.equal(evaluatePolicy(p,{...g,plan:{...g.plan,plan_hash:"fake"}},g.evidence,g.freshness,now,validatePlan,services.planDigest).decision,"DENY");
 assert.equal(evaluatePolicy(p,g,{...g.evidence,installation_ref:"foreign"},g.freshness,now,validatePlan,services.planDigest).decision,"DENY");
 assert.equal(evaluatePolicy(p,g,g.evidence,{status:"STALE_VERSION"},now,validatePlan,services.planDigest).decision,"REVIEW");
 assert.equal((await guardedPreview(ctx,"review change and delete issue",services)).ok,false);
});
