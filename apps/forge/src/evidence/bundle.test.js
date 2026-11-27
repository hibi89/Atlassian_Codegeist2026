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
 denied=false;linked=["tf-req-DEMO-2","tf-test-DEMO-2-pass"];r=await run();assert.equal(r.release_assessment.status,"MISSING_REPORTED_EVIDENCE");assert.equal(r.release_assessment.requirements.find(x=>x.requirement==="DEMO-2").ownership_state,"MISSING_REPORTED_OWNER");
 linked.push("tf-owner-DEMO-2-SEC","tf-owner-OTHER-7-OPS");r=await run();assert.equal(r.release_assessment.status,"MISSING_REPORTED_EVIDENCE");assert.equal(r.release_assessment.unmatched_owners[0].subject,"OTHER-7");assert.deepEqual(r.release_assessment.unmatched_owners[0].source_refs,["/browse/DEMO-2"]);
 linked.pop();r=await run();assert.equal(r.release_assessment.status,"HUMAN_RELEASE_REVIEW_REQUIRED");assert.deepEqual(r.release_assessment.requirements.find(x=>x.requirement==="DEMO-2").reported_teams,["SEC"]);assert.deepEqual(r.release_assessment.requirements.find(x=>x.requirement==="DEMO-2").ownership_source_refs,["/browse/DEMO-2"]);assert.equal(r.release_assessment.authorization,"NONE");
});

test("release source version changes and root access failures never imply release readiness",async()=>{
 let count=0;
 const services={adapter:{...adapter,read:async k=>sample(k,k==="DEMO-1"&&++count>1?"2026-11-24T11:05:00Z":"2026-11-24T11:00:00Z")},digest,clock,preview:previewTypedIntent,checkPlan:validatePlan,planDigest:p=>digest(canonical(p))};
 const stale=await guardedPreview(ctx,"review release",services);assert.equal(stale.release_assessment.status,"STALE_EVIDENCE");assert.equal(stale.policy.decision,"REVIEW");
 const unknown=await guardedPreview(ctx,"review release",{...services,adapter:{...adapter,read:async()=>({ok:false,code:"SOURCE_ACCESS_UNKNOWN"})}});assert.equal(unknown.release_assessment.status,"ACCESS_OR_COVERAGE_UNKNOWN");assert.equal(unknown.release_assessment.source_count,0);
});


test("P2 revoked linked source opaque identity is withheld in actual preview while unknown count remains",async()=>{
 const hiddenRef=digest("jira:"+principal(ctx,digest).tenant+":2");let reads=0;
 const services={adapter:{...adapter,read:async k=>k==="DEMO-2"&&++reads>1?{ok:false,code:"SOURCE_ACCESS_UNKNOWN"}:sample(k)},digest,clock,preview:previewTypedIntent,checkPlan:validatePlan,planDigest:p=>digest(canonical(p))};
 const r=await guardedPreview(ctx,"review change",services);
 assert.equal(r.policy.decision,"REVIEW");assert.equal(r.freshness.status,"UNKNOWN");assert.equal(r.freshness.unknown_count,1);assert.equal(r.freshness.unknown.length,0);assert.equal(r.impact_summary.status,"HOLD");assert.equal(JSON.stringify(r).includes(hiddenRef),false);
});
test("P2 link lookup is bound to actual issue object identity; invalid new source is UNKNOWN",async()=>{
 let identity;
 const before=await collectEvidence(ctx,{...adapter,links:async(k,id)=>{identity=id;return {ok:true,keys:[],complete:true}}},digest,clock);
 assert.equal(identity,"1");
 const after=await collectEvidence(ctx,{...adapter,read:async k=>sample(k,k==="DEMO-2"?"2026-11-25T11:00:00Z":"2026-11-24T11:00:00Z")},digest,clock);
 const r=compareEvidence(before.evidence,after.evidence,now);assert.equal(r.status,"UNKNOWN");assert.equal(r.changed.length,0);assert.equal(r.unknown.length,1);
});

test("P2 linked-source reads are bounded to three in flight and merged in input order",async()=>{
 const keys=["DEMO-2","DEMO-3","DEMO-4","DEMO-5","DEMO-6","DEMO-7"];let active=0,peak=0,calls=0;
 const a={links:async()=>({ok:true,keys,complete:true}),read:async k=>{
   if(k==="DEMO-1")return sample(k);
   active++;calls++;peak=Math.max(peak,active);
   try{await Promise.resolve();if(k==="DEMO-4")throw Error("fixture failure");return sample(k)}finally{active--}
 }};
 const r=await collectEvidence(ctx,a,digest,clock);assert.equal(r.ok,true);assert.equal(peak,3);assert.equal(calls,6);
 assert.equal(r.evidence.coverage,"INCOMPLETE_OR_UNKNOWN");assert.equal(r.evidence.unknown_count,1);
 assert.deepEqual(r.evidence.sources.map(s=>s.uri),["/browse/DEMO-1",...keys.filter(k=>k!=="DEMO-4").map(k=>"/browse/"+k)]);
 const all={...a,read:async k=>sample(k)};const f=await refreshEvidence(ctx,all,digest,clock);assert.equal(f.freshness.status,"CURRENT_OBSERVED");assert.equal(f.evidence.sources.length,7);
});

test("P2 release assessment exposes unmatched reported failure and does not hide malformed reserved evidence",async()=>{
 let labels=["tf-req-DEMO-1","tf-test-DEMO-1-pass","tf-policy-DEMO-v1","tf-owner-DEMO-1-OPS","tf-test-OTHER-7-fail"];
 const a={links:async()=>({ok:true,keys:[],complete:true}),read:async k=>({...sample(k),snapshot:{...sample(k).snapshot,reportedTags:typedTags(labels)},source:{...sample(k).source,contentHash:digest(JSON.stringify(labels))}})};
 const run=()=>guardedPreview(ctx,"review release",{adapter:a,digest,clock,preview:previewTypedIntent,checkPlan:validatePlan,planDigest:p=>digest(canonical(p))});
 let result=await run();assert.equal(result.release_assessment.status,"REPORTED_FAILURE");assert.equal(result.release_assessment.unmatched_tests[0].subject,"OTHER-7");assert.deepEqual(result.release_assessment.unmatched_tests[0].source_refs,["/browse/DEMO-1"]);
 labels=labels.map(x=>x==="tf-test-OTHER-7-fail"?"tf-test-OTHER-7-pass":x);result=await run();assert.equal(result.release_assessment.status,"MISSING_REPORTED_EVIDENCE");
 labels.push("tf-test-DEMO-1-FAIL");result=await run();assert.equal(result.policy.decision,"REVIEW");assert.equal(result.release_assessment.status,"ACCESS_OR_COVERAGE_UNKNOWN");
});

test("coverage reasons expose bounded omissions and unknown versions without leaking hidden identities",async()=>{
 const keys=Array.from({length:8},(_,i)=>"DEMO-"+(i+2));
 const limited=await collectEvidence(ctx,{read:async k=>sample(k),links:async()=>boundedLinks(keys.map(key=>({outwardIssue:{key}})),"DEMO-1")},digest,clock);
 assert.equal(limited.evidence.coverage,"INCOMPLETE_OR_UNKNOWN");assert.equal(limited.evidence.unknown_count,1);assert.deepEqual(limited.evidence.coverage_reasons,["LINK_COVERAGE_INCOMPLETE"]);
 assert.equal(JSON.stringify(limited.evidence).includes("/browse/DEMO-9"),false);
 const noVersion=await collectEvidence(ctx,{read:async k=>sample(k,null),links:async()=>({ok:true,keys:[],complete:true})},digest,clock);
 assert.equal(noVersion.evidence.unknown_count,1);assert.deepEqual(noVersion.evidence.coverage_reasons,["SOURCE_VERSION_UNKNOWN"]);assert.equal(noVersion.evidence.coverage,"INCOMPLETE_OR_UNKNOWN");
 const good=await collectEvidence(ctx,adapter,digest,clock);assert.deepEqual(good.evidence.coverage_reasons,[]);assert.equal(good.evidence.unknown_count,0);
 const mixed=await collectEvidence(ctx,{read:async k=>k==="DEMO-2"?{ok:false,code:"SOURCE_ACCESS_UNKNOWN"}:sample(k,null),links:async()=>({ok:true,keys:["DEMO-2"],complete:false}),page:async()=>({ok:false,code:"CONFLUENCE_ACCESS_UNKNOWN"})},digest,clock);
 assert.equal(mixed.evidence.unknown_count,4);assert.deepEqual(mixed.evidence.coverage_reasons,["DOCUMENT_OBSERVATION_UNKNOWN","LINKED_SOURCE_UNKNOWN","LINK_COVERAGE_INCOMPLETE","SOURCE_VERSION_UNKNOWN"]);assert.equal(JSON.stringify(mixed.evidence).includes("/browse/DEMO-2"),false);
});

test("incident assessment links ownership to requirements and exposes conflicting and unmatched teams",async()=>{
 let labels=["tf-req-DEMO-1","tf-owner-DEMO-1-OPS","tf-policy-DEMO-v1"],linked=["tf-owner-DEMO-1-SEC"],denied=false;
 const a={...adapter,read:async k=>denied&&k==="DEMO-2"?{ok:false,code:"SOURCE_ACCESS_UNKNOWN"}:{...sample(k),snapshot:{...sample(k).snapshot,reportedTags:typedTags(k==="DEMO-1"?labels:linked)},source:{...sample(k).source,contentHash:digest(k+JSON.stringify(k==="DEMO-1"?labels:linked))}}};
 const run=()=>guardedPreview(ctx,"coordinate incident",{adapter:a,digest,clock,preview:previewTypedIntent,checkPlan:validatePlan,planDigest:p=>digest(canonical(p))});
 let x=await run();assert.equal(x.incident_assessment.status,"CONFLICT_REVIEW");assert.equal(x.incident_assessment.ownership[0].state,"OWNERSHIP_CONFLICT");assert.equal(x.incident_assessment.ownership[0].source_uris.length,2);assert.equal(x.policy.decision,"REVIEW");
 linked=["tf-owner-OTHER-7-SEC"];x=await run();assert.equal(x.incident_assessment.status,"MISSING_OR_UNMATCHED_COORDINATION_EVIDENCE");assert.equal(x.incident_assessment.unmatched_owners[0].subject,"OTHER-7");
 labels=["tf-req-DEMO-1","tf-policy-DEMO-v1"];linked=[];x=await run();assert.equal(x.incident_assessment.ownership[0].state,"MISSING_REPORTED_OWNER");
 labels.push("tf-owner-DEMO-1-OPS");x=await run();assert.equal(x.incident_assessment.status,"HUMAN_COORDINATION_REVIEW_REQUIRED");assert.equal(x.incident_assessment.authorization,"NONE");assert.equal(x.incident_assessment.execution,"NO_JIRA_MUTATION");
 denied=true;x=await run();assert.equal(x.incident_assessment.status,"ACCESS_OR_COVERAGE_UNKNOWN");assert.equal(JSON.stringify(x.incident_assessment).includes("/browse/DEMO-2"),false);
});

import {observationTime} from "./observation-time.js";
import {readIssue} from "../adapters/jira/reader.js";
test("TruthGate rejects ambiguous or impossible source timestamps before normalization",async()=>{
 const invalid=["2026-02-30T11:00:00Z","2026-11-24T24:00:00Z","2026-11-24T11:00:00","2026-11-24","2026-11-24T11:00:00+0060"];
 for(const version of invalid){
  assert.equal(observationTime(version),null);
  const jira=await readIssue(ctx,async()=>({status:200,text:async()=>JSON.stringify({id:"1",key:"DEMO-1",fields:{summary:"Fixture",status:{name:"Open"},issuetype:{name:"Task"},updated:version,labels:[]}})}),()=>new Date(now).toISOString(),digest);
  assert.equal(jira.ok,true);assert.equal(jira.source.version,null);
  const page=await readPage("123",async()=>({status:200,text:async()=>JSON.stringify({id:"123",status:"current",title:"Fixture",version:{number:1,createdAt:version},body:{storage:{representation:"storage",value:"Fixture"}}})}),clock,digest);
  assert.equal(page.code,"CONFLUENCE_VERSION_OR_CONTENT_UNKNOWN");
  const observed=await collectEvidence(ctx,{read:async k=>sample(k,version),links:async()=>({ok:true,keys:[],complete:true})},digest,clock);
  assert.equal(observed.evidence.coverage,"INCOMPLETE_OR_UNKNOWN");
 }
 assert.equal(observationTime("2024-02-29T12:00:00.000+0900"),Date.parse("2024-02-29T03:00:00Z"));
 assert.equal(observationTime("2026-11-24T11:00:00.123456Z"),Date.parse("2026-11-24T11:00:00.123Z"));
});
test("TruthGate rejects ambiguous links and versions later than their observation",async()=>{
 assert.equal(boundedLinks([{inwardIssue:{},outwardIssue:{key:"DEMO-2"}}],"DEMO-1").complete,false);
 const a={...adapter,read:async k=>{const result=sample(k);return {...result,source:{...result.source,retrievedAt:"2026-11-24T10:59:59Z"}}}};
 const x=await collectEvidence(ctx,a,digest,clock);
 assert.equal(x.evidence.coverage,"INCOMPLETE_OR_UNKNOWN");
 assert.equal(x.evidence.sources.every(s=>s.status==="UNVERIFIED_VERSION"),true);
 const y=await guardedPreview(ctx,"review change",{adapter:a,digest,clock,preview:previewTypedIntent,checkPlan:validatePlan,planDigest:p=>digest(canonical(p))});
 assert.equal(y.policy.decision,"REVIEW");assert.equal(y.policy.execution,"DISABLED");
});
