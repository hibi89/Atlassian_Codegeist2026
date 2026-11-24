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

test("guarded preview projects affected nodes from actual first and second observations",async()=>{
 const services={adapter,digest,clock,preview:previewTypedIntent,checkPlan:validatePlan,planDigest:p=>digest(canonical(p))};
 const same=await guardedPreview(ctx,"review change",services);
 assert.equal(same.impact_summary.status,"NO_CHANGE_OBSERVED");assert.equal(same.impact_summary.affected_count,0);
 let i=0;const changed=await guardedPreview(ctx,"review change",{...services,adapter:{...adapter,read:async k=>sample(k,k==="DEMO-1"&&++i>1?"2026-11-24T11:05:00Z":"2026-11-24T11:00:00Z")}});
 assert.equal(changed.impact_summary.status,"STALE_REVIEW_REQUIRED");
 assert.ok(changed.impact_summary.affected_count>0);assert.ok(changed.impact_summary.unaffected_count>0);
 assert.equal(changed.policy.decision,"REVIEW");assert.equal(changed.policy.execution,"DISABLED");
 assert.equal(Object.hasOwn(changed,"previous_evidence"),false);
 let reads=0;const denied=await guardedPreview(ctx,"review change",{...services,adapter:{...adapter,read:async k=>k==="DEMO-2"&&++reads>1?{ok:false,code:"SOURCE_ACCESS_UNKNOWN"}:sample(k)}});
 assert.equal(denied.impact_summary.status,"HOLD");assert.equal(denied.policy.execution,"DISABLED");assert.equal(JSON.stringify(denied).includes("/browse/DEMO-2"),false);
});

import {readPage} from "../adapters/confluence/reader.js";
test("Confluence configured read integrates versioned evidence without raw page or denied identity",async()=>{
 let version=1,deny=false;
 const transport=async id=>({status:deny?403:200,text:async()=>JSON.stringify({id,status:"current",title:"SECRET_FIXTURE_TITLE",version:{number:version,createdAt:"2026-11-24T11:00:00Z"},body:{storage:{representation:"storage",value:"SECRET_FIXTURE_BODY"}}})});
 const mixed={...adapter,page:()=>readPage("12345",transport,clock,digest)};
 const first=await collectEvidence(ctx,mixed,digest,clock);
 assert.equal(first.evidence.sources.length,3);assert.equal(first.evidence.document_status,"AUTHORIZED_PAGE_OBSERVED");
 assert.equal(first.evidence.claims.find(c=>c.predicate==="confluence.page_version").value,"1");
 assert.equal(JSON.stringify(first).includes("SECRET_FIXTURE"),false);
 version=2;const next=await collectEvidence(ctx,mixed,digest,clock);
 assert.equal(compareEvidence(first.evidence,next.evidence,now).status,"STALE_VERSION");
 deny=true;const blocked=await collectEvidence(ctx,mixed,digest,clock);
 assert.equal(blocked.evidence.coverage,"INCOMPLETE_OR_UNKNOWN");assert.equal(blocked.evidence.document_status,"CONFLUENCE_ACCESS_UNKNOWN");assert.equal(JSON.stringify(blocked).includes("12345"),false);
 assert.equal((await readPage("../bad",transport,clock,digest)).ok,false);
 const other=await collectEvidence({...ctx,installContext:"ari:cloud:jira::site/test-b"},{...mixed,page:()=>null},digest,clock);assert.equal(other.evidence.document_status,"NOT_CONFIGURED");
});

import {typedTags} from "./typed-claims.js";
test("release assessment distinguishes missing, stale, contradictory and unknown evidence, with source citations",async()=>{
 let labels=["tf-req-DEMO-1","tf-test-DEMO-1-pass","tf-policy-DEMO-v1","tf-owner-DEMO-1-OPS"],linked=["tf-req-DEMO-2"],denied=false;
 const a={...adapter,read:async k=>denied&&k==="DEMO-2"?{ok:false,code:"SOURCE_ACCESS_UNKNOWN"}:{...sample(k),snapshot:{...sample(k).snapshot,reportedTags:typedTags(k==="DEMO-1"?labels:linked)},source:{...sample(k).source,contentHash:digest(k+JSON.stringify(k==="DEMO-1"?labels:linked))}}};
 const services={adapter:a,digest,clock,preview:previewTypedIntent,checkPlan:validatePlan,planDigest:p=>digest(canonical(p))};
 const run=()=>guardedPreview(ctx,"review release",services);
 let r=await run();assert.equal(r.release_assessment.status,"MISSING_REPORTED_EVIDENCE");assert.equal(r.release_assessment.requirements.find(x=>x.requirement==="DEMO-2").state,"MISSING_REPORTED_TEST");
 linked=["tf-test-DEMO-1-fail"];r=await run();assert.equal(r.release_assessment.status,"CONFLICT_REVIEW");assert.equal(r.release_assessment.conflicts[0].sources.length,2);
 denied=true;r=await run();assert.equal(r.release_assessment.status,"ACCESS_OR_COVERAGE_UNKNOWN");assert.equal(r.policy.decision,"REVIEW");
 denied=false;linked=["tf-req-DEMO-2","tf-test-DEMO-2-pass"];r=await run();assert.equal(r.release_assessment.status,"HUMAN_RELEASE_REVIEW_REQUIRED");assert.equal(r.release_assessment.authorization,"NONE");
});
