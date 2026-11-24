import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@forge/bridge";
import "./styles.css";
type Draft = { title: string; steps: string[]; status: string; authorization: string };
type Issue = { key: string; summary: string; status: string; issueType: string; updatedAt: string | null };
type TypedPlan = { plan_hash:string; steps:{step_id:string;op_id:string;side_effect:string;predecessor_ids:string[]}[] };
type Evidence = { coverage:string; unknown_count:number; sources:{source_ref:string;uri:string;version:string|null;status:string;status_reason?:string;retrieved_at?:string;freshness_deadline?:string}[] };
type Graph = {ok:boolean;code?:string;status?:string;coverage?:string;graph_revision?:string;nodes?:{id:string;kind:string;ref:string}[];edges?:{from_dependency:string;to_dependent:string;relation:string}[]};
type Result = { graph?:Graph; claim_review?:{status:string;reason:string;missing_predicates?:string[];checks:{subject:string;predicate:string;values:string[];status:string;reason?:string;source_refs?:string[]}[]}; evidence?:Evidence|null; freshness?:{status:string;reason:string;changed:string[];unchanged?:string[];unknown?:string[]}; policy?:{decision:string;reason:string;execution:string;authorization?:string;policy_version?:string;graph_status?:string}; plan?:TypedPlan; ok: boolean; code?: string; key?: string; issueKey?: string; draft?: Draft; snapshot?: Issue; source?: { version: string | null; status: string } };
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
    <details><summary>Dependency table</summary><table><thead><tr><th scope="col">Dependency</th><th scope="col">Relation</th><th scope="col">Dependent</th></tr></thead><tbody>{g.edges.map((e,i)=><tr key={i}><td>{labels.get(e.from_dependency)??"Unknown"}</td><td>{e.relation}</td><td>{labels.get(e.to_dependent)??"Unknown"}</td></tr>)}</tbody></table></details>
  </section>;
}
function App(){
  const [context,setContext]=useState<Result|null>(null);
  const [issue,setIssue]=useState<Result|null>(null);
  const [intent,setIntent]=useState("Review this change");
  const [preview,setPreview]=useState<Result|null>(null);
  const [busy,setBusy]=useState(false);
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
  return <main className="shell"><header><div className="eyebrow">HAE / LA • TRUSTFLOW</div><h1>Decision assurance</h1><p>Know why. Approve what. Revalidate what changes.</p></header>
    <div className="notice" role="status">Read-only development baseline. Drafts are not verified or approved. No Jira writes or external AI calls are enabled.</div>
    {!context?<p role="status">Loading issue context…</p>:!context.ok?<p role="alert">{msg(context.code)}</p>:<>
      <section aria-labelledby="issue-heading"><div className="section-head"><h2 id="issue-heading">Current issue · {context.key}</h2><button type="button" disabled={busy} onClick={loadIssue}>Read Jira</button></div>
      {!issue?<p>Read the current issue using your Jira access.</p>:issue.ok&&issue.snapshot?<><h3>{issue.snapshot.summary}</h3><dl><dt>Status</dt><dd>{issue.snapshot.status}</dd><dt>Type</dt><dd>{issue.snapshot.issueType}</dd><dt>Source version</dt><dd>{issue.source?.version||"Unknown"}</dd></dl><p className="muted">Observed source metadata; not proof of completion.</p>{issue.evidence&&<><h4>TruthGate evidence</h4><p>{issue.evidence.coverage} · {issue.evidence.unknown_count} unknown reads</p><ul>{issue.evidence.sources.map(s=><li key={s.source_ref}><code>{s.uri}</code> · {s.status} · {s.version||"Unknown version"}</li>)}</ul></>}</>:<p role="alert">{msg(issue.code)}</p>}</section>
      <section><h2>Start a review</h2><div className="choices">{["Review this change","Coordinate incident","Review release"].map(t=><button type="button" key={t} onClick={()=>{setIntent(t);setPreview(null)}} disabled={busy} aria-pressed={intent===t}>{t}</button>)}</div>
        <form onSubmit={createPreview}><label htmlFor="intent">Supported natural-language intent</label><input id="intent" maxLength={300} value={intent} disabled={busy} onChange={e=>{setIntent(e.target.value);setPreview(null)}}/><button disabled={busy||!intent.trim()} type="submit">Preview review</button></form>
        {preview&&!preview.ok&&<p role="alert">{msg(preview.code)}</p>}
        {preview?.ok&&preview.draft&&<article aria-live="polite"><div className="eyebrow">DRAFT · EVIDENCE PENDING</div><h3>{preview.draft.title}</h3><ol>{preview.draft.steps.map(step=><li key={step}>{step}</li>)}</ol>{preview.plan&&<><h4>Validated draft operations</h4><ol>{preview.plan.steps.map(s=><li key={s.step_id}><code>{s.op_id}</code> · {s.side_effect}{s.predecessor_ids.length?` · after ${s.predecessor_ids.join(", ")}`:""}</li>)}</ol><p className="muted">Draft digest: <code>{preview.plan.plan_hash}</code></p></>}<EvidencePanel result={preview}/><ProofGraphPanel result={preview}/><p>Authorization: none. No execution is available.</p></article>}
      </section></>}
    {busy&&<p role="status">Request in progress…</p>}
  </main>
}
const el=document.getElementById("root");
if(!el)throw new Error("Missing root");
createRoot(el).render(<App/>);
