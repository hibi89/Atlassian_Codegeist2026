import {canonical} from "../core/ir/plan.js";
import {reportLineage} from "../lineage/receipt-lineage.js";
import { historicalGraph } from "../lineage/history.js";
import { readCommentJournal } from "./comment-journal.js";
import { principal } from "../evidence/bundle.js";
import { createRunLedger } from "./run-ledger.js";
import { createReviewStore } from "../lineage/review-store.js";
const aliases={"change-review":"review change","incident-coordinate":"coordinate incident","release-review":"review release"};
const deny=code=>({ok:false,code,authorization:"NONE",execution:"DISABLED"});
// Actual server caller. Only trusted Forge context and fresh preview can create a review.
function createReviewService({store,clock,digest,preview,development}){
 async function save(context,intent){
  const p=principal(context,digest);
  if(!development()||!p)return deny("DEVELOPMENT_STORAGE_ONLY");
  const result=await preview(context,intent);
  return persistReview(p,result);
 }
 async function persistReview(p,result){
  const saved=await createReviewStore(store,p,clock,digest).save(result);
  if(!saved.ok)return saved;
  const ledger=createRunLedger(store,p,clock);
  const run=saved.review_id;
  // Do not report a completed save when journal initialization is partial.
  const created=await ledger.create(run,run);
  if(!created.ok)return {...deny("REVIEW_JOURNAL_PARTIAL"),repair_review_id:run};
  for(const [seq,state] of [[1,"EVIDENCE_PENDING"],[2,"POLICY_REVIEW"]]){
   if(!(await ledger.transition(run,seq,state)).ok)return {...deny("REVIEW_JOURNAL_PARTIAL"),repair_review_id:run};
  }
  return {...result,saved_review:{...saved,run_state:"POLICY_REVIEW"}};
 }
 async function refresh(context,id){
  const p=principal(context,digest);
  if(!development()||!p)return deny("DEVELOPMENT_STORAGE_ONLY");
  const inspected=await createReviewStore(store,p,clock,digest).refreshWithRecord(id,async (intent,record)=>preview(context,aliases[intent],record));
  if(!inspected.ok)return inspected;
  const {view:review,...internal}=inspected;
  const run=await createRunLedger(store,p,clock).read(id);
  if(!run.ok||run.events[0].plan_hash!==id||!["POLICY_REVIEW","AWAITING_APPROVAL","READY","RUNNING","RECONCILING","SUCCEEDED"].includes(run.state))return deny("REVIEW_JOURNAL_PARTIAL");
  // A terminal journal state alone is not a verified report receipt.
  // Reuse the same scoped, current-access and lineage checks as history.
  if(run.state==="SUCCEEDED"){
   const checked=await historicalGraph({store,p,...internal,run,digest,clock,includeRecoveryJournal:true});
   if(!checked.ok)return {...review,comment_journal:checked.recovery_comment_journal??{status:"JOURNAL_UNKNOWN"},run_state:"REPORT_OUTCOME_REVIEW_REQUIRED",receipt_status:"UNCONFIRMED",receipt_code:checked.code};
   return {...review,comment_journal:checked.comment_journal,run_state:"SUCCEEDED",receipt_status:"HISTORICAL_REPORT_RECEIPT_VERIFIED"};
  }
  const comment_journal=await readCommentJournal(store,p,id,clock);
  return {...review,comment_journal,run_state:["RUNNING","RECONCILING","AWAITING_APPROVAL","READY"].includes(run.state)?"REPORT_OUTCOME_REVIEW_REQUIRED":run.state};
 }
 async function history(context,id){
  const p=principal(context,digest);
  if(!development()||!p)return deny("DEVELOPMENT_STORAGE_ONLY");
  const h=await createReviewStore(store,p,clock,digest).history(id,(intent,record)=>preview(context,aliases[intent],record));
  if(!h.ok)return h;
  const run=await createRunLedger(store,p,clock).read(id);
  if(!run.ok||run.events[0].plan_hash!==id)return deny("HISTORY_JOURNAL_UNKNOWN");
  return historicalGraph({store,p,...h,run,digest,clock});
 }
 async function revalidate(context,id){
  const p=principal(context,digest);
  if(!development()||!p)return deny("DEVELOPMENT_STORAGE_ONLY");
  const old=await createReviewStore(store,p,clock,digest).history(id,(intent,record)=>preview(context,aliases[intent],record));
  if(!old.ok)return old;
  if(!old.stale)return deny("REVIEW_CURRENT_NO_REPLACEMENT_REQUIRED");
  if(!old.current?.ok||old.current.plan?.plan_hash===id||old.current.policy?.decision!=="ALLOW_PREVIEW")return deny("REVALIDATION_CURRENT_DRAFT_DENIED");
  const result=await persistReview(p,old.current);
  if(!result.ok)return result;
  // Never copy approval, request ID, execution state or old receipt to new review.
  return {...result,revalidated_from:id,revalidation:old.current.claim_review?.revalidation,authorization:"NONE",execution:"DISABLED"};
 }
 async function repairDraft(context,id){
  const p=principal(context,digest);
  if(!development()||!p||typeof id!=="string"||!/^[a-f0-9]{64}$/.test(id))return deny("REVIEW_DRAFT_REPAIR_DENIED");
  try{
   const m=await createReviewStore(store,p,clock,digest).authorizeReadOnly(id,(intent,record)=>preview(context,aliases[intent],record));
   if(!m.ok)return m;
   const deadline=Math.min(m.record.expires_at,Date.parse(m.record.plan.expires_at),...m.current.evidence.sources.map(s=>Date.parse(s.freshness_deadline)));
   const canAppend=async()=>Number.isFinite(deadline)&&clock()<deadline&&await store.get("cg:review:"+p.tenant+":"+p.actor+":"+id+":invalidated")==null&&(await readCommentJournal(store,p,id,clock)).status==="NO_COMMENT_ATTEMPT";
   const result=await createRunLedger(store,p,clock).repairInitialDraft(id,m.record.created_at,canAppend);
   if(!result.ok)return {...deny(result.code),repair_review_id:id};
   return {ok:true,review_id:id,status:"DRAFT_JOURNAL_CONFIRMED",run_state:"POLICY_REVIEW",authorization:"NONE",execution:"DISABLED"};
  }catch{return {...deny("REVIEW_DRAFT_REPAIR_OUTCOME_UNKNOWN"),repair_review_id:id}}
 }
 async function recoverReport(context,id){
  const p=principal(context,digest);
  if(!development()||!p)return deny("DEVELOPMENT_STORAGE_ONLY");
  try{
   // Recovery never regenerates report text, consumes approval or calls a writer.
   const h=await createReviewStore(store,p,clock,digest).history(id,(intent,record)=>preview(context,aliases[intent],record));
   if(!h.ok)return h;
   const ledger=createRunLedger(store,p,clock),run=await ledger.read(id),last=run.events?.at(-1);
   if(!run.ok||run.events[0].plan_hash!==id||!["RUNNING","RECONCILING","SUCCEEDED"].includes(run.state)||last?.execution_kind!=="READ_ONLY_REPORT"||!/^[a-f0-9]{64}$/.test(last.report_request_id))return deny("REPORT_RECOVERY_NOT_ESTABLISHED");
   const requestId=last.report_request_id,step=h.record.plan.steps.at(-1);
   if(step?.op_id!=="report.evidence.generate")return deny("REPORT_RECOVERY_NOT_ESTABLISHED");
   const receipt=await store.get("cg:report:"+p.tenant+":"+p.actor+":"+requestId+":receipt");
   if(!receipt||typeof receipt.report_digest!=="string"||!/^[a-f0-9]{64}$/.test(receipt.report_digest))return deny("REPORT_RECEIPT_UNKNOWN");
   const payloadDigest=digest(canonical([id,requestId,h.record.evidence.bundle_hash,h.record.graph.graph_revision,step]));
   const expected=reportLineage(p,h.record,requestId,step,payloadDigest,receipt.report_digest,digest);
   if(!expected||canonical(receipt.lineage)!==canonical(expected))return deny("REPORT_LINEAGE_UNKNOWN");
   const result=await ledger.finishReadOnlyReport(id,requestId,step.step_id,receipt.report_digest,payloadDigest);
   if(!result.ok)return result;
   return {ok:true,status:"HISTORICAL_REPORT_RECEIPT_RECOVERED",review_id:id,run_state:"SUCCEEDED",report_digest:receipt.report_digest,authorization:"NONE",execution:"NO_JIRA_MUTATION"};
  }catch{return deny("REPORT_RECOVERY_STORAGE_UNKNOWN")}
 }
 return {save,refresh,history,revalidate,recoverReport,repairDraft};
}
export {createReviewService};
