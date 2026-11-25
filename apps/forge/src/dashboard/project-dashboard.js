import {principal,compareEvidence} from "../evidence/bundle.js";
import {demoInstallMatches} from "../security/installation-policy.js";
import {createReviewStore,validInvalidationMarker} from "../lineage/review-store.js";
import {createRunLedger} from "../state/run-ledger.js";
import {historicalGraph} from "../lineage/history.js";
const hex=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
const numericId=x=>typeof x==="string"&&/^[1-9][0-9]{0,30}$/.test(x);
const fail=code=>({ok:false,code,authorization:"NONE",execution:"DISABLED"});
export const PROJECT_SCAN_LIMIT=12,PROJECT_ROW_LIMIT=3,PROJECT_DETAIL_READ_LIMIT=16;
// Same existing synthetic target. No client-provided target, prefix, cursor or actor.
export function projectScope(context,development,cloudId,digest){
 const project=context?.extension?.project;
 if(development!==true||context?.extension?.type!=="jira:projectPage"||project?.key!=="HTF"||!numericId(project.id)||!demoInstallMatches(context,cloudId))return null;
 const issueContext={...context,extension:{issue:{key:"HTF-2"}}},p=principal(issueContext,digest);
 return p?{p,issueContext,projectId:project.id}:null;
}
export async function loadProjectDashboard(context,{development,cloudId,digest,clock,admit,readProjectIssue,readEvidence,queryReviews,readStored}){
 const scope=projectScope(context,development,cloudId,digest);if(!scope)return fail("PROJECT_DEMO_SCOPE_REQUIRED");
 const {p,issueContext,projectId}=scope;
 try{
  const admitted=await admit();if(admitted?.ok!==true)return admitted??fail("PROJECT_ADMISSION_UNKNOWN");
  const issue=await readProjectIssue();if(issue?.key!=="HTF-2"||!numericId(issue.id)||issue.project_id!==projectId||issue.project_key!=="HTF")return fail("PROJECT_ACCESS_OR_IDENTITY_UNKNOWN");
  const current=await readEvidence(issueContext),e=current?.evidence,now=clock();
  if(!current?.ok||current.snapshot?.objectId!==issue.id||e?.installation_ref!==p.tenant||e.actor_ref!==p.actor||e.target!==p.target||e.coverage!=="BOUNDED_READ_COMPLETE"||!Array.isArray(e.sources)||!e.sources.length||e.sources.length>8||e.sources.some(s=>s.status!=="VERSION_OBSERVED"||!Number.isFinite(Date.parse(s.freshness_deadline))||Date.parse(s.freshness_deadline)<=now))return fail("PROJECT_EVIDENCE_UNKNOWN");
  const prefix="cg:review:"+p.tenant+":"+p.actor+":",page=await queryReviews(prefix,PROJECT_SCAN_LIMIT);
  if(!Array.isArray(page?.results)||page.results.length>PROJECT_SCAN_LIMIT||new Set(page.results.map(r=>r?.key)).size!==page.results.length)return fail("PROJECT_STORAGE_UNKNOWN");
  const validator=createReviewStore(null,p,clock,digest),rows=[];
  let withheld=0;
  const visible=new Set(e.sources.map(x=>x.source_ref));
  for(const item of page.results){
   if(typeof item?.key!=="string"||!item.key.startsWith(prefix))return fail("PROJECT_STORAGE_SCOPE_UNKNOWN");
   const suffix=item.key.slice(prefix.length),id=suffix.split(":")[0];
   if(!hex(id)||!["snapshot","invalidated"].includes(suffix.slice(65))||suffix[64]!==":")return fail("PROJECT_STORAGE_SCOPE_UNKNOWN");
   if(!suffix.endsWith(":snapshot"))continue;
   let record;
   try{record=await readStored(item.key)}catch{withheld++;continue;}
   if(item.value?.record_digest!==record?.record_digest||typeof item.expireTime!=="string"||!Number.isFinite(Date.parse(item.expireTime))||Date.parse(item.expireTime)<=clock()||!validator.validRecord(record,id)||record.evidence.sources.some(s=>!visible.has(s.source_ref))){withheld++;continue;}
   const comparison=compareEvidence(record.evidence,e,clock());
   if(comparison.status==="UNKNOWN"){withheld++;continue;}
   rows.push({record,row:{review_id:id,intent:record.intent,created_at:record.created_at,expires_at:record.expires_at,source_count:record.evidence.sources.length,comparison:comparison.status}});
  }
  if(e.sources.some(s=>Date.parse(s.freshness_deadline)<=clock()))return fail("PROJECT_EVIDENCE_UNKNOWN");
  rows.sort((a,b)=>b.row.created_at-a.row.created_at||a.row.review_id.localeCompare(b.row.review_id));
  const details=[];
  for(const {record,row} of rows.slice(0,PROJECT_ROW_LIMIT))details.push({...row,...await readReviewSummary({record,row,p,e,clock,digest,readStored,prefix})});
  if(e.sources.some(s=>Date.parse(s.freshness_deadline)<=clock()))return fail("PROJECT_EVIDENCE_UNKNOWN");
  return {ok:true,scope:"CURRENT_ACTOR_SYNTHETIC_PROJECT_SAMPLE",project_key:"HTF",target:"HTF-2",observed_at:clock(),scan_limit:PROJECT_SCAN_LIMIT,row_limit:PROJECT_ROW_LIMIT,scan_truncated:!!page.nextCursor,rows_truncated:rows.length>PROJECT_ROW_LIMIT,withheld_count:withheld,rows:details,authorization:"NONE",execution:"NO_JIRA_MUTATION"};
 }catch{return fail("PROJECT_DASHBOARD_UNKNOWN")}
}

async function readReviewSummary({record,row,p,e,clock,digest,readStored,prefix}){
 const unknown={journal_state:"NOT_ESTABLISHED",comment_state:"NOT_ESTABLISHED",invalidation:"NOT_ESTABLISHED"};
 let reads=0;
 const store={get:async key=>{if(++reads>PROJECT_DETAIL_READ_LIMIT)throw Error("PROJECT_DETAIL_READ_LIMIT");return readStored(key)}};
 try{
  const marker=await store.get(prefix+record.id+":invalidated");
  if(marker!=null&&!validInvalidationMarker(record,record.id,marker,clock(),digest))return unknown;
  const invalidation=marker!=null?"PERSISTED_INVALIDATION":"NO_MARKER_OBSERVED";
  const run=await createRunLedger(store,p,clock).read(record.id);
  if(!run.ok||run.events[0].plan_hash!==record.id)return {...unknown,invalidation};
  const history=await historicalGraph({store,p,record,current:{evidence:e},projection:marker?.projection??null,stale:marker!=null||row.comparison!=="CURRENT_OBSERVED",run,digest,clock});
  if(!history.ok)return {...unknown,invalidation};
  return {journal_state:run.state==="SUCCEEDED"?"REPORT_RECEIPT_VERIFIED":run.state,comment_state:history.comment_journal.status,invalidation};
 }catch{return unknown}
}
