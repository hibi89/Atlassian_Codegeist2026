// Internal immutable step reservation and outcome journal. No direct resolver or external dispatch.
function createStepLedger(store,runLedger,p,clock){
  const hex=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
  const token=x=>typeof x==="string"&&/^[a-zA-Z0-9_-]{1,80}$/.test(x);
  const bad=code=>({ok:false,code});
  const scoped=()=>p&&hex(p.tenant)&&hex(p.actor)&&typeof p.target==="string"&&p.target.length<=64&&/^[A-Z][A-Z0-9_]*-[1-9][0-9]*$/.test(p.target);
  const key=(run,step,kind)=>`cg:step:${p.tenant}:${p.actor}:${run}:${step}:${kind}`;
  const match=(r,run,step)=>r&&r.schema_version==="hae.step.reservation.v1"&&r.tenant===p.tenant&&r.actor===p.actor&&r.target===p.target&&r.run_id===run&&r.step_id===step&&hex(r.plan_hash)&&hex(r.payload_digest)&&hex(r.approval_id);
  const runningEvent=(state,approval)=>state?.events?.find(e=>e.state==="RUNNING"&&e.execution_kind==="READ_ONLY_REPORT"&&e.report_request_id===approval);
  async function read(run,step){
    if(!scoped()||!token(run)||!token(step))return bad("STEP_CONTEXT_INVALID");
    try{
      const state=await runLedger.read(run);
      if(!state.ok)return bad("STEP_RUN_UNKNOWN");
      const reservation=await store.get(key(run,step,"reserve"));
      const receipt=await store.get(key(run,step,"receipt"));
      if(reservation==null)return receipt==null?bad("STEP_NOT_RESERVED"):bad("STEP_JOURNAL_INVALID");
      const start=runningEvent(state,reservation.approval_id),at=Date.parse(reservation.at),now=clock();
      if(!match(reservation,run,step)||state.events?.[0]?.plan_hash!==reservation.plan_hash||!start||typeof reservation.at!=="string"||!Number.isFinite(at)||at<Date.parse(start.at)||at>now)return bad("STEP_JOURNAL_INVALID");
      if(receipt!=null&&(receipt.schema_version!=="hae.step.receipt.v1"||receipt.tenant!==p.tenant||receipt.actor!==p.actor||receipt.target!==p.target||receipt.run_id!==run||receipt.step_id!==step||receipt.payload_digest!==reservation.payload_digest||receipt.plan_hash!==reservation.plan_hash||receipt.approval_id!==reservation.approval_id||!["OBSERVED_SUCCESS","DEFINITIVE_FAILURE","UNKNOWN_OUTCOME_REVIEW"].includes(receipt.state)||!hex(receipt.observation_digest)||typeof receipt.at!=="string"||!Number.isFinite(Date.parse(receipt.at))||Date.parse(receipt.at)<at||Date.parse(receipt.at)>now))return bad("STEP_JOURNAL_INVALID");
      return {ok:true,reservation,receipt:receipt??null,state:receipt?.state??"UNKNOWN_OUTCOME_REVIEW"};
    }catch{return bad("STEP_STORAGE_UNKNOWN")}
  }
  async function reserve(run,step,binding){
    if(!scoped()||!token(run)||!token(step)||!binding||!hex(binding.plan_hash)||!hex(binding.payload_digest)||!hex(binding.approval_id))return bad("STEP_CONTEXT_INVALID");
    try{
      const current=await runLedger.read(run);
      if(!current.ok||current.state!=="RUNNING"||current.events?.[0]?.plan_hash!==binding.plan_hash||!runningEvent(current,binding.approval_id))return bad("STEP_RUN_NOT_AUTHORIZED");
      // Internal caller must already have passed prewrite/approval gate.
      // Reservation is never a permission grant; only a successful new insert is dispatchable.
      const reservation={schema_version:"hae.step.reservation.v1",tenant:p.tenant,actor:p.actor,target:p.target,run_id:run,step_id:step,plan_hash:binding.plan_hash,payload_digest:binding.payload_digest,approval_id:binding.approval_id,at:new Date(clock()).toISOString()};
      await store.create(key(run,step,"reserve"),reservation);
      return {ok:true,reservation};
    }catch{return bad("STEP_RESERVATION_CONFLICT_OR_UNKNOWN")}
  }
  async function record(run,step,outcome){
    const observed=await read(run,step);
    if(!observed.ok)return observed;
    if(observed.receipt)return bad("STEP_ALREADY_RECORDED");
    if(!outcome||!["OBSERVED_SUCCESS","DEFINITIVE_FAILURE","UNKNOWN_OUTCOME_REVIEW"].includes(outcome.state)||!hex(outcome.observation_digest)||outcome.payload_digest!==observed.reservation.payload_digest)return bad("STEP_OUTCOME_INVALID");
    // An outcome is a trusted reconciler result; no client-supplied success claim.
    try{
      const {tenant,actor,target,run_id,step_id,plan_hash,payload_digest,approval_id}=observed.reservation;
      const receipt={schema_version:"hae.step.receipt.v1",tenant,actor,target,run_id,step_id,plan_hash,payload_digest,approval_id,state:outcome.state,observation_digest:outcome.observation_digest,at:new Date(clock()).toISOString()};
      await store.create(key(run,step,"receipt"),receipt);
      return {ok:true,receipt};
    }catch{return bad("STEP_RECEIPT_CONFLICT_OR_UNKNOWN")}
  }
  return {read,reserve,record};
}
export { createStepLedger };
