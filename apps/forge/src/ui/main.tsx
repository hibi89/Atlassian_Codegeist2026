import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@forge/bridge";
import "./styles.css";
type Draft = { title: string; steps: string[]; status: string; authorization: string };
type Issue = { key: string; summary: string; status: string; issueType: string; updatedAt: string | null };
type TypedPlan = { plan_hash:string; steps:{step_id:string;op_id:string;side_effect:string;predecessor_ids:string[]}[] };
type Evidence = { coverage:string; unknown_count:number; sources:{source_ref:string;uri:string;version:string|null;status:string;status_reason?:string;retrieved_at?:string;freshness_deadline?:string}[] };
type Graph = {ok:boolean;code?:string;status?:string;coverage?:string;graph_revision?:string;nodes?:{id:string;kind:string;ref:string}[];edges?:{from_dependency:string;to_dependent:string;relation:string}[]};
type ReviewMetadata={classification:string;record_bytes:number;record_digest:string;graph_revision:string;source_count:number;node_count:number;edge_count:number;expires_at:number;raw_originals:string};
type CommentResult={ok:boolean;observation_digest?:string;lineage?:{base_graph_revision:string;nodes:{kind:string;id:string}[];edges:{relation:string}[]};request_id?:string;target?:string;comment?:string;expires_at?:number;status?:string;code?:string;comment_id?:string;receipt_digest?:string;http_status?:number;execution?:string};
type ReportResult={ok:boolean;run_state?:string;lineage?:{graph_revision:string;nodes:{kind:string;id:string}[];edges:{relation:string}[]};request_id?:string;status?:string;code?:string;effect?:string;expires_at?:number;operations?:{operation:string;effect:string}[];report?:{status:string;sources:{uri:string;version:string;status:string}[];checks:{predicate:string;values:string[];status:string}[];missing:string[]};report_digest?:string};
type SavedReview = {ok:boolean;comment_journal?:{status:string;request_id?:string};metadata?:ReviewMetadata;review_id?:string;expires_at?:number;run_state?:string;status?:string;code?:string;affected_count?:number|null;unaffected_count?:number|null;persisted_invalidation?:boolean};
type Result = { saved_review?:SavedReview;graph?:Graph; impact_summary?:{status:string;code?:string;affected_count?:number;unaffected_count?:number;stale_approval_count?:number}; claim_review?:{status:string;reason:string;missing_predicates?:string[];checks:{subject:string;predicate:string;values:string[];status:string;reason?:string;source_refs?:string[]}[]}; evidence?:Evidence|null; freshness?:{status:string;reason:string;changed:string[];unchanged?:string[];unknown?:string[]}; policy?:{decision:string;reason:string;execution:string;authorization?:string;policy_version?:string;graph_status?:string}; plan?:TypedPlan; ok: boolean; code?: string; key?: string; issueKey?: string; draft?: Draft; snapshot?: Issue; source?: { version: string | null; status: string } };
const labels: Record<string,string> = {
  AUTH_REQUIRED:"Sign in to Jira to continue.", BACKEND_UNAVAILABLE:"TrustFlow could not connect to its backend. Reload the issue or contact the developer.", AUTH_CONTEXT_REQUIRED:"The authenticated installation context is unavailable.", ISSUE_CONTEXT_REQUIRED:"Open TrustFlow from a Jira issue.",
  SOURCE_ACCESS_UNKNOWN:"Current user access could not be verified.", SOURCE_NOT_VISIBLE_OR_MISSING:"Issue is missing or not visible to you.",
  JIRA_RATE_LIMITED:"Jira rate limit reached. Try again later.", JIRA_UNAVAILABLE:"Jira is temporarily unavailable.",
  JIRA_RESPONSE_INVALID:"Jira returned an unexpected response.", JIRA_RESPONSE_TOO_LARGE:"Jira response exceeded the safe limit.",
  JIRA_READ_UNAVAILABLE:"The Jira read could not be completed.", UNSUPPORTED_INTENT:"Choose one of the three supported intents. No action was taken."
};
function msg(code?: string){return labels[code||""] || "Request failed. No write was attempted.";}

function EvidencePanel({result}:{result:Result}){
  const evidence=result.evidence;
  const freshness=result.freshness;
  const review=result.claim_review;
  const policy=result.policy;
  const sources=evidence?.sources??[];
  const visible=new Map(sources.map(s=>[s.source_ref,s.uri]));
  const sourceNames=(refs:string[]|undefined)=> (refs??[]).map(id=>visible.get(id)??"Unavailable source").join(", ")||"No source available";
  return <section aria-label="Evidence and policy details">
    <h4>TruthGate · observed evidence</h4>
    {!evidence?<p role="status">Evidence unavailable or not yet observed. No verification is implied.</p>:<>
      <p role="status">{evidence.coverage} · {evidence.unknown_count} unknown reads</p>
      {evidence.coverage!=="BOUNDED_READ_COMPLETE"&&<p role="alert">Coverage is incomplete. Unavailable source details are not displayed.</p>}
      {sources.length===0?<p>No visible sources returned.</p>:<ul>{sources.map(s=><li key={s.source_ref}><strong>{s.uri}</strong><dl><dt>Observation</dt><dd>{s.status} · {s.status_reason??"Reason unknown"}</dd><dt>Version</dt><dd>{s.version??"Unknown version"}</dd><dt>Observed at</dt><dd>{s.retrieved_at??"Unknown"}</dd><dt>Freshness deadline</dt><dd>{s.freshness_deadline??"Unknown"}</dd></dl></li>)}</ul>}
    </>}
    <h4>Source re-read</h4>
    {freshness?<><p role="status">{freshness.status} · {freshness.reason}</p><dl><dt>Changed</dt><dd>{freshness.changed.length} · {sourceNames(freshness.changed)}</dd><dt>Unchanged observations</dt><dd>{freshness.unchanged?.length??"Unknown"} · {sourceNames(freshness.unchanged)}</dd><dt>Unknown</dt><dd>{freshness.unknown?.length??"Unknown"} · {sourceNames(freshness.unknown)}</dd></dl><p className="muted">A matching re-read is not an execution approval or future freshness guarantee.</p></>:<p>Freshness not established.</p>}
    <h4>Claim comparisons</h4>
    {!review?<p>Claim review unavailable.</p>:<><p role="status">{review.status} · {review.reason}</p>{review.checks.length===0?<p>No comparable claims returned.</p>:<ul>{review.checks.map(c=><li key={JSON.stringify([c.subject,c.predicate])}><strong>{c.predicate}</strong> · {c.status}<dl><dt>Subject</dt><dd>{visible.get(c.subject)??(c.predicate.startsWith("jira.")?"Observed Jira issue":c.subject)}</dd><dt>Reported values</dt><dd>{c.values.join(" / ")||"Unknown"}</dd><dt>Visible sources</dt><dd>{sourceNames(c.source_refs)}</dd><dt>Reason</dt><dd>{c.reason??"Unknown"}</dd></dl></li>)}</ul>}{!!review.missing_predicates?.length&&<p>Missing reported fields: {review.missing_predicates.join(", ")}</p>}<p className="muted">Reported labels do not independently certify a test or policy.</p></>}
    <h4>SovereignGuard · policy</h4>
    {policy?<><p role="status">{policy.decision} · {policy.reason}</p><dl><dt>Policy version</dt><dd>{policy.policy_version??"Unknown"}</dd><dt>Authorization</dt><dd>{policy.authorization??"Not established"}</dd><dt>Execution</dt><dd>{policy.execution}</dd><dt>Graph</dt><dd>{policy.graph_status??"Not established"}</dd></dl></>:<p>Policy decision unavailable.</p>}
  </section>;
}

function ProofGraphPanel({result}:{result:Result}){
  const g=result.graph;
  if(!g?.ok||!g.nodes||!g.edges)return <section aria-label="ProofGraph"><h4>ProofGraph</h4><p role="status">{g?.code??"Graph not available"} · No execution authorization.</p></section>;
  const sourceNames=new Map((result.evidence?.sources??[]).map(s=>[s.source_ref,s.uri]));
  const labels=new Map(g.nodes.map((n,i)=>[n.id,n.kind==="SOURCE"?(sourceNames.get(n.ref)??"Observed source"):n.kind+" "+(i+1)]));
  return <section aria-label="ProofGraph"><h4>ProofGraph · observed lineage</h4><p>{g.nodes.length} nodes · {g.edges.length} dependencies · {g.coverage}</p>
    <p className="muted">Current review snapshot only. Historical receipts, approval and execution are not enabled.</p>
    {result.impact_summary&&<div role="status"><h5>Observed change impact</h5><p>{result.impact_summary.status} {result.impact_summary.code??""}</p>{result.impact_summary.status!=="HOLD"&&<dl><dt>Affected prior nodes</dt><dd>{result.impact_summary.affected_count}</dd><dt>Unaffected prior nodes</dt><dd>{result.impact_summary.unaffected_count}</dd></dl>}<p>Observational comparison only; no persisted invalidation or approval grant.</p></div>}
    <details><summary>Dependency table</summary><table><thead><tr><th scope="col">Dependency</th><th scope="col">Relation</th><th scope="col">Dependent</th></tr></thead><tbody>{g.edges.map((e,i)=><tr key={i}><td>{labels.get(e.from_dependency)??"Unknown"}</td><td>{e.relation}</td><td>{labels.get(e.to_dependent)??"Unknown"}</td></tr>)}</tbody></table></details>
  </section>;
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
  const serial=useRef(0);
  useEffect(()=>{let alive=true;invoke<Result>("getPanelContext").then(v=>{if(alive)setContext(v)}).catch(()=>{if(alive)setContext({ok:false,code:"BACKEND_UNAVAILABLE"})});return()=>{alive=false}},[]);
  async function loadIssue(){
    const token=++serial.current;setBusy(true);setIssue(null);setPreview(null);
    try{const v=await invoke<Result>("readCurrentIssue");if(token===serial.current)setIssue(v)}
    catch{if(token===serial.current)setIssue({ok:false,code:"JIRA_READ_UNAVAILABLE"})}
    finally{if(token===serial.current)setBusy(false)}
  }
  async function createPreview(e:React.FormEvent){
    e.preventDefault();const token=++serial.current;setBusy(true);setPreview(null);
    try{const v=await invoke<Result>("previewIntent",{intent});if(token===serial.current)setPreview(v)}
    catch{if(token===serial.current)setPreview({ok:false,code:"BACKEND_UNAVAILABLE"})}
    finally{if(token===serial.current)setBusy(false)}
  }
  async function saveReview(){
    const token=++serial.current;setBusy(true);setSavedStatus(null);setReportState(null);setReportRequest(null);setCommentRequest(null);setCommentState(null);setCommentId("");setPreview(null);
    try{const result=await invoke<Result>("saveCurrentReview",{intent});if(token===serial.current){setPreview(result);if(result.saved_review){setReviewId(result.saved_review.review_id??"");setSavedStatus(result.saved_review)}}}
    catch{if(token===serial.current)setSavedStatus({ok:false,code:"BACKEND_UNAVAILABLE"})}
    finally{if(token===serial.current)setBusy(false)}
  }
  async function recheckReview(){
    const token=++serial.current;setBusy(true);setSavedStatus(null);
    try{const result=await invoke<SavedReview>("refreshSavedReview",{review_id:reviewId});if(token===serial.current){setSavedStatus(result);if(result.comment_journal?.request_id)setCommentId(result.comment_journal.request_id)}}
    catch{if(token===serial.current)setSavedStatus({ok:false,code:"BACKEND_UNAVAILABLE"})}
    finally{if(token===serial.current)setBusy(false)}
  }
  async function reportAction(operation:"prepareReadOnlyReport"|"approveReadOnlyReport"|"generateReadOnlyReport"|"revokeReadOnlyReport"){
    const token=++serial.current;setBusy(true);
    try{
      const requestId=reportRequest?.request_id;
      const result=await invoke<ReportResult>(operation,operation==="prepareReadOnlyReport"?{review_id:reviewId}:{request_id:requestId,expected_digest:requestId});
      if(token===serial.current){setReportState(result);if(operation==="prepareReadOnlyReport")setReportRequest(result.ok?result:null);}
    }catch{if(token===serial.current)setReportState({ok:false,code:"BACKEND_UNAVAILABLE"})}
    finally{if(token===serial.current)setBusy(false)}
  }
  async function commentAction(operation:"prepareDemoComment"|"approveDemoComment"|"executeDemoComment"|"revokeDemoComment"|"reconcileDemoComment"){
    const token=++serial.current;setBusy(true);
    if(operation==="prepareDemoComment"){setCommentRequest(null);setCommentState(null);setCommentId("");}
    try{
      const id=operation==="reconcileDemoComment"?commentId:commentRequest?.request_id;
      const result=await invoke<CommentResult>(operation,operation==="prepareDemoComment"?{review_id:reviewId}:{request_id:id,expected_digest:id});
      if(token===serial.current){setCommentState(result);if(operation==="prepareDemoComment"&&result.ok){setCommentRequest(result);setCommentId(result.request_id??"");}}
    }catch{if(token===serial.current)setCommentState({ok:false,code:"BACKEND_UNAVAILABLE",status:operation==="executeDemoComment"?"UNKNOWN_OUTCOME_REVIEW":"REQUEST_UNAVAILABLE"})}
    finally{if(token===serial.current)setBusy(false)}
  }
  return <main className="shell"><header><div className="eyebrow">HAE / LA • TRUSTFLOW</div><h1>Decision assurance</h1><p>Know why. Approve what. Revalidate what changes.</p></header>
    <div className="notice" role="status">Development environment. Drafts are not verified or approved. Only a configured synthetic demo issue may receive an explicitly approved comment. No external AI calls.</div>
    {!context?<p role="status">Loading issue context…</p>:!context.ok?<p role="alert">{msg(context.code)}</p>:<>
      <section aria-labelledby="issue-heading"><div className="section-head"><h2 id="issue-heading">Current issue · {context.key}</h2><button type="button" disabled={busy} onClick={loadIssue}>Read Jira</button></div>
      {!issue?<p>Read the current issue using your Jira access.</p>:issue.ok&&issue.snapshot?<><h3>{issue.snapshot.summary}</h3><dl><dt>Status</dt><dd>{issue.snapshot.status}</dd><dt>Type</dt><dd>{issue.snapshot.issueType}</dd><dt>Source version</dt><dd>{issue.source?.version||"Unknown"}</dd></dl><p className="muted">Observed source metadata; not proof of completion.</p>{issue.evidence&&<><h4>TruthGate evidence</h4><p>{issue.evidence.coverage} · {issue.evidence.unknown_count} unknown reads</p><ul>{issue.evidence.sources.map(s=><li key={s.source_ref}><code>{s.uri}</code> · {s.status} · {s.version||"Unknown version"}</li>)}</ul></>}</>:<p role="alert">{msg(issue.code)}</p>}</section>
      <section><h2>Start a review</h2><div className="choices">{["Review this change","Coordinate incident","Review release"].map(t=><button type="button" key={t} onClick={()=>{setIntent(t);setPreview(null)}} disabled={busy} aria-pressed={intent===t}>{t}</button>)}</div>
        <form onSubmit={createPreview}><label htmlFor="intent">Supported natural-language intent</label><input id="intent" maxLength={300} value={intent} disabled={busy} onChange={e=>{setIntent(e.target.value);setPreview(null)}}/><button disabled={busy||!intent.trim()} type="submit">Preview review</button></form>
        {preview&&!preview.ok&&<p role="alert">{msg(preview.code)}</p>}
        {preview?.ok&&preview.draft&&<article aria-live="polite"><div className="eyebrow">DRAFT · EVIDENCE PENDING</div><h3>{preview.draft.title}</h3><ol>{preview.draft.steps.map(step=><li key={step}>{step}</li>)}</ol>{preview.plan&&<><h4>Validated draft operations</h4><ol>{preview.plan.steps.map(s=><li key={s.step_id}><code>{s.op_id}</code> · {s.side_effect}{s.predecessor_ids.length?` · after ${s.predecessor_ids.join(", ")}`:""}</li>)}</ol><p className="muted">Draft digest: <code>{preview.plan.plan_hash}</code></p></>}<EvidencePanel result={preview}/><ProofGraphPanel result={preview}/><p>Authorization: none. No execution is available.</p></article>}
        <section aria-label="Saved development review"><h3>Saved review · development only</h3><p>Save a fresh review with source hashes and lineage metadata for 24 hours. No Jira issue is modified. Use synthetic demo issues only.</p><button type="button" disabled={busy||!intent.trim()} onClick={saveReview}>Save fresh review</button><label htmlFor="saved-id">Saved review ID</label><input id="saved-id" maxLength={64} value={reviewId} onChange={e=>{setReviewId(e.target.value);setSavedStatus(null);setReportState(null);setReportRequest(null);setCommentRequest(null);setCommentState(null);setCommentId("")}} disabled={busy}/><button type="button" disabled={busy||!/^[a-f0-9]{64}$/.test(reviewId)} onClick={recheckReview}>Recheck saved review</button>{savedStatus&&<div role="status">{savedStatus.ok?<><p>{savedStatus.status??"REVIEW_SAVED"} · {savedStatus.run_state??"State unknown"}</p>{savedStatus.expires_at&&<p>Expires {new Date(savedStatus.expires_at).toLocaleString()}</p>}{savedStatus.affected_count!==undefined&&<p>Affected nodes: {savedStatus.affected_count??"Unknown"} · Unaffected nodes: {savedStatus.unaffected_count??"Unknown"}</p>}{savedStatus.metadata&&<details><summary>DataPassport metadata inspector</summary><dl><dt>Classification</dt><dd>{savedStatus.metadata.classification}</dd><dt>Stored snapshot bytes</dt><dd>{savedStatus.metadata.record_bytes}</dd><dt>Sources / nodes / edges</dt><dd>{savedStatus.metadata.source_count} / {savedStatus.metadata.node_count} / {savedStatus.metadata.edge_count}</dd><dt>Snapshot digest</dt><dd><code>{savedStatus.metadata.record_digest}</code></dd><dt>Graph revision</dt><dd><code>{savedStatus.metadata.graph_revision}</code></dd><dt>Retention</dt><dd>{new Date(savedStatus.metadata.expires_at).toLocaleString()}</dd><dt>Original content</dt><dd>{savedStatus.metadata.raw_originals}</dd></dl><p>Capacity shown is this snapshot only, not total database size.</p></details>}{savedStatus.comment_journal&&<p>Comment journal: {savedStatus.comment_journal.status}. Historical success is not a current Jira read-back.</p>}{savedStatus.persisted_invalidation&&<p>Saved review invalidated. Create a new review. No approval or execution granted.</p>}</>:<p>{savedStatus.code??"REVIEW_UNAVAILABLE"} · Review unavailable; no Jira write attempted.</p>}</div>}</section>
        <section aria-label="Read-only report approval"><h3>Approve a read-only evidence report</h3><p>Only report generation is approved. No Jira mutation, no external AI. The exact saved plan, evidence and policy are rechecked at each stage. Development storage requests are capped at 24 per installation per UTC day.</p>
          <button type="button" disabled={busy||!/^[a-f0-9]{64}$/.test(reviewId)} onClick={()=>reportAction("prepareReadOnlyReport")}>Prepare read-only report</button>
          {reportRequest?.ok&&<><p>Exact request digest: <code>{reportRequest.request_id}</code></p><ol>{reportRequest.operations?.map((s,i)=><li key={i}>{s.operation} · {s.effect}</li>)}</ol><button type="button" disabled={busy||reportState?.status!=="AWAITING_READ_ONLY_APPROVAL"} onClick={()=>reportAction("approveReadOnlyReport")}>Approve this report only</button><button type="button" disabled={busy||reportState?.status!=="READ_ONLY_APPROVED"} onClick={()=>reportAction("generateReadOnlyReport")}>Generate approved report</button><button type="button" disabled={busy||reportState?.status!=="READ_ONLY_APPROVED"} onClick={()=>reportAction("revokeReadOnlyReport")}>Revoke approval</button></>}
          {reportState&&<div role="status"><p>{reportState.status??reportState.code??"REPORT_UNAVAILABLE"}</p>{reportState.report&&<><p>{reportState.report.status}</p><ul>{reportState.report.sources.map(s=><li key={s.uri}>{s.uri} · {s.version} · {s.status}</li>)}</ul><ul>{reportState.report.checks.map((c,i)=><li key={i}>{c.predicate}: {c.values.join(" / ")} · {c.status}</li>)}</ul><p>Missing reported fields: {reportState.report.missing.join(", ")||"None reported"}</p><p>Report digest: <code>{reportState.report_digest}</code></p><p>Run state: {reportState.run_state}</p>{reportState.lineage&&<p>Persisted lineage: {reportState.lineage.nodes.map(n=>n.kind).join(" → ")} · {reportState.lineage.edges.length} links</p>}</>}</div>}
        </section>
        {context.key==="HTF-2"&&<section aria-label="Synthetic Jira comment approval">
          <h3>Guarded demo comment</h3><p>One non-certifying annotation to the configured synthetic issue only. Review the exact text, approve it, then execute. Source changes or permission loss block execution. A timeout must be reconciled; never retry a write blindly.</p>
          <button type="button" disabled={busy||!/^[a-f0-9]{64}$/.test(reviewId)} onClick={()=>commentAction("prepareDemoComment")}>Prepare demo comment</button>
          {commentRequest?.ok&&<><dl><dt>Target issue</dt><dd>{commentRequest.target}</dd><dt>Exact comment</dt><dd><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{commentRequest.comment}</pre></dd><dt>Request digest</dt><dd><code>{commentRequest.request_id}</code></dd><dt>Approval expires</dt><dd>{new Date(commentRequest.expires_at??0).toLocaleString()}</dd></dl>
            <button type="button" disabled={busy||commentState?.status!=="AWAITING_COMMENT_APPROVAL"} onClick={()=>commentAction("approveDemoComment")}>Approve exact Jira comment</button>
            <button type="button" disabled={busy||commentState?.status!=="COMMENT_APPROVED"} onClick={()=>commentAction("executeDemoComment")}>Execute approved comment</button>
            <button type="button" disabled={busy||commentState?.status!=="COMMENT_APPROVED"} onClick={()=>commentAction("revokeDemoComment")}>Revoke comment approval</button></>}
          <label htmlFor="comment-request-id">Comment request ID for read-only reconciliation</label><input id="comment-request-id" value={commentId} maxLength={64} disabled={busy} onChange={e=>setCommentId(e.target.value)}/>
          <button type="button" disabled={busy||!/^[a-f0-9]{64}$/.test(commentId)} onClick={()=>commentAction("reconcileDemoComment")}>Reconcile observed comment</button>
          {commentState&&<div role="status"><p>{commentState.status??commentState.code??"REQUEST_UNKNOWN"}</p>{commentState.code&&<p>{commentState.code}</p>}{commentState.comment_id&&<p>Observed comment ID: {commentState.comment_id}</p>}{commentState.receipt_digest&&<p>Receipt digest: <code>{commentState.receipt_digest}</code></p>}{commentState.observation_digest&&<p>Read-back digest: <code>{commentState.observation_digest}</code></p>}{commentState.lineage&&<p>Persisted lineage: {commentState.lineage.nodes.map(n=>n.kind).join(" → ")} · {commentState.lineage.edges.length} links</p>}{commentState.status==="UNKNOWN_OUTCOME_REVIEW"&&<p>Do not submit a replacement comment. Reconcile this request first.</p>}</div>}
        </section>}
      </section></>}
    {busy&&<p role="status">Request in progress…</p>}
  </main>
}
const el=document.getElementById("root");
if(!el)throw new Error("Missing root");
createRoot(el).render(<App/>);
