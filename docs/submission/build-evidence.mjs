import {readFileSync,writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
const sha=x=>typeof x==="string"&&/^[a-f0-9]{40}$/.test(x);
const positive=x=>Number.isSafeInteger(x)&&x>0;
const count=x=>Number.isSafeInteger(x)&&x>=0;
const runUrl=id=>"https://github.com/hibi89/Atlassian_Codegeist2026/actions/runs/"+id;
const commitUrl=id=>"https://github.com/hibi89/Atlassian_Codegeist2026/commit/"+id;
const scenarios=["unchanged","changed","denied"];

// A presentation snapshot is derived from explicit evidence references, not
// from the current branch name, a historical live SHA or a claimed judge score.
export function buildEvidence(l){
 const counts={PASS:0,PARTIAL:0,NOT_RUN:0};
 if(!l||!sha(l.source_sha)||!positive(l.p1_total)||!count(l.p1_candidates)||l.p1_candidates>l.p1_total||!positive(l.p2_total)||!Array.isArray(l.records)||l.records.length!==l.p2_total||new Set(l.records.map(r=>r?.gate_id)).size!==l.p2_total||l.weighted_implementation!=="UNASSESSED"||l.weighted_verification!=="UNASSESSED")throw Error("Invalid evidence ledger");
 for(const r of l.records){
  if(typeof r?.gate_id!=="string"||!/^P2-[0-9]{2}$/.test(r.gate_id)||!sha(r.source_sha)||!Object.hasOwn(counts,r.status))throw Error("Invalid gate evidence");
  counts[r.status]++;
 }
 if(counts.PASS!==l.p2_pass||counts.PARTIAL!==l.p2_partial||counts.NOT_RUN!==l.p2_not_run)throw Error("Gate count mismatch");
 const c=l.latest_candidate_ci,f=l.latest_candidate_ci_followup;
 if(!c||!sha(c.source_sha)||!positive(c.run_id)||!positive(c.job_id)||!positive(c.artifact_id)||!positive(c.smoke_pass)||!positive(c.p2_regression_pass)||!count(c.fail)||!count(c.skip)||!count(c.cancelled)||c.fail!==0||c.skip!==0||c.cancelled!==0||c.locked_install!=="PASS"||c.syntax!=="PASS"||c.ui_build!=="PASS"||c.ui_output!=="PASS"||c.live_forge!=="NOT_RUN"||c.independent_review!=="NOT_RUN"||c.prior_live_evidence_source_sha!==l.source_sha||f?.source_sha!==c.source_sha||f.run_id!==c.run_id||f.status!=="completed"||f.conclusion!=="success")throw Error("CI evidence not established");
 const b=l.submission_benchmark,rows=b?.rows;
 if(!b||!sha(b.source_sha)||!positive(b.run_id)||!positive(b.job_id)||b.scope!=="NATIVE_SYNTHETIC_ADAPTER"||!Array.isArray(rows)||rows.length!==3||rows.some((r,i)=>r?.scenario!==scenarios[i]||r.pairs!==20||![r.full_ms,r.selective_ms].every(x=>Number.isFinite(x)&&x>=0&&x<=1e7)||!count(r.reused_groups)||typeof r.decision_equal!=="boolean")||b.run_id===c.run_id&&(b.source_sha!==c.source_sha||b.job_id!==c.job_id))throw Error("Invalid benchmark evidence");
 const total=rows.reduce((s,r)=>s+r.pairs,0),equal=rows.reduce((s,r)=>s+(r.decision_equal?r.pairs:0),0);
 // A false group flag cannot tell us how many individual decisions matched.
 const agreement=rows.every(r=>r.decision_equal)?total:null;
 const agreementText=agreement===null?"Not established per individual case":agreement+"/"+total;
 const max=Math.max(1,...rows.flatMap(r=>[r.full_ms,r.selective_ms]));
 const bars=rows.map((r,i)=>{const y=112+78*i;return '<text x="24" y="'+y+'" font-size="15" font-weight="bold">'+r.scenario+'</text>'+[[r.full_ms,"#64748b"],[r.selective_ms,"#137d73"]].map(([v,col],k)=>'<rect x="160" y="'+(y-15+k*24)+'" width="'+(v/max*400).toFixed(2)+'" height="16" rx="2" fill="'+col+'"/><text x="'+(166+v/max*400)+'" y="'+(y-2+k*24)+'" font-size="13">'+v.toFixed(3)+'</text>').join("")}).join("");
 const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 410" role="img" aria-labelledby="title desc"><title id="title">Native synthetic full vs selective revalidation</title><desc id="desc">Total milliseconds for each paired scenario. Decision agreement: '+agreementText+'. Real Forge latency not measured.</desc><rect width="760" height="410" rx="12" fill="#f3f6fa"/><g font-family="Arial, sans-serif" fill="#172b42"><text x="24" y="35" font-size="20" font-weight="bold">Full vs selective revalidation</text><text x="24" y="58" font-size="13">Synthetic adapter · total milliseconds per 20 pairs</text><rect x="24" y="72" width="14" height="14" fill="#64748b"/><text x="45" y="84" font-size="13">Full</text><rect x="105" y="72" width="14" height="14" fill="#137d73"/><text x="126" y="84" font-size="13">Selective</text>'+bars+'<text x="24" y="325" font-size="14" font-weight="bold">Decision agreement: '+agreementText+'</text><text x="24" y="346" font-size="12">No real-network, general accuracy or speed-gain claim.</text><text x="24" y="369" font-size="12">Benchmark source '+b.source_sha+'</text><text x="24" y="389" font-size="12">Actions run '+b.run_id+' · job '+b.job_id+'</text></g></svg>\n';
 const md=[
 "# Synthetic evidence snapshot — NOT live acceptance","",
 "This is a generated historical evidence snapshot, not a submission or judge score.","",
 "| Evidence class | Exact source | Reference |","|---|---|---|",
 "| Latest recorded candidate CI | ["+c.source_sha+"]("+commitUrl(c.source_sha)+") | [Run "+c.run_id+"]("+runUrl(c.run_id)+"), job "+c.job_id+", artifact "+c.artifact_id+" |",
 "| Native paired benchmark | ["+b.source_sha+"]("+commitUrl(b.source_sha)+") | [Run "+b.run_id+"]("+runUrl(b.run_id)+"), job "+b.job_id+" |",
 "| Prior owner-reported live baseline | ["+l.source_sha+"]("+commitUrl(l.source_sha)+") | P2 gate ledger; not a live result for latest candidate |","",
 "- P1 candidates "+l.p1_candidates+"/"+l.p1_total+" (implementation candidates only).",
 "- P2 recorded gates: "+counts.PASS+" PASS, "+counts.PARTIAL+" PARTIAL, "+counts.NOT_RUN+" NOT_RUN. Gate evidence belongs to the individual source SHAs in the ledger.",
 "- Latest recorded CI: "+(c.smoke_pass+c.p2_regression_pass)+"/"+(c.smoke_pass+c.p2_regression_pass)+" PASS ("+c.smoke_pass+" smoke, "+c.p2_regression_pass+" regression); 0 failed/skipped/canceled; locked install, syntax and both UI builds/output checks PASS.",
 "- Official weighted rates UNASSESSED. Latest-source real Forge/browser and independent review NOT_RUN.","",
 "## Native paired measurements","",
 "Decision agreement: "+agreementText+". Not an accuracy rate.","",
 "| Scenario | Pairs | Full total ms | Selective total ms | Reused groups |","|---|---:|---:|---:|---:|",
 ...rows.map(r=>"| "+r.scenario+" | "+r.pairs+" | "+r.full_ms.toFixed(3)+" | "+r.selective_ms.toFixed(3)+" | "+r.reused_groups+" |"),"",
 "Native synthetic adapter only. Real Forge latency, usage cost, independent verification and production acceptance are not established. Do not present these totals as user time savings. No measured speed advantage is claimed.","",
 "## Publication gate","","Installation link, fresh judge-site acceptance, public video, final rights/cost review and owner submission GO remain pending. This file does not authorize deployment, sharing or publication.",""
 ].join("\n");
 return {svg,md};
}
export function assertEvidenceCurrent(actual,expected){
 if(actual?.svg!==expected.svg||actual?.md!==expected.md)throw Error("Submission evidence snapshot stale: regenerate from verified ledger");
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const args=process.argv.slice(2);if(args.length>1||args.length===1&&!["--check","--write"].includes(args[0]))throw Error("Use --check or --write");
 const l=JSON.parse(readFileSync(new URL("../P2_VERIFICATION_LEDGER.json",import.meta.url),"utf8"));
 const e=buildEvidence(l),svg=new URL("synthetic-evidence.svg",import.meta.url),md=new URL("SYNTHETIC_EVIDENCE.md",import.meta.url);
 if(args[0]==="--check"){assertEvidenceCurrent({svg:readFileSync(svg,"utf8"),md:readFileSync(md,"utf8")},e);console.log("SUBMISSION_EVIDENCE=HISTORICAL_SNAPSHOT_MATCH")}
 else{writeFileSync(svg,e.svg);writeFileSync(md,e.md)}
}
