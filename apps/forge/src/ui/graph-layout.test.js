import test from "node:test";import assert from "node:assert/strict";import {layoutGraph} from "./graph-layout.js";
test("diagram uses actual DAG levels and every node, with deterministic layout",()=>{const nodes=["a","b","c","d"].map(id=>({id})),edges=[["a","b"],["a","c"],["b","d"],["c","d"]].map(([from_dependency,to_dependent])=>({from_dependency,to_dependent}));const g=layoutGraph(nodes,edges);assert.ok(g);assert.equal(Object.keys(g.positions).length,4);for(const e of edges)assert.ok(g.positions[e.from_dependency].x<g.positions[e.to_dependent].x);assert.notEqual(g.positions.b.y,g.positions.c.y);assert.deepEqual(g,layoutGraph(nodes,edges));assert.equal(layoutGraph(nodes,[...edges,{from_dependency:"d",to_dependent:"a"}]),null);assert.equal(layoutGraph(nodes,[{from_dependency:"a",to_dependent:"unknown"}]),null);assert.equal(layoutGraph(Array.from({length:81},(_,i)=>({id:String(i)})),[]),null)});

import {createRequestGate,unresolvedCommentId,commentResponse} from "./request-state.js";
test("UI synchronous request gate rejects repeated clicks and stale completion",()=>{const g=createRequestGate(),a=g.begin();assert.ok(a);assert.equal(g.begin(),null);assert.equal(g.current(a),true);assert.equal(g.end(a),true);const b=g.begin();assert.notEqual(a,b);assert.equal(g.end(a),false);assert.equal(g.current(b),true);assert.equal(g.end(b),true)});
test("UI unknown comment outcome survives unrelated, malformed and mismatched terminal responses",()=>{const a="a".repeat(64),b="b".repeat(64),success={ok:true,status:"OBSERVED_SUCCESS",execution:"JIRA_COMMENT_READBACK_OBSERVED",request_id:a};let id=unresolvedCommentId("","executeDemoComment",a,null);assert.equal(id,a);assert.equal(commentResponse("executeDemoComment",a,{ok:false,code:"BACKEND_UNAVAILABLE"}).status,"UNKNOWN_OUTCOME_REVIEW");for(const [operation,request,result] of [["prepareDemoComment",b,{ok:true}],["reconcileDemoComment",b,{...success,request_id:b}],["reconcileDemoComment",a,{...success,request_id:b}],["reconcileDemoComment",a,{status:"OBSERVED_SUCCESS"}],["reconcileDemoComment",a,{...success,execution:"UNKNOWN"}],["reconcileDemoComment",a,{ok:false,code:"BACKEND_UNAVAILABLE"}]])assert.equal(unresolvedCommentId(id,operation,request,result),a);assert.equal(unresolvedCommentId(id,"reconcileDemoComment",a,success),"");assert.equal(unresolvedCommentId("","executeDemoComment",a,{ok:false,request_id:a,status:"BLOCKED_BEFORE_DISPATCH"}),"");assert.equal(unresolvedCommentId("","executeDemoComment",a,{...success,request_id:b}),a);assert.equal(commentResponse("executeDemoComment",a,{...success,request_id:b}).status,"UNKNOWN_OUTCOME_REVIEW");assert.equal(commentResponse("reconcileDemoComment",a,{...success,request_id:b}).status,"UNKNOWN_OUTCOME_REVIEW");assert.deepEqual(commentResponse("reconcileDemoComment",a,success),success)});

test("UI definite pre-dispatch rejection is not a new unknown outcome; later rejection cannot erase an old unknown",()=>{const a="a".repeat(64),b="b".repeat(64),r={ok:false,code:"WRITE_PERMISSION_DENIED"};assert.equal(unresolvedCommentId("","executeDemoComment",a,r),"");assert.equal(commentResponse("executeDemoComment",a,r).code,"WRITE_PERMISSION_DENIED");assert.equal(unresolvedCommentId(a,"reconcileDemoComment",a,r),a);assert.equal(unresolvedCommentId("","executeDemoComment",a,{...r,request_id:b}),a);assert.equal(unresolvedCommentId("","executeDemoComment",a,{ok:false,code:"WRITE_RESERVATION_CONFLICT_OR_UNKNOWN"}),a)});

import {requestDeadline} from "./request-state.js";
test("UI local approval deadline uses the shorter server deadline and refuses unknown timestamps",()=>{const request={expires_at:2000};assert.deepEqual(requestDeadline(request,{status:"AWAITING"},"APPROVED",1000),{ready:true,remaining:1000});assert.deepEqual(requestDeadline(request,{status:"APPROVED",expires_at:1500},"APPROVED",1000),{ready:true,remaining:500});assert.deepEqual(requestDeadline(request,{status:"APPROVED",expires_at:1500},"APPROVED",1500),{ready:false,remaining:0});assert.equal(requestDeadline(request,{status:"APPROVED"},"APPROVED",1000).ready,false);assert.equal(requestDeadline({expires_at:"2000"},null,"APPROVED",1000).ready,false)});

import {restoreUnresolvedComment} from "./request-state.js";
test("UI reload recovery restores exact pending comment ID from scoped journal",()=>{const id="a".repeat(64);assert.equal(restoreUnresolvedComment("",{status:"UNKNOWN_OUTCOME_REVIEW",request_id:id}),id);assert.equal(restoreUnresolvedComment("",{status:"HISTORICAL_OBSERVED_SUCCESS",request_id:id}),"");assert.equal(restoreUnresolvedComment("",{status:"UNKNOWN_OUTCOME_REVIEW",request_id:"invalid"}),"");assert.equal(restoreUnresolvedComment(id,{status:"UNKNOWN_OUTCOME_REVIEW",request_id:"b".repeat(64)}),id)});

import {overviewState} from "./overview-state.js";
test("UI overview preserves unknown counts, distinguishes preview and actual readback, prioritizes unresolved outcomes",()=>{const empty=overviewState({});assert.equal(empty.sourceCount,null);assert.equal(empty.unknownCount,null);assert.equal(empty.outcome.tone,"neutral");const preview={ok:true,evidence:{sources:[{}],unknown_count:0,coverage:"BOUNDED_READ_COMPLETE"},policy:{decision:"ALLOW_PREVIEW"}};const v=overviewState({preview});assert.equal(v.sourceCount,1);assert.equal(v.unknownCount,0);assert.equal(v.policy,"Preview only");assert.equal(v.outcome.tone,"neutral");const commentState={ok:true,status:"OBSERVED_SUCCESS",execution:"JIRA_COMMENT_READBACK_OBSERVED"};assert.equal(overviewState({commentState}).outcome.tone,"success");assert.equal(overviewState({commentState,unresolvedId:"pending"}).outcome.tone,"danger");assert.equal(overviewState({preview,savedStatus:{persisted_invalidation:true}}).policyTone,"danger");assert.equal(overviewState({commentState:{ok:true,status:"OBSERVED_SUCCESS"}}).outcome.tone,"neutral")});

import {inspectNeighbors} from "./graph-layout.js";
test("graph inspector traverses only actual direct edges and works independently of compact layout",()=>{const nodes=Array.from({length:81},(_,i)=>({id:String(i),label:"Node "+i})),edges=[{from_dependency:"0",to_dependent:"1",relation:"SOURCE"},{from_dependency:"1",to_dependent:"2",relation:"CHECK"},{from_dependency:"1",to_dependent:"missing",relation:"INVALID"}];assert.equal(layoutGraph(nodes,edges),null);assert.deepEqual(inspectNeighbors(nodes,edges,"1"),{incoming:[{id:"0",label:"Node 0",relation:"SOURCE"}],outgoing:[{id:"2",label:"Node 2",relation:"CHECK"}]});assert.deepEqual(inspectNeighbors(nodes,edges,"missing"),{incoming:[],outgoing:[]})});
test("overview does not substitute older issue evidence after an unsuccessful preview",()=>{assert.equal(overviewState({issue:{ok:true,evidence:{sources:[{}],unknown_count:0}},preview:{ok:false}}).sourceCount,null)});

import {countBreakdown,requestMatches,requestStage} from "./overview-state.js";
test("count comparisons never manufacture zero or percentages from missing counts",()=>{assert.equal(countBreakdown(null,3),null);assert.equal(countBreakdown(2,-1),null);assert.equal(countBreakdown(1,Infinity),null);assert.deepEqual(countBreakdown(0,0),{first:0,second:0,total:0,share:null});assert.deepEqual(countBreakdown(1,3),{first:1,second:3,total:4,share:25})});
test("request stage is bound to exact request, no green before readback",()=>{const request={request_id:"a".repeat(64)},approved={...request,ok:true,status:"COMMENT_APPROVED"},deadline={ready:true};assert.equal(requestMatches(request,approved),true);assert.equal(requestMatches(request,{...approved,request_id:"b".repeat(64)}),false);assert.equal(requestStage("comment",request,approved,deadline).label,"Approved · not executed");assert.equal(requestStage("comment",request,approved,{ready:false}).tone,"warning");const observed={...request,ok:true,status:"OBSERVED_SUCCESS",execution:"JIRA_COMMENT_READBACK_OBSERVED"};assert.equal(requestStage("comment",request,observed,deadline).tone,"success");assert.equal(requestStage("comment",request,{...observed,request_id:"b".repeat(64)},deadline).tone,"neutral");assert.equal(requestStage("comment",request,observed,deadline,request.request_id).tone,"danger");assert.equal(requestStage("report",request,{...request,ok:true,status:"READ_ONLY_REPORT_GENERATED",run_state:"SUCCEEDED"},deadline).tone,"neutral")});

test("overview report outcome requires generated status and exact-shaped request and report digests",()=>{const report={ok:true,status:"READ_ONLY_REPORT_GENERATED",run_state:"SUCCEEDED",request_id:"a".repeat(64),report_digest:"b".repeat(64)};assert.equal(overviewState({reportState:report}).outcome.tone,"observed");for(const patch of [{status:"AWAITING_READ_ONLY_APPROVAL"},{status:undefined},{request_id:undefined},{request_id:"invalid"},{report_digest:""},{report_digest:"invalid"},{run_state:"UNKNOWN"},{ok:false}])assert.equal(overviewState({reportState:{...report,...patch}}).outcome.tone,"neutral");assert.equal(overviewState({reportState:report,unresolvedId:"pending"}).outcome.tone,"danger")});

import {savedReviewResponse} from "./request-state.js";
test("review save and replacement retain prior lookup identity on denial or malformed response",()=>{const old="a".repeat(64),id="b".repeat(64),saved={ok:true,review_id:id,run_state:"POLICY_REVIEW"},good={ok:true,plan:{plan_hash:id},saved_review:saved,revalidated_from:old};assert.deepEqual(savedReviewResponse(old,good,true),{ok:true,id,saved});assert.deepEqual(savedReviewResponse(old,{ok:false,code:"DEVELOPMENT_DAILY_BUDGET_EXHAUSTED"}),{ok:false,id:old,code:"DEVELOPMENT_DAILY_BUDGET_EXHAUSTED"});for(const bad of [null,{...good,ok:false},{...good,plan:{plan_hash:old}},{...good,saved_review:{...saved,ok:false}},{...good,saved_review:{...saved,run_state:"SUCCEEDED"}},{...good,revalidated_from:id},{...good,plan:{plan_hash:old},saved_review:{...saved,review_id:old}}]){const v=savedReviewResponse(old,bad,true);assert.equal(v.ok,false);assert.equal(v.id,old);assert.equal(v.saved,undefined)}assert.equal(savedReviewResponse(old,good).ok,true)});

import {environmentReadiness} from "./request-state.js";
test("installation panel never claims development is enabled without positive server settings",()=>{for(const value of [null,undefined,{}, {ok:false,environment:"DEVELOPMENT"},{ok:true,environment:"PRODUCTION"},{ok:true,environment:"STAGING"},{ok:true,environment:"DISABLED"},{ok:true}])assert.equal(environmentReadiness(value).ready,false);assert.deepEqual(environmentReadiness({ok:true,environment:"DEVELOPMENT"}),{ready:true,code:"DEVELOPMENT_CONFIRMED"});assert.equal(environmentReadiness(null).code,"ENVIRONMENT_NOT_CONFIRMED");assert.equal(environmentReadiness({ok:true,environment:"DISABLED"}).code,"DEVELOPMENT_ENVIRONMENT_REQUIRED")});

import {budgetRetryAt} from "./request-state.js";
test("UI displays only a confirmed valid UTC admission reset",()=>{
 const at=Date.parse("2026-11-26T00:00:00.000Z"),r={ok:false,code:"DEVELOPMENT_DAILY_BUDGET_EXHAUSTED",retry_at:at};
 assert.equal(budgetRetryAt(r),at);for(const bad of [null,{...r,ok:true},{...r,code:"BACKEND_UNAVAILABLE"},{...r,retry_at:at+1},{...r,retry_at:0},{...r,retry_at:String(at)},{...r,retry_at:Infinity}])assert.equal(budgetRetryAt(bad),null);
});

import {describePreviewNodes} from "./graph-layout.js";
test("current proof graph shows exact claim/check provenance independent of node ordering",()=>{
 const nodes=[{id:"k",kind:"CHECK",ref:"hashed-check"},{id:"c2",kind:"CLAIM",ref:"claim2"},{id:"s",kind:"SOURCE",ref:"s1"},{id:"c1",kind:"CLAIM",ref:"claim1"},{id:"p",kind:"POLICY",ref:"plan"}],edges=[{from_dependency:"c1",to_dependent:"k",relation:"COMPARE_CLAIM"},{from_dependency:"c2",to_dependent:"k",relation:"COMPARE_CLAIM"}];
 const evidence={sources:[{source_ref:"s1",uri:"/browse/DEMO-1"},{source_ref:"s2",uri:"/browse/DEMO-2"}],claims:[{claim_id:"claim1",source_ref:"s1",subject:"REQ-1",predicate:"test.reported_result",value:"pass",status:"UNVERIFIED_CLAIM"},{claim_id:"claim2",source_ref:"s2",subject:"REQ-1",predicate:"test.reported_result",value:"fail",status:"UNVERIFIED_CLAIM"}]};
 const review={checks:[{claim_ids:["claim2","claim1"],subject:"REQ-1",predicate:"test.reported_result",status:"CONFLICT_FOUND",reason:"COMPARABLE_VALUES_DIFFER"}]},policy={decision:"REVIEW",reason:"CLAIM_CONFLICT"};
 const view=describePreviewNodes({nodes,edges},evidence,review,policy),byId=id=>view.find(n=>n.id===id);
 assert.equal(byId("k").state,"CONFLICT_FOUND");assert.equal(byId("k").label,"test.reported_result · REQ-1");assert.match(byId("c2").detail,/fail/);assert.equal(byId("s").label,"/browse/DEMO-1");assert.equal(byId("p").state,"POLICY_REVIEW");
 const denied=describePreviewNodes({nodes,edges},{...evidence,sources:evidence.sources.slice(0,1)},review,policy);assert.equal(denied.find(n=>n.id==="c2").state,"UNKNOWN_DETAILS");assert.equal(denied.find(n=>n.id==="k").state,"UNKNOWN_DETAILS");assert.equal(JSON.stringify(denied).includes("Reported value: fail"),false);
 assert.equal(describePreviewNodes({nodes,edges:edges.slice(0,1)},evidence,review,policy)[0].state,"UNKNOWN_DETAILS");
 assert.equal(describePreviewNodes({nodes,edges},evidence,{checks:[...review.checks,...review.checks]},policy)[0].state,"UNKNOWN_DETAILS");
});

import {preparedRequest,savedLookupResponse} from "./request-state.js";
test("prepared approval and saved lookup responses must belong to the exact selected review",()=>{
 const a="a".repeat(64),b="b".repeat(64),q="c".repeat(64),base={ok:true,review_id:a,request_id:q,expires_at:10000,authorization:"NONE"};
 const report={...base,status:"AWAITING_READ_ONLY_APPROVAL",effect:"READ_ONLY_REPORT",operations:[{operation:"report.evidence.generate",effect:"METADATA"}]},comment={...base,status:"AWAITING_COMMENT_APPROVAL",target:"HTF-2",comment:"Exact synthetic annotation"};
 assert.equal(preparedRequest("report",a,"HTF-2",report),report);assert.equal(preparedRequest("comment",a,"HTF-2",comment),comment);
 for(const patch of [{review_id:b},{review_id:undefined},{request_id:"bad"},{authorization:"APPROVED"},{expires_at:null},{status:"READ_ONLY_APPROVED"},{effect:"WRITE"},{operations:[]},{operations:[{operation:"unknown",effect:"WRITE"}]}])assert.equal(preparedRequest("report",a,"HTF-2",{...report,...patch}).ok,false);
 for(const patch of [{review_id:b},{target:"OTHER-1"},{target:undefined},{comment:""},{request_id:undefined},{authorization:"APPROVED"}])assert.equal(preparedRequest("comment",a,"HTF-2",{...comment,...patch}).ok,false);
 const recovery={ok:false,status:"UNKNOWN_OUTCOME_REVIEW",request_id:q};assert.equal(preparedRequest("comment",a,"HTF-2",recovery),recovery);
 assert.equal(savedLookupResponse(a,{ok:true,review_id:b}).ok,false);assert.equal(savedLookupResponse(a,{ok:true}).ok,false);assert.equal(savedLookupResponse(a,{ok:true,review_id:a}).ok,true);assert.equal(savedLookupResponse(a,null).ok,false);
});

import {evidenceDistribution} from "./overview-state.js";
test("evidence distribution preserves independent denominators and unknown status",()=>{
 const e={sources:[{status:"VERSION_OBSERVED"},{status:"UNVERIFIED_VERSION"},{status:"unexpected"}],unknown_count:9},r={checks:[{status:"SOURCE_OBSERVED"},{status:"UNVERIFIED_CLAIM"},{status:"CONFLICT_FOUND"},{status:"CONFLICT_FOUND"},{status:"unexpected"}]};
 const d=evidenceDistribution(e,r);assert.deepEqual(d.sources,{total:3,counts:{VERSION_OBSERVED:1,UNVERIFIED_VERSION:1,UNKNOWN:1}});assert.deepEqual(d.checks,{total:5,counts:{SOURCE_OBSERVED:1,UNVERIFIED_CLAIM:1,CONFLICT_FOUND:2,UNKNOWN:1}});
 assert.deepEqual(evidenceDistribution(null,null),{sources:null,checks:null});assert.equal(evidenceDistribution(e,{reason:"CLAIMS_UNKNOWN",checks:[]}).checks,null);assert.equal(evidenceDistribution({sources:[]},{checks:[]}).checks.total,0);
});

import {projectResponse,projectSampleCounts} from "./project-state.js";
test("dashboard does not turn malformed responses into observed sample counts",()=>{
 const now=Date.parse("2026-11-24T12:00:00Z"),row={review_id:"a".repeat(64),intent:"release-review",created_at:now-100,expires_at:now-100+86400000,source_count:2,comparison:"STALE_VERSION",journal_state:"REPORT_RECEIPT_VERIFIED",comment_state:"NO_COMMENT_ATTEMPT",invalidation:"PERSISTED_INVALIDATION",detail_read_limit_reached:false};
 const base={ok:true,scope:"CURRENT_ACTOR_SYNTHETIC_PROJECT_SAMPLE",project_key:"HTF",target:"HTF-2",observed_at:now,scan_limit:12,row_limit:3,scan_truncated:false,rows_truncated:false,withheld_count:0,rows:[row],authorization:"NONE",execution:"NO_JIRA_MUTATION"};
 assert.equal(projectResponse(base),base);assert.deepEqual(projectSampleCounts(base),{total:1,changed_or_invalidated:1,report_receipts:1,comment_observations:0,unconfirmed:0});
 for(const x of [{...base,rows:undefined},{...base,project_key:"OTHER"},{...base,rows:[row,row]},{...base,rows:[{...row,journal_state:"SUCCEEDED"}]},{...base,rows:[{...row,expires_at:now}]},{...base,authorization:"APPROVED"},{...base,withheld_count:12},{...base,observed_at:Infinity},{...base,rows:[{...row,detail_read_limit_reached:true}]},{...base,rows:[{...row,detail_read_limit_reached:"false"}]}]){assert.equal(projectResponse(x).ok,false);assert.equal(projectSampleCounts(x),null)}
 assert.deepEqual(projectSampleCounts({...base,rows:[]}),{total:0,changed_or_invalidated:0,report_receipts:0,comment_observations:0,unconfirmed:0});
});

import {verifyGeneratedReport} from "./report-integrity.js";
import {webcrypto,createHash as reportHash} from "node:crypto";
import {canonical as canonicalReport} from "../core/ir/plan.js";
test("generated report display requires exact review, request and independently computed content digest",async()=>{
 const review="a".repeat(64),request="b".repeat(64),report={schema_version:"hae.readonly.report.v1",review_id:review,status:"OBSERVED_NOT_INDEPENDENTLY_CERTIFIED",generated_at:Date.parse("2026-11-24T12:00:00Z"),sources:[{uri:"/browse/HTF-2",version:"2026-11-24T11:00:00Z",status:"VERSION_OBSERVED"}],checks:[],missing:[],policy:"cg-readonly-report-v1"};
 const result={ok:true,request_id:request,status:"READ_ONLY_REPORT_GENERATED",run_state:"SUCCEEDED",authorization:"CONSUMED",execution:"NO_JIRA_MUTATION",report,report_digest:reportHash("sha256").update(canonicalReport(report)).digest("hex")};
 const verified=await verifyGeneratedReport(review,request,result,webcrypto.subtle);assert.equal(verified.report_integrity,"SHA256_MATCH");assert.equal(verified.canonical_report,canonicalReport(report));
 for(const bad of [{...result,request_id:review},{...result,report:{...report,review_id:request}},{...result,report:{...report,missing:["tampered"]}},{...result,run_state:"RUNNING"},{...result,report_digest:"c".repeat(64)},{...result,ok:false}]){const rejected=await verifyGeneratedReport(review,request,bad,webcrypto.subtle);assert.equal(rejected.ok,false);assert.equal(rejected.report,undefined);assert.equal(rejected.canonical_report,undefined)}
 assert.equal((await verifyGeneratedReport(review,request,result,null)).code,"REPORT_CLIENT_DIGEST_UNAVAILABLE");assert.equal((await verifyGeneratedReport(review,request,result,{digest:async()=>{throw Error("unavailable")}})).code,"REPORT_CLIENT_DIGEST_UNKNOWN");
});

import {draftRepairHint} from "./request-state.js";
test("draft repair lookup never accepts unrelated or malformed success references",()=>{
 const id="a".repeat(64);assert.equal(draftRepairHint({ok:false,code:"REVIEW_JOURNAL_PARTIAL",repair_review_id:id}),id);
 assert.equal(draftRepairHint({ok:false,code:"REVIEW_DRAFT_REPAIR_OUTCOME_UNKNOWN",repair_review_id:id}),id);assert.equal(draftRepairHint({ok:false,code:"REVIEW_SNAPSHOT_CONFIRMED_JOURNAL_UNCHECKED",repair_review_id:id}),id);
 for(const r of [null,{ok:true,code:"REVIEW_JOURNAL_PARTIAL",repair_review_id:id},{ok:false,code:"REVIEW_JOURNAL_PARTIAL",repair_review_id:"bad"},{ok:false,code:"OTHER",repair_review_id:id}])assert.equal(draftRepairHint(r),"");
});

import {traceVisibleGraph} from "./graph-layout.js";
test("visible path explorer traces a diamond without treating unrelated branches as affected",()=>{
 const nodes=["a","b","c","d","e","f"].map(id=>({id})),edges=[["a","b"],["a","c"],["b","d"],["c","d"],["e","f"]].map(([from_dependency,to_dependent])=>({from_dependency,to_dependent,relation:"TEST"}));
 const before=JSON.stringify({nodes,edges}),up=traceVisibleGraph(nodes,edges,"d","upstream"),down=traceVisibleGraph(nodes,edges,"a","downstream");
 assert.deepEqual(up.nodeIds.sort(),["a","b","c","d"]);assert.deepEqual(down.nodeIds.sort(),["a","b","c","d"]);assert.deepEqual(down.edgeIndices.sort(),[0,1,2,3]);assert.deepEqual(traceVisibleGraph(nodes,edges,"e","upstream"),{nodeIds:["e"],edgeIndices:[]});assert.equal(JSON.stringify({nodes,edges}),before);
 for(const malformed of [[...edges,{from_dependency:"d",to_dependent:"a"}],[...edges,edges[0]],[...edges,{from_dependency:"a",to_dependent:"missing"}]])assert.equal(traceVisibleGraph(nodes,malformed,"a","downstream"),null);
 assert.equal(traceVisibleGraph(nodes,edges,"missing","upstream"),null);assert.equal(traceVisibleGraph(nodes,edges,"a","both"),null);
 const large=Array.from({length:620},(_,i)=>({id:String(i)})),chain=large.slice(1).map((n,i)=>({from_dependency:String(i),to_dependent:n.id,relation:"LINK"}));assert.equal(traceVisibleGraph(large,chain,"0","downstream").nodeIds.length,620);assert.equal(traceVisibleGraph([...large,{id:"extra"}],chain,"0","downstream"),null);
});

import {projectSampleRows} from "./project-state.js";
test("project worklist filters use exactly the same observed sample as indicators",()=>{
 const now=Date.parse("2026-11-24T12:00:00Z"),row={review_id:"a".repeat(64),intent:"release-review",created_at:now-100,expires_at:now-100+86400000,source_count:2,comparison:"STALE_VERSION",journal_state:"REPORT_RECEIPT_VERIFIED",comment_state:"NO_COMMENT_ATTEMPT",invalidation:"PERSISTED_INVALIDATION",detail_read_limit_reached:false};
 const base={ok:true,scope:"CURRENT_ACTOR_SYNTHETIC_PROJECT_SAMPLE",project_key:"HTF",target:"HTF-2",observed_at:now,scan_limit:12,row_limit:3,scan_truncated:true,rows_truncated:false,withheld_count:1,rows:[row,{...row,review_id:"b".repeat(64),comparison:"CURRENT_OBSERVED",journal_state:"POLICY_REVIEW",comment_state:"HISTORICAL_OBSERVED_SUCCESS",invalidation:"NO_MARKER_OBSERVED"},{...row,review_id:"c".repeat(64),comparison:"CURRENT_OBSERVED",journal_state:"RUNNING",invalidation:"NOT_ESTABLISHED"}],authorization:"NONE",execution:"NO_JIRA_MUTATION"};
 const before=JSON.stringify(base),counts=projectSampleCounts(base);
 for(const [filter,count] of [["all",counts.total],["changed",counts.changed_or_invalidated],["reports",counts.report_receipts],["comments",counts.comment_observations],["unresolved",counts.unconfirmed]])assert.equal(projectSampleRows(base,filter).length,count);
 assert.deepEqual(projectSampleRows(base,"changed").map(x=>x.review_id),[row.review_id]);assert.equal(projectSampleRows(base,"constructor"),null);assert.equal(projectSampleRows({...base,rows:undefined},"all"),null);assert.equal(JSON.stringify(base),before);
});

import {workbenchGuide} from "./overview-state.js";
test("workbench navigation prioritizes unresolved outcomes and stale reviews without claiming completion",()=>{
 const id="a".repeat(64),request="b".repeat(64),context={ok:true,key:"HTF-2"},savedStatus={ok:true,review_id:id,run_state:"POLICY_REVIEW"},base={context,reviewId:id,savedStatus};
 assert.equal(workbenchGuide({context}).next,"issue");assert.equal(workbenchGuide({context,reviewId:id}).next,"saved");assert.equal(workbenchGuide(base).next,"report");
 assert.equal(workbenchGuide({...base,savedStatus:{...savedStatus,persisted_invalidation:true}}).next,"saved");
 assert.equal(workbenchGuide({...base,savedStatus:{...savedStatus,receipt_status:"UNCONFIRMED"}}).next,"history");
 assert.equal(workbenchGuide({...base,unresolvedId:request,savedStatus:{...savedStatus,persisted_invalidation:true}}).next,"comment");
 const reportRequest={review_id:id,request_id:request},reportState={ok:true,request_id:request,status:"READ_ONLY_APPROVED"};
 assert.equal(workbenchGuide({...base,reportRequest,reportState,reportDeadline:{ready:true}}).steps.find(s=>s.key==="report").label,"Approved · not executed");
 assert.equal(workbenchGuide({...base,reportRequest:{...reportRequest,review_id:"c".repeat(64)},reportState}).steps.find(s=>s.key==="report").label,"Not prepared");
 assert.equal(workbenchGuide({context:{key:"OTHER-1"}}).steps.some(s=>s.key==="comment"),false);
});

import {sourceNavigationPath,openObservedSource} from "./source-navigation.js";
test("source navigation accepts only the observed Jira and Confluence relative reference formats",async()=>{
 const jira="/browse/HTF-2",wiki="/wiki/pages/viewpage.action?pageId=12345",opened=[];
 for(const path of [jira,wiki]){assert.equal(sourceNavigationPath(path),path);assert.equal((await openObservedSource(path,async p=>opened.push(p))).ok,true)}
 for(const path of ["https://example.com","//example.com","/browse/../admin","/browse/HTF-2?next=x","/browse/HTF-2#x","/browse/HTF-0","/wiki/pages/viewpage.action?pageId=1&redirect=x","/wiki/pages/viewpage.action?pageId=0","/browse/HTF-2\n","javascript:alert(1)",null]){assert.equal(sourceNavigationPath(path),null);assert.equal((await openObservedSource(path,async p=>opened.push(p))).ok,false)}
 assert.deepEqual(opened,[jira,wiki]);assert.equal((await openObservedSource(jira,async()=>{throw Error("bridge")})).code,"SOURCE_NAVIGATION_UNAVAILABLE");
});

import {claimExplorer} from "./claim-explorer.js";
test("claim explorer filters only currently returned cited checks and rejects unknown provenance",()=>{
 const a="a".repeat(64),b="b".repeat(64),e={sources:[{source_ref:a,uri:"/browse/HTF-2"},{source_ref:b,uri:"/browse/HTF-3"}]},checks=[{subject:"REQ-1",predicate:"test.reported_result",values:["pass","fail"],status:"CONFLICT_FOUND",source_refs:[a,b]},{subject:b,predicate:"jira.status",values:["Open"],status:"SOURCE_OBSERVED",source_refs:[b]}],review={checks};
 const all=claimExplorer(e,review);assert.equal(all.total,2);assert.equal(all.counts.CONFLICT_FOUND,1);assert.equal(claimExplorer(e,review,"CONFLICT_FOUND",a,"fail").rows.length,1);assert.equal(claimExplorer(e,review,"SOURCE_OBSERVED",a).rows.length,0);assert.equal(all.rows[1].subject,"/browse/HTF-3");
 for(const bad of [{checks:[{...checks[0],source_refs:["hidden"]}]},{checks:[checks[0],checks[0]]},{checks,reason:"CLAIMS_UNKNOWN"}])assert.equal(claimExplorer(e,bad),null);
 assert.equal(claimExplorer(e,review,"all","hidden"),null);assert.equal(claimExplorer(e,review,"unknown"),null);
});

import {revisionView} from "./revision-view.js";
test("revision filters preserve observed source counts and reject contradictory metadata",()=>{
 const old="2026-11-24T11:00:00.000Z",now="2026-11-24T11:05:00.000Z",row={uri:"/browse/HTF-2",saved_version:old,current_version:now,state:"CHANGED",content_changed:true,revision_changed:true},same={...row,uri:"/browse/HTF-3",current_version:old,state:"UNCHANGED",content_changed:false,revision_changed:false},fresh={...row,uri:"/browse/HTF-4",saved_version:null,state:"NEW_DEPENDENCY",content_changed:null,revision_changed:null};
 const data={status:"STALE_VERSION",rows:[row,same,fresh]};assert.equal(revisionView(data).total,3);assert.equal(revisionView(data,"changed").rows.length,2);assert.deepEqual(revisionView(data,"unchanged").rows,[same]);
 for(const bad of [{...data,status:"CURRENT_OBSERVED"},{...data,rows:[row,row]},{...data,rows:[{...same,content_changed:true}]},{...data,rows:[{...fresh,revision_changed:false}]},{...data,rows:[{...row,current_version:"unknown"}]}])assert.equal(revisionView(bad),null);
 assert.equal(revisionView(data,"other"),null);assert.equal(revisionView(null),null);
});

import {visibleNodeSearch} from "./graph-layout.js";
test("graph node lookup retains original topology and supports large recorded graphs",()=>{
 const nodes=[{id:"a",label:"Jira HTF-2",kind:"SOURCE",state:"CURRENTLY_REOBSERVED"},{id:"b",label:"Historical receipt",kind:"RECEIPT",state:"HISTORICAL_RECEIPT_CHAIN"},{id:"c",label:"Typed policy",kind:"POLICY",state:"STALE_AT_INVALIDATION"}];const original=JSON.stringify(nodes);
 assert.deepEqual(visibleNodeSearch(nodes,"receipt").matches,[nodes[1]]);assert.deepEqual(visibleNodeSearch(nodes,"STALE","POLICY").matches,[nodes[2]]);assert.equal(visibleNodeSearch(nodes,"receipt","SOURCE").matches.length,0);assert.equal(visibleNodeSearch(nodes,"","missing"),null);assert.equal(visibleNodeSearch([...nodes,nodes[0]],""),null);assert.equal(JSON.stringify(nodes),original);
 const large=Array.from({length:620},(_,i)=>({id:String(i),label:"Node "+i,kind:"CHECK"}));assert.equal(visibleNodeSearch(large,"","CHECK").matches.length,620);assert.equal(visibleNodeSearch([...large,{id:"extra",label:"extra",kind:"CHECK"}],""),null);
});

import {reportContentShape} from "./report-integrity.js";
import {unresolvedReports} from "./request-state.js";
test("matching report hash is insufficient when report citations or rendered schema are malformed",async()=>{
 const review="a".repeat(64),request="b".repeat(64),uri="/browse/HTF-2",report={schema_version:"hae.readonly.report.v1",review_id:review,status:"OBSERVED_NOT_INDEPENDENTLY_CERTIFIED",generated_at:Date.parse("2026-11-24T12:00:00Z"),sources:[{uri,version:"2026-11-24T11:00:00Z",status:"VERSION_OBSERVED"}],checks:[{subject:uri,predicate:"jira.status",values:["Open"],status:"SOURCE_OBSERVED",reason:"OBSERVED_FIELD",source_uris:[uri]}],missing:[],policy:"cg-readonly-report-v1"};
 assert.equal(reportContentShape(report),true);
 for(const bad of [{...report,checks:[{...report.checks[0],source_uris:["/browse/HIDDEN-1"]}]},{...report,checks:[{...report.checks[0],values:null}]},{...report,sources:[report.sources[0],report.sources[0]]},{...report,release_assessment:{requirements:null}},{...report,missing:[{}]}]){
  const result={ok:true,request_id:request,status:"READ_ONLY_REPORT_GENERATED",run_state:"SUCCEEDED",authorization:"CONSUMED",execution:"NO_JIRA_MUTATION",report:bad,report_digest:reportHash("sha256").update(canonicalReport(bad)).digest("hex")};
  assert.equal((await verifyGeneratedReport(review,request,result,webcrypto.subtle)).code,"REPORT_CONTENT_SCHEMA_UNCONFIRMED");
 }
});
test("session report recovery guard is per review and retains unrelated ambiguous references",()=>{
 const a="a".repeat(64),b="b".repeat(64),receipt={ok:true,review_id:a,status:"HISTORICAL_REPORT_RECEIPT_RECOVERED",run_state:"SUCCEEDED",authorization:"NONE",execution:"NO_JIRA_MUTATION",report_digest:b};
 assert.deepEqual(unresolvedReports([],"generateReadOnlyReport",a,null),[a]);
 assert.deepEqual(unresolvedReports([a],"generateReadOnlyReport",b,{code:"REPORT_REVIEW_STALE_OR_EXPIRED"}),[a]);
 assert.deepEqual(unresolvedReports([a],"generateReadOnlyReport",b,null),[a,b]);
 assert.deepEqual(unresolvedReports([a,b],"recoverSavedReport",b,receipt),[a,b]);
 assert.deepEqual(unresolvedReports([a,b],"recoverSavedReport",a,{...receipt,report_digest:"bad"}),[a,b]);
 assert.deepEqual(unresolvedReports([a,b],"recoverSavedReport",a,receipt),[b]);
 assert.deepEqual(unresolvedReports([],"generateReadOnlyReport",a,{report_integrity:"SHA256_MATCH"}),[]);
});


test("P2 saved review reload restores only its exact unresolved report guard",()=>{
 const a="a".repeat(64),b="b".repeat(64),r={ok:true,review_id:a,run_state:"REPORT_OUTCOME_REVIEW_REQUIRED",receipt_status:"UNCONFIRMED"};
 assert.deepEqual(unresolvedReports([],"refreshSavedReview",a,r),[a]);
 assert.deepEqual(unresolvedReports([b],"refreshSavedReview",a,r),[b,a]);
 assert.deepEqual(unresolvedReports([a],"refreshSavedReview",a,r),[a]);
 assert.deepEqual(unresolvedReports([],"refreshSavedReview",b,r),[]);
 assert.deepEqual(unresolvedReports([],"refreshSavedReview",a,{...r,ok:false}),[]);
 assert.deepEqual(unresolvedReports([a],"refreshSavedReview",a,{...r,run_state:"SUCCEEDED",receipt_status:"HISTORICAL_REPORT_RECEIPT_VERIFIED"}),[a]);
});
