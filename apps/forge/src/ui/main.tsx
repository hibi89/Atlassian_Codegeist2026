import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@forge/bridge";
import "./styles.css";
import {GraphExplorer} from "./GraphExplorer";
import {overviewState} from "./overview-state.js";
import {createRequestGate,unresolvedCommentId,commentResponse,requestDeadline,restoreUnresolvedComment} from "./request-state.js";
type Draft = { title: string; steps: string[]; status: string; authorization: string };
type Issue = { key: string; summary: string; status: string; issueType: string; updatedAt: string | null };
type TypedPlan = { plan_hash:string; steps:{step_id:string;op_id:string;side_effect:string;predecessor_ids:string[]}[] };
type ReleaseAssessment={status:string;unmatched_tests?:{subject:string;values:string[];status:string;source_refs:string[]}[];requirements:{requirement:string;state:string;source_refs:string[]}[];missing_predicates:string[];document_status:string;source_count:number;unknown_count:number|null;conflicts:{predicate:string;subject:string;sources:string[]}[]};
type SafetySettings={ok:boolean;synthetic_readiness?:string;synthetic_storage_ready?:boolean;environment?:string;daily_admitted_actions?:number;external_ai_config_ready?:boolean;model?:string;external_attempts_per_utc_day?:number;max_output_tokens?:number;max_record_bytes?:number;retention_hours?:number;document_page_configured?:boolean;billing?:string;paid_fallback?:string};
type Evidence = { document_status?:string;coverage:string; unknown_count:number; sources:{source_ref:string;uri:string;version:string|null;status:string;status_reason?:string;retrieved_at?:string;freshness_deadline?:string}[] };
type Graph = {ok:boolean;code?:string;status?:string;coverage?:string;graph_revision?:string;nodes?:{id:string;kind:string;ref:string}[];edges?:{from_dependency:string;to_dependent:string;relation:string}[]};
type ReviewMetadata={classification:string;record_bytes:number;record_digest:string;graph_revision:string;source_count:number;node_count:number;edge_count:number;expires_at:number;raw_originals:string};
type CommentResult={ok:boolean;observation_digest?:string;lineage?:{base_graph_revision:string;nodes:{kind:string;id:string}[];edges:{relation:string}[]};request_id?:string;target?:string;comment?:string;expires_at?:number;status?:string;code?:string;comment_id?:string;receipt_digest?:string;http_status?:number;execution?:string};
type ReportResult={ok:boolean;run_state?:string;lineage?:{graph_revision:string;nodes:{kind:string;id:string}[];edges:{relation:string}[]};request_id?:string;status?:string;code?:string;effect?:string;expires_at?:number;operations?:{operation:string;effect:string}[];report?:{status:string;sources:{uri:string;version:string;status:string}[];checks:{predicate:string;values:string[];status:string}[];missing:string[];release_assessment?:ReleaseAssessment};report_digest?:string};
type SourceComparison={status:string;rows:{uri:string;saved_version:string|null;current_version:string|null;state:string;content_changed:boolean|null;revision_changed:boolean|null}[]};
type HistoricalGraph={source_comparison?:SourceComparison|null;ok:boolean;status?:string;code?:string;nodes?:{id:string;kind:string;label:string;state:string}[];edges?:{from_dependency:string;to_dependent:string;relation:string}[];metadata?:{record_bytes:number;record_digest:string;graph_revision:string;expires_at:number;source_count:number;node_count:number;edge_count:number}};
type SavedReview = {ok:boolean;report_digest?:string;revalidation?:{reused:number;recomputed:number};comment_journal?:{status:string;request_id?:string};metadata?:ReviewMetadata;review_id?:string;expires_at?:number;run_state?:string;status?:string;code?:string;affected_count?:number|null;unaffected_count?:number|null;persisted_invalidation?:boolean};
type Result = { release_assessment?:ReleaseAssessment;provider?:{mode:string;reason:string;external_attempted:boolean;synthetic_only:boolean;model:string};revalidation?:{reused:number;recomputed:number};revalidated_from?:string;saved_review?:SavedReview;graph?:Graph; impact_summary?:{status:string;code?:string;affected_count?:number;unaffected_count?:number;stale_approval_count?:number}; claim_review?:{status:string;reason:string;missing_predicates?:string[];checks:{subject:string;predicate:string;values:string[];status:string;reason?:string;source_refs?:string[]}[]}; evidence?:Evidence|null; freshness?:{status:string;reason:string;changed:string[];unchanged?:string[];unknown?:string[];changed_count?:number;unchanged_count?:number;unknown_count?:number}; policy?:{decision:string;reason:string;execution:string;authorization?:string;policy_version?:string;graph_status?:string}; plan?:TypedPlan; ok: boolean; code?: string; key?: string; issueKey?: string; draft?: Draft; snapshot?: Issue; source?: { version: string | null; status: string } };
const labels: Record<string,string> = {
  DEMO_SITE_NOT_CONFIGURED:"The owner must configure the verified development site before saving or executing synthetic reviews.", DEMO_SITE_MISMATCH:"This Jira installation is not the configured demo site.", SYNTHETIC_ISSUE_REQUIRED:"Open the synthetic HTF-2 issue to use saved reviews and approved actions.", DEVELOPMENT_ENVIRONMENT_REQUIRED:"Only the approved development environment is enabled.", SYNTHETIC_DEMO_SCOPE_REQUIRED:"This action requires the configured synthetic issue and demo site.", DEVELOPMENT_BUDGET_DAY_CHANGED:"UTC day changed during reservation. This action was not admitted.",
  AUTH_REQUIRED:"Sign in to Jira to continue.", DEVELOPMENT_DAILY_BUDGET_EXHAUSTED:"Daily development request limit reached. No new action was admitted.", DEVELOPMENT_BUDGET_CONFLICT_OR_UNKNOWN:"Request budget could not be safely reserved. No action was admitted.", DEVELOPMENT_STORAGE_ONLY:"This operation is disabled outside the approved development environment.", BACKEND_UNAVAILABLE:"TrustFlow could not connect to its backend. Reload the issue or contact the developer.", AUTH_CONTEXT_REQUIRED:"The authenticated installation context is unavailable.", ISSUE_CONTEXT_REQUIRED:"Open TrustFlow from a Jira issue.",
  SOURCE_ACCESS_UNKNOWN:"Current user access could not be verified.", SOURCE_NOT_VISIBLE_OR_MISSING:"Issue is missing or not visible to you.",
  JIRA_RATE_LIMITED:"Jira rate limit reached. Try again later.", JIRA_UNAVAILABLE:"Jira is temporarily unavailable.",
  JIRA_RESPONSE_INVALID:"Jira returned an unexpected response.", JIRA_RESPONSE_TOO_LARGE:"Jira response exceeded the safe limit.",
  JIRA_READ_UNAVAILABLE:"The Jira read could not be completed.", UNSUPPORTED_INTENT:"Choose one of the three supported intents. No action was taken."
};
function msg(code?: string){return labels[code||""] || "Request failed or could not be confirmed. Check the action status before continuing.";}

function ReleasePanel({assessment}:{assessment:ReleaseAssessment}){
 return <section aria-label="Release evidence assessment"><h4>Release assurance · read-only</h4><p role="status">{assessment.status}</p><p>Sources: {assessment.source_count} · Unknown reads: {assessment.unknown_count??"Unknown"} · Confluence: {assessment.document_status}</p><p>Missing reported fields: {assessment.missing_predicates.join(", ")||"None reported"}</p>
 {assessment.requirements.length>0&&<table><thead><tr><th scope="col">Requirement</th><th scope="col">Observed test state</th><th scope="col">Authorized sources</th></tr></thead><tbody>{assessment.requirements.map(r=><tr key={r.requirement}><td>{r.requirement}</td><td>{r.state}</td><td>{r.source_refs.join(", ")||"Unknown"}</td></tr>)}</tbody></table>}
 {!!assessment.unmatched_tests?.length&&<><h5>Reported tests without matching requirement</h5><ul>{assessment.unmatched_tests.map(t=><li key={t.subject}>{t.subject} · {t.values.join(" / ")} · {t.status} · {t.source_refs.join(", ")||"Unknown source"}</li>)}</ul></>}
 {assessment.conflicts.length>0&&<ul>{assessment.conflicts.map((c,i)=><li key={i}>{c.predicate}: {c.subject} · {c.sources.join(", ")}</li>)}</ul>}<p>No release certification or Jira mutation is granted.</p></section>
}
function EvidencePanel({result}:{result:Result}){
  const evidence=result.evidence;
  const freshness=result.freshness;
  const review=result.claim_review;
  const policy=result.policy;
  const sources=evidence?.sources??[];
  const visible=new Map(sources.map(s=>[s.source_ref,s.uri]));
  const sourceNames=(refs:string[]|undefined)=> (refs??[]).map(id=>visible.get(id)??"Unavailable source").join(", ")||"No source available";
  return <section aria-label="Evidence and policy details">
    <h4 className="module-heading"><span className="module-index">01</span>TruthGate 2.0 · observed evidence</h4>{evidence?.document_status&&<p>Confluence evidence: {evidence.document_status}</p>}
    {!evidence?<p role="status">Evidence unavailable or not yet observed. No verification is implied.</p>:<>
      <div className="section-head"><StatusChip tone={evidence.coverage==="BOUNDED_READ_COMPLETE"?"observed":"warning"}>{evidence.coverage}</StatusChip><span>{evidence.unknown_count} unknown reads</span></div>
      {evidence.coverage!=="BOUNDED_READ_COMPLETE"&&<p role="alert">Coverage is incomplete. Unavailable source details are not displayed.</p>}
      {sources.length===0?<p>No visible sources returned.</p>:<ul className="source-grid">{sources.map(s=><li className="source-card" key={s.source_ref}><strong>{s.uri}</strong><dl><dt>Observation</dt><dd>{s.status} · {s.status_reason??"Reason unknown"}</dd><dt>Version</dt><dd>{s.version??"Unknown version"}</dd><dt>Observed at</dt><dd>{s.retrieved_at??"Unknown"}</dd><dt>Freshness deadline</dt><dd>{s.freshness_deadline??"Unknown"}</dd></dl></li>)}</ul>}
    </>}
    <h4>Source re-read</h4>
    {freshness?<><p role="status">{freshness.status} · {freshness.reason}</p><dl><dt>Changed</dt><dd>{freshness.changed_count??freshness.changed.length} · {sourceNames(freshness.changed)}</dd><dt>Unchanged observations</dt><dd>{freshness.unchanged_count??freshness.unchanged?.length??"Unknown"} · {sourceNames(freshness.unchanged)}</dd><dt>Unknown</dt><dd>{freshness.unknown_count??freshness.unknown?.length??"Unknown"} · {sourceNames(freshness.unknown)}{(freshness.unknown_count??0)>(freshness.unknown?.length??0)?" · Inaccessible identities withheld":""}</dd></dl><p className="muted">A matching re-read is not an execution approval or future freshness guarantee.</p></>:<p>Freshness not established.</p>}
    <h4>Claim comparisons</h4>
    {!review?<p>Claim review unavailable.</p>:<><p role="status">{review.status} · {review.reason}</p>{review.checks.length===0?<p>No comparable claims returned.</p>:<ul>{review.checks.map(c=><li key={JSON.stringify([c.subject,c.predicate])}><strong>{c.predicate}</strong> · {c.status}<dl><dt>Subject</dt><dd>{visible.get(c.subject)??(c.predicate.startsWith("jira.")?"Observed Jira issue":c.subject)}</dd><dt>Reported values</dt><dd>{c.values.join(" / ")||"Unknown"}</dd><dt>Visible sources</dt><dd>{sourceNames(c.source_refs)}</dd><dt>Reason</dt><dd>{c.reason??"Unknown"}</dd></dl></li>)}</ul>}{!!review.missing_predicates?.length&&<p>Missing reported fields: {review.missing_predicates.join(", ")}</p>}<p className="muted">Reported labels do not independently certify a test or policy.</p></>}
    <h4 className="module-heading"><span className="module-index">02</span>SovereignGuard 2.0 · policy</h4>
    {policy?<><div className="section-head"><StatusChip tone={policy.decision==="REVIEW"?"warning":policy.decision==="DENY"?"danger":"neutral"}>{policy.decision}</StatusChip><span>{policy.reason}</span></div><dl><dt>Policy version</dt><dd>{policy.policy_version??"Unknown"}</dd><dt>Authorization</dt><dd>{policy.authorization??"Not established"}</dd><dt>Execution</dt><dd>{policy.execution}</dd><dt>Graph</dt><dd>{policy.graph_status??"Not established"}</dd></dl></>:<p>Policy decision unavailable.</p>}
  </section>;
}

function ProofGraphPanel({result}:{result:Result}){
  const g=result.graph;
  if(!g?.ok||!g.nodes||!g.edges)return <section aria-label="ProofGraph"><h4>ProofGraph</h4><p role="status">{g?.code??"Graph not available"} · No execution authorization.</p></section>;
  const sourceNames=new Map((result.evidence?.sources??[]).map(s=>[s.source_ref,s.uri]));
  const labels=new Map(g.nodes.map((n,i)=>[n.id,n.kind==="SOURCE"?(sourceNames.get(n.ref)??"Observed source"):n.kind+" "+(i+1)]));
  return <section aria-label="ProofGraph"><h4 className="module-heading"><span className="module-index">03</span>ProofGraph · observed lineage</h4><p>{g.nodes.length} nodes · {g.edges.length} dependencies · {g.coverage}</p>
    <p className="muted">Current review snapshot only. This preview is not an approval. Inspect saved lineage for historical receipts.</p>
    {result.impact_summary&&<div role="status"><h5>Observed change impact</h5><p>{result.impact_summary.status} {result.impact_summary.code??""}</p>{result.impact_summary.status!=="HOLD"&&<dl><dt>Affected prior nodes</dt><dd>{result.impact_summary.affected_count}</dd><dt>Unaffected prior nodes</dt><dd>{result.impact_summary.unaffected_count}</dd></dl>}<p>Observational comparison only; no persisted invalidation or approval grant.</p></div>}
    <GraphExplorer key={g.graph_revision??"preview"} nodes={g.nodes.map(n=>({id:n.id,kind:n.kind,label:labels.get(n.id)??n.kind}))} edges={g.edges}/><details><summary>Dependency table</summary><table><thead><tr><th scope="col">Dependency</th><th scope="col">Relation</th><th scope="col">Dependent</th></tr></thead><tbody>{g.edges.map((e,i)=><tr key={i}><td>{labels.get(e.from_dependency)??"Unknown"}</td><td>{e.relation}</td><td>{labels.get(e.to_dependent)??"Unknown"}</td></tr>)}</tbody></table></details>
  </section>;
}
function RevisionComparison({comparison,stale}:{comparison?:SourceComparison|null;stale:boolean}){
 return <div className="revision-comparison"><h4>Saved vs currently observed sources</h4>
 {stale&&<p className="invalidation-notice" role="status">This saved review was invalidated. Matching source revisions now do not restore the previous approval.</p>}
 {!comparison?<p className="muted">Comparison is not established. No missing or unauthorized source identities are shown.</p>:<><StatusChip tone={comparison.status==="STALE_VERSION"?"warning":"observed"}>{comparison.status}</StatusChip><div className="revision-list">{comparison.rows.map((r,i)=><div className="revision-card" key={r.uri+":"+i}><div className="section-head"><strong>{r.uri}</strong><StatusChip tone={r.state==="UNCHANGED"?"neutral":"warning"}>{r.state}</StatusChip></div><div className="revision-pair"><div><span>Saved version</span><code>{r.saved_version??"Not in saved review"}</code></div><div><span>Current observed version</span><code>{r.current_version??"Unknown"}</code></div></div><p className="muted">Content changed: {r.content_changed===null?"Not comparable":String(r.content_changed)} · Revision changed: {r.revision_changed===null?"Not comparable":String(r.revision_changed)}</p></div>)}</div><p className="muted">Observed source metadata only. This comparison is not a fresh approval or a future freshness guarantee.</p></>}
 </div>
}
function StatusChip({children,tone="neutral"}:{children:React.ReactNode;tone?:string}){
 return <span className={"status-chip tone-"+tone}>{children}</span>;
}
function Overview({state}:{state:ReturnType<typeof overviewState>}){
 return <div className="overview-grid" aria-label="Current session overview">
  <div className="overview-tile"><span className="metric-label">Visible sources</span><strong className="metric-value">{state.sourceCount??"—"}</strong><span className="metric-detail">{state.coverage}</span></div>
  <div className="overview-tile"><span className="metric-label">Unknown reads</span><strong className="metric-value">{state.unknownCount??"—"}</strong><span className="metric-detail">Not a confidence score</span></div>
  <div className="overview-tile"><span className="metric-label">Policy</span><StatusChip tone={state.policyTone}>{state.policy}</StatusChip><span className="metric-detail">Server decides authority</span></div>
  <div className="overview-tile"><span className="metric-label">Observed outcome</span><StatusChip tone={state.outcome.tone}>{state.outcome.label}</StatusChip><span className="metric-detail">Current session only</span></div>
 </div>;
}
function App(){
  const [context,setContext]=useState<Result|null>(null);
  const [issue,setIssue]=useState<Result|null>(null);
  const [intent,setIntent]=useState("Review this change");
  const [preview,setPreview]=useState<Result|null>(null);
  const [busy,setBusy]=useState(false);
  const [reviewId,setReviewId]=useState("");
  const [savedStatus,setSavedStatus]=useState<SavedReview|null>(null);
  const [reportState,setReportState]=useState<ReportResult|null>(null);
  const [reportRequest,setReportRequest]=useState<ReportResult|null>(null);
  const [commentRequest,setCommentRequest]=useState<CommentResult|null>(null);
  const [commentState,setCommentState]=useState<CommentResult|null>(null);
  const [commentId,setCommentId]=useState("");
  const [history,setHistory]=useState<HistoricalGraph|null>(null);
  const [safety,setSafety]=useState<SafetySettings|null>(null);
  const [provider,setProvider]=useState("template");const [fixture,setFixture]=useState("change");const [consent,setConsent]=useState(false);
  const gate=useRef(createRequestGate());
  const [unresolvedId,setUnresolvedId]=useState("");
  const [localNow,setLocalNow]=useState(()=>Date.now());
  useEffect(()=>{if(!reportRequest&&!commentRequest)return;setLocalNow(Date.now());const timer=window.setInterval(()=>setLocalNow(Date.now()),1000);return()=>window.clearInterval(timer)},[reportRequest,commentRequest]);
  const reportDeadline=requestDeadline(reportRequest,reportState,"READ_ONLY_APPROVED",localNow),commentDeadline=requestDeadline(commentRequest,commentState,"COMMENT_APPROVED",localNow);
  useEffect(()=>{let alive=true;invoke<SafetySettings>("getSafetySettings").then(v=>{if(alive)setSafety(v)}).catch(()=>{if(alive)setSafety({ok:false})});invoke<Result>("getPanelContext").then(v=>{if(alive)setContext(v)}).catch(()=>{if(alive)setContext({ok:false,code:"BACKEND_UNAVAILABLE"})});return()=>{alive=false}},[]);
  async function loadIssue(){
    const token=gate.current.begin();if(token===null)return;setBusy(true);setIssue(null);setPreview(null);setHistory(null);setReportState(null);setReportRequest(null);setCommentRequest(null);setCommentState(null);setSavedStatus(null);setReviewId("");setCommentId("");
    try{const v=await invoke<Result>("readCurrentIssue");if(gate.current.current(token))setIssue(v)}
    catch{if(gate.current.current(token))setIssue({ok:false,code:"JIRA_READ_UNAVAILABLE"})}
    finally{if(gate.current.end(token))setBusy(false)}
  }
  async function createPreview(e:React.FormEvent){
    e.preventDefault();const token=gate.current.begin();if(token===null)return;setBusy(true);setPreview(null);
    try{const v=await invoke<Result>("previewIntent",{intent});if(gate.current.current(token))setPreview(v)}
    catch{if(gate.current.current(token))setPreview({ok:false,code:"BACKEND_UNAVAILABLE"})}
    finally{if(gate.current.end(token))setBusy(false)}
  }
  async function saveReview(){
    const token=gate.current.begin();if(token===null)return;setBusy(true);setReviewId("");setSavedStatus(null);setHistory(null);setReportState(null);setReportRequest(null);setCommentRequest(null);setCommentState(null);setCommentId("");setPreview(null);
    try{const result=await invoke<Result>("saveCurrentReview",{intent});if(gate.current.current(token)){setPreview(result);if(result.saved_review){setReviewId(result.saved_review.review_id??"");setSavedStatus(result.saved_review)}}}
    catch{if(gate.current.current(token))setSavedStatus({ok:false,code:"BACKEND_UNAVAILABLE"})}
    finally{if(gate.current.end(token))setBusy(false)}
  }
  async function recheckReview(){
    const token=gate.current.begin();if(token===null)return;setBusy(true);setSavedStatus(null);setHistory(null);setReportState(null);setReportRequest(null);setCommentRequest(null);setCommentState(null);setCommentId("");setPreview(null);setIssue(null);
    try{const result=await invoke<SavedReview>("refreshSavedReview",{review_id:reviewId});if(gate.current.current(token)){setSavedStatus(result);if(result.comment_journal?.request_id)setCommentId(result.comment_journal.request_id);setUnresolvedId(old=>restoreUnresolvedComment(old,result.comment_journal))}}
    catch{if(gate.current.current(token))setSavedStatus({ok:false,code:"BACKEND_UNAVAILABLE"})}
    finally{if(gate.current.end(token))setBusy(false)}
  }
  async function reportAction(operation:"prepareReadOnlyReport"|"approveReadOnlyReport"|"generateReadOnlyReport"|"revokeReadOnlyReport"){
    if((operation==="approveReadOnlyReport"||operation==="generateReadOnlyReport")&&!requestDeadline(reportRequest,reportState,"READ_ONLY_APPROVED",Date.now()).ready)return;
    const token=gate.current.begin();if(token===null)return;setBusy(true);
    try{
      const requestId=reportRequest?.request_id;
      const result=await invoke<ReportResult>(operation,operation==="prepareReadOnlyReport"?{review_id:reviewId}:{request_id:requestId,expected_digest:requestId});
      if(gate.current.current(token)){setReportState(result);if(operation==="prepareReadOnlyReport")setReportRequest(result.ok?result:null);}
    }catch{if(gate.current.current(token))setReportState({ok:false,code:"BACKEND_UNAVAILABLE"})}
    finally{if(gate.current.end(token))setBusy(false)}
  }
  async function commentAction(operation:"prepareDemoComment"|"approveDemoComment"|"executeDemoComment"|"revokeDemoComment"|"reconcileDemoComment"){
    if(unresolvedId&&operation!=="reconcileDemoComment")return;
    if((operation==="approveDemoComment"||operation==="executeDemoComment")&&!requestDeadline(commentRequest,commentState,"COMMENT_APPROVED",Date.now()).ready)return;
    const token=gate.current.begin();if(token===null)return;setBusy(true);
    if(operation==="prepareDemoComment"){setCommentRequest(null);setCommentState(null);setCommentId("");}
    const id=operation==="reconcileDemoComment"?commentId:commentRequest?.request_id;
    try{
      const result=await invoke<CommentResult>(operation,operation==="prepareDemoComment"?{review_id:reviewId}:{request_id:id,expected_digest:id});
      if(gate.current.current(token)){setCommentState(commentResponse(operation,result));setUnresolvedId(old=>unresolvedCommentId(old,operation,id??"",result));if(operation==="prepareDemoComment"){if(result.ok)setCommentRequest(result);if(result.request_id)setCommentId(result.request_id);setUnresolvedId(old=>restoreUnresolvedComment(old,result));}}
    }catch{if(gate.current.current(token)){setCommentState({ok:false,code:"BACKEND_UNAVAILABLE",status:operation==="executeDemoComment"?"UNKNOWN_OUTCOME_REVIEW":"REQUEST_UNAVAILABLE"});setUnresolvedId(old=>unresolvedCommentId(old,operation,id??"",null));}}
    finally{if(gate.current.end(token))setBusy(false)}
  }
  async function revalidateReview(){
    const token=gate.current.begin();if(token===null)return;setBusy(true);setPreview(null);setHistory(null);setReportRequest(null);setReportState(null);setCommentRequest(null);setCommentState(null);setCommentId("");
    try{const v=await invoke<Result>("revalidateSavedReview",{review_id:reviewId});if(gate.current.current(token)){setPreview(v);if(v.ok&&v.saved_review){setReviewId(v.saved_review.review_id??"");setSavedStatus({...v.saved_review,revalidation:v.revalidation})}else setSavedStatus({ok:false,code:v.code})}}
    catch{if(gate.current.current(token))setSavedStatus({ok:false,code:"REVALIDATION_UNAVAILABLE"})}
    finally{if(gate.current.end(token))setBusy(false)}
  }
  async function recoverReportReceipt(){
    const token=gate.current.begin();if(token===null)return;setBusy(true);setSavedStatus(null);setHistory(null);setReportRequest(null);setReportState(null);
    try{const result=await invoke<SavedReview>("recoverSavedReport",{review_id:reviewId});if(gate.current.current(token))setSavedStatus(result)}
    catch{if(gate.current.current(token))setSavedStatus({ok:false,code:"REPORT_RECOVERY_UNAVAILABLE"})}
    finally{if(gate.current.end(token))setBusy(false)}
  }
  async function loadHistory(){
    const token=gate.current.begin();if(token===null)return;setBusy(true);setHistory(null);
    try{const v=await invoke<HistoricalGraph>("readSavedGraph",{review_id:reviewId});if(gate.current.current(token))setHistory(v)}
    catch{if(gate.current.current(token))setHistory({ok:false,code:"HISTORY_UNAVAILABLE"})}
    finally{if(gate.current.end(token))setBusy(false)}
  }
  async function providerPreview(){
    const token=gate.current.begin();if(token===null)return;setBusy(true);setPreview(null);
    try{const v=await invoke<Result>("runSyntheticProvider",{provider,fixture,consent});if(gate.current.current(token))setPreview(v)}
    catch{if(gate.current.current(token))setPreview({ok:false,code:"BACKEND_UNAVAILABLE"})}
    finally{if(gate.current.end(token))setBusy(false)}
  }
  const overview=overviewState({context,issue,preview,savedStatus,commentState,reportState,unresolvedId,busy});
  return <main className="shell" aria-busy={busy}><header className="hero"><div className="hero-top"><div className="brand"><span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 40 40" width="30" height="30"><path d="M20 4 34 11v10c0 8-7 13-14 16C13 34 6 29 6 21V11z" fill="none" stroke="currentColor" strokeWidth="2"/><path d="m12 20 5 5 11-12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg></span><div><div className="eyebrow">HAE / LA · TRUSTFLOW</div><h1>Decision assurance</h1></div></div><span className="environment-tag">{safety?.ok?safety.environment:"Environment unknown"}</span></div><p>Know why. Approve what. Revalidate what changes.</p><div className="hero-flow" aria-label="Workflow concept"><span>01 Evidence</span><span>02 Policy</span><span>03 Approval</span><span>04 Read-back</span></div></header>
    {context?.ok&&<><Overview state={overview}/><nav className="section-nav" aria-label="Review workspace"><a href="#issue-heading">Issue</a><a href="#review-workspace">Review</a><a href="#saved-workspace">Saved review</a><a href="#lineage-workspace">ProofGraph</a><a href="#report-workspace">Report</a>{context.key==="HTF-2"&&<a href="#comment-workspace">Execution</a>}<a href="#settings-workspace">Settings</a></nav></>}
    <div className="notice" role="status">Development environment. Drafts are not verified or approved. Only a configured synthetic demo issue may receive an explicitly approved comment. External AI is off by default; only an explicitly qualified synthetic fixture can be sent.</div>
    {!context?<p role="status">Loading issue context…</p>:!context.ok?<p role="alert">{msg(context.code)}</p>:<>
      <section aria-labelledby="issue-heading"><div className="section-head"><h2 id="issue-heading">Current issue · {context.key}</h2><button type="button" disabled={busy} onClick={loadIssue}>Read Jira</button></div>
      {!issue?<p>Read the current issue using your Jira access.</p>:issue.ok&&issue.snapshot?<><h3>{issue.snapshot.summary}</h3><dl><dt>Status</dt><dd>{issue.snapshot.status}</dd><dt>Type</dt><dd>{issue.snapshot.issueType}</dd><dt>Source version</dt><dd>{issue.source?.version||"Unknown"}</dd></dl><p className="muted">Observed source metadata; not proof of completion.</p>{issue.evidence&&<><h4>TruthGate evidence</h4><p>{issue.evidence.coverage} · {issue.evidence.unknown_count} unknown reads</p><ul>{issue.evidence.sources.map(s=><li key={s.source_ref}><code>{s.uri}</code> · {s.status} · {s.version||"Unknown version"}</li>)}</ul></>}</>:<p role="alert">{msg(issue.code)}</p>}</section>
      <section id="review-workspace" className="review-workspace"><div className="workspace-kicker">REVIEW WORKSPACE</div><h2>Start a review</h2><p className="muted">Choose a supported workflow, then inspect the evidence and plan before requesting approval.</p><div className="choices">{[{title:"Review this change",detail:"Evidence freshness and bounded change review",id:"A"},{title:"Coordinate incident",detail:"Ownership and policy conflicts",id:"B"},{title:"Review release",detail:"Reported tests and release evidence",id:"C"}].map(t=><button className="workflow-choice" type="button" key={t.title} onClick={()=>{setIntent(t.title);setPreview(null)}} disabled={busy} aria-pressed={intent===t.title}><span className="workflow-id">{t.id}</span><strong>{t.title}</strong><small>{t.detail}</small></button>)}</div>
        <form onSubmit={createPreview}><label htmlFor="intent">Supported natural-language intent</label><input id="intent" maxLength={300} value={intent} disabled={busy} onChange={e=>{setIntent(e.target.value);setPreview(null)}}/><button disabled={busy||!intent.trim()} type="submit">Preview review</button></form>
        {preview&&!preview.ok&&<p role="alert">{msg(preview.code)}</p>}
        {preview?.ok&&preview.draft&&<article aria-live="polite"><div className="draft-heading"><div><div className="eyebrow">DRAFT · NO EXECUTION AUTHORITY</div><h3>{preview.draft.title}</h3></div><StatusChip tone={preview.policy?.decision==="REVIEW"?"warning":preview.policy?.decision==="DENY"?"danger":"neutral"}>{preview.policy?.decision??"Not assessed"}</StatusChip></div><ol>{preview.draft.steps.map(step=><li key={step}>{step}</li>)}</ol>{preview.plan&&<><h4>Validated draft operations</h4><ol className="operation-flow">{preview.plan.steps.map(s=><li key={s.step_id}><div><code>{s.op_id}</code><small>{s.predecessor_ids.length?`After ${s.predecessor_ids.join(", ")}`:"Start of plan"} · {s.step_id}</small></div><StatusChip>{s.side_effect}</StatusChip></li>)}</ol><p className="muted">Draft digest: <code>{preview.plan.plan_hash}</code></p></>}<EvidencePanel result={preview}/><ProofGraphPanel result={preview}/>{preview.release_assessment&&<ReleasePanel assessment={preview.release_assessment}/>} {preview.provider&&<p role="status">Provider: {preview.provider.mode} · {preview.provider.reason} · External attempted: {String(preview.provider.external_attempted)}</p>}<p>Authorization: none. No execution is available.</p></article>}
        <section id="saved-workspace" aria-label="Saved development review" className="workspace-panel"><h3>Saved review · development only</h3>{!safety?.synthetic_storage_ready&&<p role="status">{safety?.synthetic_readiness?msg(safety.synthetic_readiness):"Saved review readiness is unavailable. Check development configuration."}</p>}<p>Save a fresh review with source hashes and lineage metadata for 24 hours. No Jira issue is modified. Use synthetic demo issues only.</p><button type="button" disabled={busy||!intent.trim()||!safety?.synthetic_storage_ready} onClick={saveReview}>Save fresh review</button><label htmlFor="saved-id">Saved review ID</label><input id="saved-id" maxLength={64} value={reviewId} onChange={e=>{setReviewId(e.target.value);setSavedStatus(null);setHistory(null);setReportState(null);setReportRequest(null);setCommentRequest(null);setCommentState(null);setCommentId("")}} disabled={busy}/><button type="button" disabled={busy||!safety?.synthetic_storage_ready||!/^[a-f0-9]{64}$/.test(reviewId)} onClick={recheckReview}>Recheck saved review</button>{savedStatus&&<div role="status">{savedStatus.ok?<><p>{savedStatus.status??"REVIEW_SAVED"} · {savedStatus.run_state??"State unknown"}</p>{savedStatus.expires_at&&<p>Expires {new Date(savedStatus.expires_at).toLocaleString()}</p>}{savedStatus.affected_count!==undefined&&<p>Affected nodes: {savedStatus.affected_count??"Unknown"} · Unaffected nodes: {savedStatus.unaffected_count??"Unknown"}</p>}{savedStatus.metadata&&<details><summary>DataPassport metadata inspector</summary><dl><dt>Classification</dt><dd>{savedStatus.metadata.classification}</dd><dt>Stored snapshot bytes</dt><dd>{savedStatus.metadata.record_bytes}</dd><dt>Sources / nodes / edges</dt><dd>{savedStatus.metadata.source_count} / {savedStatus.metadata.node_count} / {savedStatus.metadata.edge_count}</dd><dt>Snapshot digest</dt><dd><code>{savedStatus.metadata.record_digest}</code></dd><dt>Graph revision</dt><dd><code>{savedStatus.metadata.graph_revision}</code></dd><dt>Retention</dt><dd>{new Date(savedStatus.metadata.expires_at).toLocaleString()}</dd><dt>Original content</dt><dd>{savedStatus.metadata.raw_originals}</dd></dl><p>Capacity shown is this snapshot only, not total database size.</p></details>}{savedStatus.comment_journal&&<p>Comment journal: {savedStatus.comment_journal.status}. Historical success is not a current Jira read-back.</p>}{savedStatus.report_digest&&<p>Recovered historical report digest: <code>{savedStatus.report_digest}</code></p>}{savedStatus.revalidation&&<p>Freshly authorized checks reused: {savedStatus.revalidation.reused} · Recomputed: {savedStatus.revalidation.recomputed}</p>}{savedStatus.persisted_invalidation&&<><p>Saved review invalidated. Create a new review. No approval or execution granted.</p><button type="button" disabled={busy} onClick={revalidateReview}>Revalidate affected checks and create new draft</button></>}</>:<p>{savedStatus.code??"REVIEW_UNAVAILABLE"} · Review unavailable. Previous execution status is not established by this response.</p>}</div>}</section>
        <section id="lineage-workspace" aria-label="Historical proof graph" className="workspace-panel"><h3>Saved lineage explorer</h3><p>Current access is rechecked before historical metadata is shown. Historical receipts are observations, not a current authorization.</p><button type="button" disabled={busy||!safety?.synthetic_storage_ready||!/^[a-f0-9]{64}$/.test(reviewId)} onClick={loadHistory}>Inspect saved graph and receipts</button><button type="button" disabled={busy||!safety?.synthetic_storage_ready||!/^[a-f0-9]{64}$/.test(reviewId)} onClick={recoverReportReceipt}>Recover existing report receipt</button><p className="muted">Recovery checks existing receipts only; it does not generate a report again.</p>
        {history&&!history.ok&&<p role="alert">{history.code??"HISTORY_UNAVAILABLE"}</p>}
        {history?.ok&&<><p role="status">{history.status} · {history.nodes?.length} nodes · {history.edges?.length} links</p><RevisionComparison comparison={history.source_comparison} stale={history.status==="HISTORICAL_STALE"}/>{history.nodes&&history.edges&&<GraphExplorer key={reviewId} nodes={history.nodes} edges={history.edges}/>}<details><summary>Nodes and recorded state</summary><table><thead><tr><th scope="col">Node</th><th scope="col">State</th></tr></thead><tbody>{history.nodes?.map(n=><tr key={n.id}><td>{n.label}</td><td>{n.state}</td></tr>)}</tbody></table></details><details><summary>Historical dependency table</summary><table><thead><tr><th scope="col">Dependency</th><th scope="col">Relation</th><th scope="col">Dependent</th></tr></thead><tbody>{history.edges?.map((e,i)=><tr key={i}><td>{history.nodes?.find(n=>n.id===e.from_dependency)?.label??"Unknown"}</td><td>{e.relation}</td><td>{history.nodes?.find(n=>n.id===e.to_dependent)?.label??"Unknown"}</td></tr>)}</tbody></table></details>{history.metadata&&<p>Snapshot digest: <code>{history.metadata.record_digest}</code> · {history.metadata.record_bytes} bytes</p>}</>}
        </section>
        <section id="report-workspace" aria-label="Read-only report approval" className="workspace-panel"><h3>Approve a read-only evidence report</h3><p>Only report generation is approved. No Jira mutation, no external AI. The exact saved plan, evidence and policy are rechecked at each stage. Development storage requests are capped at 24 per installation per UTC day.</p>
          <button type="button" disabled={busy||!safety?.synthetic_storage_ready||!/^[a-f0-9]{64}$/.test(reviewId)} onClick={()=>reportAction("prepareReadOnlyReport")}>Prepare read-only report</button>
          {reportRequest?.ok&&<><p>Exact request digest: <code>{reportRequest.request_id}</code></p>{["AWAITING_READ_ONLY_APPROVAL","READ_ONLY_APPROVED"].includes(reportState?.status??"")&&<p role="status">{reportDeadline.ready?`Local remaining time: ${Math.ceil((reportDeadline.remaining??0)/1000)}s`:"Local deadline expired or unavailable. Prepare a fresh request; server authorization is independently checked."}</p>}<ol>{reportRequest.operations?.map((s,i)=><li key={i}>{s.operation} · {s.effect}</li>)}</ol><button type="button" disabled={busy||!reportDeadline.ready||reportState?.status!=="AWAITING_READ_ONLY_APPROVAL"} onClick={()=>reportAction("approveReadOnlyReport")}>Approve this report only</button><button type="button" disabled={busy||!reportDeadline.ready||reportState?.status!=="READ_ONLY_APPROVED"} onClick={()=>reportAction("generateReadOnlyReport")}>Generate approved report</button><button type="button" disabled={busy||reportState?.status!=="READ_ONLY_APPROVED"} onClick={()=>reportAction("revokeReadOnlyReport")}>Revoke approval</button></>}
          {reportState&&<div role="status"><p>{reportState.status??reportState.code??"REPORT_UNAVAILABLE"}</p>{reportState.report&&<><p>{reportState.report.status}</p><ul>{reportState.report.sources.map(s=><li key={s.uri}>{s.uri} · {s.version} · {s.status}</li>)}</ul><ul>{reportState.report.checks.map((c,i)=><li key={i}>{c.predicate}: {c.values.join(" / ")} · {c.status}</li>)}</ul><p>Missing reported fields: {reportState.report.missing.join(", ")||"None reported"}</p>{reportState.report.release_assessment&&<ReleasePanel assessment={reportState.report.release_assessment}/>}<p>Report digest: <code>{reportState.report_digest}</code></p><p>Run state: {reportState.run_state}</p>{reportState.lineage&&<p>Persisted lineage: {reportState.lineage.nodes.map(n=>n.kind).join(" → ")} · {reportState.lineage.edges.length} links</p>}</>}</div>}
        </section>
        {context.key==="HTF-2"&&<section id="comment-workspace" aria-label="Synthetic Jira comment approval" className="workspace-panel">
          <h3>Guarded demo comment</h3><p>One non-certifying annotation to the configured synthetic issue only. Required reported requirement, linked test and policy labels must be present; incident coordination also needs ownership evidence. Review the exact text, approve it, then execute. Source changes or permission loss block execution. A timeout must be reconciled; never retry a write blindly.</p>
          {unresolvedId&&<div role="alert"><p>Previous comment outcome is unresolved. Do not prepare or execute a replacement. Reconcile this exact request first.</p><code>{unresolvedId}</code><button type="button" disabled={busy} onClick={()=>setCommentId(unresolvedId)}>Use unresolved request ID</button></div>}
          <button type="button" disabled={busy||!safety?.synthetic_storage_ready||!!unresolvedId||!/^[a-f0-9]{64}$/.test(reviewId)} onClick={()=>commentAction("prepareDemoComment")}>Prepare demo comment</button>
          {commentRequest?.ok&&<><dl><dt>Target issue</dt><dd>{commentRequest.target}</dd><dt>Exact comment</dt><dd><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{commentRequest.comment}</pre></dd><dt>Request digest</dt><dd><code>{commentRequest.request_id}</code></dd><dt>Request expires</dt><dd>{commentRequest.expires_at?new Date(commentRequest.expires_at).toLocaleString():"Unknown"}</dd></dl>{["AWAITING_COMMENT_APPROVAL","COMMENT_APPROVED"].includes(commentState?.status??"")&&<p role="status">{commentDeadline.ready?`Local remaining time: ${Math.ceil((commentDeadline.remaining??0)/1000)}s`:"Local deadline expired or unavailable. Prepare a fresh request if no previous execution is unresolved."}</p>}
            <button type="button" disabled={busy||!!unresolvedId||!commentDeadline.ready||commentState?.status!=="AWAITING_COMMENT_APPROVAL"} onClick={()=>commentAction("approveDemoComment")}>Approve exact Jira comment</button>
            <button type="button" disabled={busy||!!unresolvedId||!commentDeadline.ready||commentState?.status!=="COMMENT_APPROVED"} onClick={()=>commentAction("executeDemoComment")}>Execute approved comment</button>
            <button type="button" disabled={busy||!!unresolvedId||commentState?.status!=="COMMENT_APPROVED"} onClick={()=>commentAction("revokeDemoComment")}>Revoke comment approval</button></>}
          <label htmlFor="comment-request-id">Comment request ID for read-only reconciliation</label><input id="comment-request-id" value={commentId} maxLength={64} disabled={busy} onChange={e=>setCommentId(e.target.value)}/>
          <button type="button" disabled={busy||!safety?.synthetic_storage_ready||!/^[a-f0-9]{64}$/.test(commentId)} onClick={()=>commentAction("reconcileDemoComment")}>Reconcile observed comment</button>
          {commentState&&<div role="status"><p>{commentState.status??commentState.code??"REQUEST_UNKNOWN"}</p>{commentState.code&&<p>{commentState.code}</p>}{commentState.comment_id&&<p>Observed comment ID: {commentState.comment_id}</p>}{commentState.receipt_digest&&<p>Receipt digest: <code>{commentState.receipt_digest}</code></p>}{commentState.observation_digest&&<p>Read-back digest: <code>{commentState.observation_digest}</code></p>}{commentState.lineage&&<p>Persisted lineage: {commentState.lineage.nodes.map(n=>n.kind).join(" → ")} · {commentState.lineage.edges.length} links</p>}{commentState.status==="UNKNOWN_OUTCOME_REVIEW"&&<p>Do not submit a replacement comment. Reconcile this request first.</p>}</div>}
        </section>}
      </section>
      <section id="settings-workspace" aria-label="Cost and provider controls" className="settings-section"><h2>Usage and data transfer controls</h2>
      {safety?.ok?<><p>Environment: {safety.environment} · Daily admitted actions: {safety.daily_admitted_actions} · External requests: {safety.external_attempts_per_utc_day} per UTC day · Paid fallback: {safety.paid_fallback}</p><p>Storage record cap: {safety.max_record_bytes} bytes · Retention: {safety.retention_hours} hours · Confluence fixture: {safety.document_page_configured?"Configured":"Not configured"}</p><p>External model: {safety.external_ai_config_ready?"Configured for synthetic opt-in":"OFF / not qualified"} · Billing must be checked in owner consoles; limits are not a platform spending guarantee. <a href="https://developer.atlassian.com/console/myapps/" target="_blank" rel="noreferrer">Forge developer console</a> · <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer">Google AI Studio</a>.</p></>:<p>Usage settings unavailable.</p>}
      {context.key==="HTF-2"&&<><h3>Synthetic provider comparison</h3><p>Only a fixed fictional sentence is sent to the selected provider. Jira/Confluence data, account and issue identifiers are never sent.</p><label htmlFor="provider-choice">Provider</label><select id="provider-choice" value={provider} disabled={busy} onChange={e=>{setProvider(e.target.value);setConsent(false)}}><option value="template">Deterministic template (no external AI)</option><option value="gemini" disabled={!safety?.external_ai_config_ready}>Gemini synthetic classifier</option></select><label htmlFor="provider-fixture">Synthetic fixture</label><select id="provider-fixture" value={fixture} disabled={busy} onChange={e=>{setFixture(e.target.value);setConsent(false)}}><option value="change">Change</option><option value="incident">Incident</option><option value="release">Release</option></select>{provider==="gemini"&&<label><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/> Send fixed fictional text only if free project is qualified</label>}<button type="button" disabled={busy||!safety?.synthetic_storage_ready||(provider==="gemini"&&(!consent||!safety?.external_ai_config_ready))} onClick={providerPreview}>Preview with selected provider</button></>}
      </section>
    </>}
    {busy&&<div className="request-progress" role="status"><span className="progress-dot" aria-hidden="true"/>Request in progress…</div>}
  </main>
}
const el=document.getElementById("root");
if(!el)throw new Error("Missing root");
createRoot(el).render(<App/>);
