import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@forge/bridge";
import "./styles.css";
type Draft = { title: string; steps: string[]; status: string; authorization: string };
type Issue = { key: string; summary: string; status: string; issueType: string; updatedAt: string | null };
type TypedPlan = { plan_hash:string; steps:{step_id:string;op_id:string;side_effect:string;predecessor_ids:string[]}[] };
type Evidence = { coverage:string; unknown_count:number; sources:{source_ref:string;uri:string;version:string|null;status:string}[] };
type Result = { evidence?:Evidence|null; freshness?:{status:string;reason:string;changed:string[]}; policy?:{decision:string;reason:string;execution:string}; plan?:TypedPlan; ok: boolean; code?: string; key?: string; issueKey?: string; draft?: Draft; snapshot?: Issue; source?: { version: string | null; status: string } };
const labels: Record<string,string> = {
  AUTH_REQUIRED:"Sign in to Jira to continue.", ISSUE_CONTEXT_REQUIRED:"Open TrustFlow from a Jira issue.",
  SOURCE_ACCESS_UNKNOWN:"Current user access could not be verified.", SOURCE_NOT_VISIBLE_OR_MISSING:"Issue is missing or not visible to you.",
  JIRA_RATE_LIMITED:"Jira rate limit reached. Try again later.", JIRA_UNAVAILABLE:"Jira is temporarily unavailable.",
  JIRA_RESPONSE_INVALID:"Jira returned an unexpected response.", JIRA_RESPONSE_TOO_LARGE:"Jira response exceeded the safe limit.",
  JIRA_READ_UNAVAILABLE:"The Jira read could not be completed.", UNSUPPORTED_INTENT:"Choose one of the three supported intents. No action was taken."
};
function msg(code?: string){return labels[code||""] || "Request failed. No write was attempted.";}
function App(){
  const [context,setContext]=useState<Result|null>(null);
  const [issue,setIssue]=useState<Result|null>(null);
  const [intent,setIntent]=useState("Review this change");
  const [preview,setPreview]=useState<Result|null>(null);
  const [busy,setBusy]=useState(false);
  const serial=useRef(0);
  useEffect(()=>{let alive=true;invoke<Result>("getPanelContext").then(v=>{if(alive)setContext(v)}).catch(()=>{if(alive)setContext({ok:false,code:"ISSUE_CONTEXT_REQUIRED"})});return()=>{alive=false}},[]);
  async function loadIssue(){
    const token=++serial.current;setBusy(true);setIssue(null);setPreview(null);
    try{const v=await invoke<Result>("readCurrentIssue");if(token===serial.current)setIssue(v)}
    catch{if(token===serial.current)setIssue({ok:false,code:"JIRA_READ_UNAVAILABLE"})}
    finally{if(token===serial.current)setBusy(false)}
  }
  async function createPreview(e:React.FormEvent){
    e.preventDefault();const token=++serial.current;setBusy(true);setPreview(null);
    try{const v=await invoke<Result>("previewIntent",{intent});if(token===serial.current)setPreview(v)}
    catch{if(token===serial.current)setPreview({ok:false,code:"UNSUPPORTED_INTENT"})}
    finally{if(token===serial.current)setBusy(false)}
  }
  return <main className="shell"><header><div className="eyebrow">HAE / LA • TRUSTFLOW</div><h1>Decision assurance</h1><p>Know why. Approve what. Revalidate what changes.</p></header>
    <div className="notice" role="status">Read-only development baseline. Drafts are not verified or approved. No Jira writes or external AI calls are enabled.</div>
    {!context?<p role="status">Loading issue context…</p>:!context.ok?<p role="alert">{msg(context.code)}</p>:<>
      <section aria-labelledby="issue-heading"><div className="section-head"><h2 id="issue-heading">Current issue · {context.key}</h2><button type="button" disabled={busy} onClick={loadIssue}>Read Jira</button></div>
      {!issue?<p>Read the current issue using your Jira access.</p>:issue.ok&&issue.snapshot?<><h3>{issue.snapshot.summary}</h3><dl><dt>Status</dt><dd>{issue.snapshot.status}</dd><dt>Type</dt><dd>{issue.snapshot.issueType}</dd><dt>Source version</dt><dd>{issue.source?.version||"Unknown"}</dd></dl><p className="muted">Observed source metadata; not proof of completion.</p>{issue.evidence&&<><h4>TruthGate evidence</h4><p>{issue.evidence.coverage} · {issue.evidence.unknown_count} unknown reads</p><ul>{issue.evidence.sources.map(s=><li key={s.source_ref}><code>{s.uri}</code> · {s.status} · {s.version||"Unknown version"}</li>)}</ul></>}</>:<p role="alert">{msg(issue.code)}</p>}</section>
      <section><h2>Start a review</h2><div className="choices">{["Review this change","Coordinate incident","Review release"].map(t=><button type="button" key={t} onClick={()=>{setIntent(t);setPreview(null)}} disabled={busy}>{t}</button>)}</div>
        <form onSubmit={createPreview}><label htmlFor="intent">Supported natural-language intent</label><input id="intent" maxLength={300} value={intent} disabled={busy} onChange={e=>{setIntent(e.target.value);setPreview(null)}}/><button disabled={busy||!intent.trim()} type="submit">Preview review</button></form>
        {preview&&!preview.ok&&<p role="alert">{msg(preview.code)}</p>}
        {preview?.ok&&preview.draft&&<article aria-live="polite"><div className="eyebrow">DRAFT · EVIDENCE PENDING</div><h3>{preview.draft.title}</h3><ol>{preview.draft.steps.map(step=><li key={step}>{step}</li>)}</ol>{preview.plan&&<><h4>Validated draft operations</h4><ol>{preview.plan.steps.map(s=><li key={s.step_id}><code>{s.op_id}</code> · {s.side_effect}{s.predecessor_ids.length?` · after ${s.predecessor_ids.join(", ")}`:""}</li>)}</ol><p className="muted">Draft digest: <code>{preview.plan.plan_hash}</code></p></>}{preview.policy&&<><h4>SovereignGuard policy</h4><p role="status">{preview.policy.decision} · {preview.policy.reason}</p><p>{preview.freshness?`Re-read: ${preview.freshness.status} · changed ${preview.freshness.changed.length}`:"Freshness not established"}</p>{preview.evidence&&<p>Sources observed: {preview.evidence.sources.length} · {preview.evidence.coverage}</p>}</>}<p>Authorization: none. No execution is available.</p></article>}
      </section></>}
    {busy&&<p role="status">Request in progress…</p>}
  </main>
}
const el=document.getElementById("root");
if(!el)throw new Error("Missing root");
createRoot(el).render(<App/>);
