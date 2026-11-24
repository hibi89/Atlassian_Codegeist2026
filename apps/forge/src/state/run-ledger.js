function ledgerKey(p,runId,seq){
  if(!p||typeof p.tenant!=="string"||!/^[a-f0-9]{64}$/.test(p.tenant)||typeof p.actor!=="string"||!/^[a-f0-9]{64}$/.test(p.actor)||typeof runId!=="string"||!/^[a-zA-Z0-9_-]{1,80}$/.test(runId)||!Number.isSafeInteger(seq)||seq<0||seq>64)throw Error("RUN_KEY_INVALID");
  return "cg:run:"+p.tenant+":"+p.actor+":"+runId+":"+seq;
}

function makeForgeLedgerStore(kvs){
  if(!kvs||typeof kvs.get!=="function"||typeof kvs.set!=="function")throw Error("STORE_UNAVAILABLE");
  return {get:key=>kvs.get(key),create:(key,value)=>kvs.set(key,value,{keyPolicy:"FAIL_IF_EXISTS"})};
}

function allowedTransition(from,to){
  const next={DRAFT:["EVIDENCE_PENDING","CANCELED"],EVIDENCE_PENDING:["POLICY_REVIEW","CANCELED"],POLICY_REVIEW:["AWAITING_APPROVAL","PAUSED","CANCELED"],AWAITING_APPROVAL:["READY","PAUSED","CANCELED"],READY:["RUNNING","PAUSED","CANCELED"],RUNNING:["RECONCILING","UNKNOWN_OUTCOME_REVIEW"],RECONCILING:["SUCCEEDED","FAILED","UNKNOWN_OUTCOME_REVIEW"],PAUSED:["EVIDENCE_PENDING","CANCELED"],UNKNOWN_OUTCOME_REVIEW:["RECONCILING"],SUCCEEDED:[],FAILED:[],CANCELED:[]};
  return Object.hasOwn(next,from)&&next[from].includes(to);
}

function scopedEvent(e,p,runId,seq){
  return !!e&&e.schema_version==="hae.run.event.v1"&&e.tenant===p.tenant&&e.actor===p.actor&&e.target===p.target&&e.run_id===runId&&e.seq===seq&&typeof e.plan_hash==="string"&&/^[a-f0-9]{64}$/.test(e.plan_hash)&&typeof e.state==="string"&&typeof e.at==="string"&&Number.isFinite(Date.parse(e.at));
}

// Same durable proof is required by both historical inspection and finalization.
async function verifyReportReceipt(store,p,cur,runId,requestId,stepId,reportDigest,expectedPayloadDigest,clock){
  if(!cur?.ok||!["RUNNING","RECONCILING","SUCCEEDED"].includes(cur.state)||cur.events?.at(-1)?.report_request_id!==requestId||cur.events?.[0]?.plan_hash!==runId)return false;
  try{
      const prefix="cg:step:"+p.tenant+":"+p.actor+":"+runId+":"+stepId+":";
      const step=await store.get(prefix+"receipt"),reservation=await store.get(prefix+"reserve");
      const report=await store.get("cg:report:"+p.tenant+":"+p.actor+":"+requestId+":receipt");
      if(reservation?.schema_version!=="hae.step.reservation.v1"||reservation.tenant!==p.tenant||reservation.actor!==p.actor||reservation.target!==p.target||reservation.run_id!==runId||reservation.step_id!==stepId||reservation.plan_hash!==runId||reservation.approval_id!==requestId||typeof reservation.payload_digest!=="string"||!/^[a-f0-9]{64}$/.test(reservation.payload_digest)||reservation.payload_digest!==step?.payload_digest||reservation.payload_digest!==expectedPayloadDigest||step?.schema_version!=="hae.step.receipt.v1"||step.tenant!==p.tenant||step.actor!==p.actor||step.target!==p.target||step.run_id!==runId||step.step_id!==stepId||step.approval_id!==requestId||step.plan_hash!==runId||step.state!=="OBSERVED_SUCCESS"||step.observation_digest!==reportDigest||report?.schema_version!=="hae.report.receipt.v2"||report.tenant!==p.tenant||report.actor!==p.actor||report.target!==p.target||report.request_id!==requestId||report.review_id!==runId||report.report_digest!==reportDigest||report.effect!=="READ_ONLY_REPORT")return false;
    const running=cur.events.find(e=>e.state==="RUNNING"),reconciling=cur.events.find(e=>e.state==="RECONCILING");
    const a=Date.parse(reservation.at),b=Date.parse(step.at),c=report.at,now=clock();
    if(typeof reservation.at!=="string"||typeof step.at!=="string"||!Number.isFinite(a)||!Number.isFinite(b)||!Number.isSafeInteger(c)||!Number.isSafeInteger(now)||!running||a<Date.parse(running.at)||b<a||c<b||c>now||reconciling&&c>Date.parse(reconciling.at))return false;
    return true;
  }catch{return false}
}

function createRunLedger(store,p,clock){
  const bad=code=>({ok:false,code});
  async function read(runId){
    try{
      const events=[];
      for(let seq=0;seq<=64;seq++){
        const e=await store.get(ledgerKey(p,runId,seq));
        if(e===undefined||e===null){
          if(seq===0)return bad("RUN_NOT_FOUND");
          // Check next position for a corrupt gap; no writes ever skip positions.
          if(seq<64&&await store.get(ledgerKey(p,runId,seq+1))!=null)return bad("RUN_JOURNAL_INVALID");
          return {ok:true,events,state:events[events.length-1].state,next_seq:seq};
        }
        if(!scopedEvent(e,p,runId,seq)||seq===0&&e.state!=="DRAFT"||seq>0&&(!allowedTransition(events[seq-1].state,e.state)||events[0].plan_hash!==e.plan_hash||Date.parse(e.at)<Date.parse(events[seq-1].at)))return bad("RUN_JOURNAL_INVALID");
        if(Date.parse(e.at)>clock())return bad("RUN_JOURNAL_CLOCK_INVALID");
        if(["READY","RUNNING","RECONCILING","SUCCEEDED"].includes(e.state)&&(e.execution_kind!=="READ_ONLY_REPORT"||typeof e.report_request_id!=="string"||!/^[a-f0-9]{64}$/.test(e.report_request_id)))return bad("RUN_JOURNAL_AUTHORITY_INVALID");
        if(seq>0&&events[seq-1].execution_kind==="READ_ONLY_REPORT"&&(e.execution_kind!==events[seq-1].execution_kind||e.report_request_id!==events[seq-1].report_request_id))return bad("RUN_JOURNAL_AUTHORITY_INVALID");
        if(["RECONCILING","SUCCEEDED"].includes(e.state)&&(!/^[a-f0-9]{64}$/.test(e.receipt)||e.state==="SUCCEEDED"&&e.receipt!==events[seq-1].receipt))return bad("RUN_JOURNAL_RECEIPT_INVALID");
        events.push(e);
      }
      return bad("RUN_JOURNAL_LIMIT");
    }catch{return bad("RUN_STORAGE_UNKNOWN")}
  }
  async function create(runId,planHash){
    if(typeof planHash!=="string"||!/^[a-f0-9]{64}$/.test(planHash))return bad("RUN_PLAN_INVALID");
    try{
      const event={schema_version:"hae.run.event.v1",tenant:p.tenant,actor:p.actor,target:p.target,run_id:runId,seq:0,plan_hash:planHash,state:"DRAFT",at:new Date(clock()).toISOString(),receipt:null};
      await store.create(ledgerKey(p,runId,0),event);
      return {ok:true,event};
    }catch{return bad("RUN_CREATE_CONFLICT_OR_UNKNOWN")}
  }
  async function transition(runId,expectedSeq,nextState){
    const cur=await read(runId);
    if(!cur.ok)return cur;
    if(cur.next_seq!==expectedSeq||!allowedTransition(cur.state,nextState))return bad("RUN_TRANSITION_DENIED");
    // Until approval and executor are connected, deny every effect-capable or outcome transition.
    if(["READY","RUNNING","RECONCILING","SUCCEEDED","FAILED","UNKNOWN_OUTCOME_REVIEW"].includes(nextState))return bad("RUN_EXECUTION_NOT_ENABLED");
    try{
      const prev=cur.events[cur.events.length-1];
      const event={...prev,seq:expectedSeq,state:nextState,at:new Date(clock()).toISOString(),receipt:null};
      await store.create(ledgerKey(p,runId,expectedSeq),event);
      return {ok:true,event};
    }catch{return bad("RUN_RESERVATION_CONFLICT_OR_UNKNOWN")}
  }
  // Read-only report execution is isolated from the generic transition API.
  // It can start only after a durable, scoped broker consumption.
  async function startReadOnlyReport(runId,requestId,binding){
    if(!/^[a-f0-9]{64}$/.test(runId)||!/^[a-f0-9]{64}$/.test(requestId)||binding?.plan_hash!==runId||binding?.request_digest!==requestId||binding?.policy_version!=="cg-readonly-report-v1"||!Number.isSafeInteger(binding.expires_at)||binding.expires_at<=clock()||binding.policy_decision!=="ALLOW"||binding.graph_status!=="VALID")return bad("REPORT_RUN_BINDING_INVALID");
    try{
      const cur=await read(runId);
      if(!cur.ok||cur.state!=="POLICY_REVIEW"||cur.events[0].plan_hash!==runId||cur.next_seq!==3)return bad("REPORT_RUN_ALREADY_STARTED_OR_UNKNOWN");
      const prefix="cg:approval:"+p.tenant+":"+p.actor+":"+requestId+":";
      const approval=await store.get(prefix+"record"),terminal=await store.get(prefix+"terminal");
      if(approval?.schema_version!=="hae.approval.v2"||approval.approval_id!==requestId||approval.tenant!==p.tenant||approval.actor!==p.actor||approval.target!==p.target||approval.decision!=="APPROVED"||!Number.isSafeInteger(approval.expires_at)||approval.expires_at>binding.expires_at||approval.expires_at<=clock()||terminal?.schema_version!=="hae.approval.terminal.v1"||terminal.approval_id!==requestId||terminal.state!=="CONSUMED"||!Number.isSafeInteger(terminal.at)||!Number.isSafeInteger(approval.created_at)||terminal.at<approval.created_at||terminal.at>=approval.expires_at||approval.created_at>clock()||terminal.at>clock()||["plan_hash","evidence_bundle_hash","dependency_digest","policy_version","capability_lock","request_digest"].some(k=>approval[k]!==binding[k]))return bad("REPORT_RUN_APPROVAL_UNKNOWN");
      let prev=cur.events[cur.events.length-1],seq=cur.next_seq;
      for(const state of ["AWAITING_APPROVAL","READY","RUNNING"]){
        const at=clock();
        if(!Number.isSafeInteger(at)||at<terminal.at||at>=approval.expires_at)return bad("REPORT_RUN_APPROVAL_EXPIRED");
        const event={...prev,seq,state,at:new Date(at).toISOString(),receipt:null,execution_kind:"READ_ONLY_REPORT",report_request_id:requestId};
        await store.create(ledgerKey(p,runId,seq),event);prev=event;seq++;
      }
      return {ok:true,state:"RUNNING"};
    }catch{return bad("REPORT_RUN_START_CONFLICT_OR_UNKNOWN")}
  }
  async function finishReadOnlyReport(runId,requestId,stepId,reportDigest,expectedPayloadDigest){
    if(!/^[a-f0-9]{64}$/.test(runId)||!/^[a-f0-9]{64}$/.test(requestId)||!/^[a-f0-9]{64}$/.test(reportDigest)||typeof stepId!=="string"||!/^[a-z0-9_-]{1,40}$/.test(stepId)||typeof expectedPayloadDigest!=="string"||!/^[a-f0-9]{64}$/.test(expectedPayloadDigest))return bad("REPORT_RUN_BINDING_INVALID");
    try{
      const cur=await read(runId),last=cur.events?.[cur.events.length-1];
      if(!cur.ok||!["RUNNING","RECONCILING","SUCCEEDED"].includes(cur.state)||last?.execution_kind!=="READ_ONLY_REPORT"||last.report_request_id!==requestId)return bad("REPORT_RUN_NOT_RUNNING");
      if(!await verifyReportReceipt(store,p,cur,runId,requestId,stepId,reportDigest,expectedPayloadDigest,clock))return bad("REPORT_RECEIPT_UNKNOWN");
      if(cur.state!=="RUNNING"&&last.receipt!==reportDigest)return bad("REPORT_RECEIPT_MISMATCH");
      if(cur.state==="SUCCEEDED")return {ok:true,state:"SUCCEEDED",historical:true};
      let prev=last,seq=cur.next_seq;
      for(const state of cur.state==="RUNNING"?["RECONCILING","SUCCEEDED"]:["SUCCEEDED"]){
        const event={...prev,seq,state,at:new Date(clock()).toISOString(),receipt:reportDigest};
        await store.create(ledgerKey(p,runId,seq),event);prev=event;seq++;
      }
      return {ok:true,state:"SUCCEEDED"};
    }catch{return bad("REPORT_RUN_FINISH_CONFLICT_OR_UNKNOWN")}
  }
  return {read,create,transition,startReadOnlyReport,finishReadOnlyReport};
}

export { makeForgeLedgerStore,createRunLedger,allowedTransition,verifyReportReceipt };
