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
  const saved=await createReviewStore(store,p,clock,digest).save(result);
  if(!saved.ok)return saved;
  const ledger=createRunLedger(store,p,clock);
  const run=saved.review_id;
  // Do not report a completed save when journal initialization is partial.
  const created=await ledger.create(run,run);
  if(!created.ok)return deny("REVIEW_JOURNAL_PARTIAL");
  for(const [seq,state] of [[1,"EVIDENCE_PENDING"],[2,"POLICY_REVIEW"]]){
   if(!(await ledger.transition(run,seq,state)).ok)return deny("REVIEW_JOURNAL_PARTIAL");
  }
  return {...result,saved_review:{...saved,run_state:"POLICY_REVIEW"}};
 }
 async function refresh(context,id){
  const p=principal(context,digest);
  if(!development()||!p)return deny("DEVELOPMENT_STORAGE_ONLY");
  const review=await createReviewStore(store,p,clock,digest).refresh(id,async (intent,record)=>preview(context,aliases[intent],record));
  if(!review.ok)return review;
  const run=await createRunLedger(store,p,clock).read(id);
  if(!run.ok||run.events[0].plan_hash!==id||!["POLICY_REVIEW","AWAITING_APPROVAL","READY","RUNNING","RECONCILING","SUCCEEDED"].includes(run.state))return deny("REVIEW_JOURNAL_PARTIAL");
  const comment_journal=await readCommentJournal(store,p,id);
  return {...review,comment_journal,run_state:["RUNNING","RECONCILING","AWAITING_APPROVAL","READY"].includes(run.state)?"REPORT_OUTCOME_REVIEW_REQUIRED":run.state};
 }
 return {save,refresh};
}
export {createReviewService};
