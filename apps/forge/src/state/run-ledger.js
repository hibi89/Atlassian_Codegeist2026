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
  return !!e&&e.schema_version==="hae.run.event.v1"&&e.tenant===p.tenant&&e.actor===p.actor&&e.target===p.target&&e.run_id===runId&&e.seq===seq&&typeof e.plan_hash==="string"&&/^[a-f0-9]{64}$/.test(e.plan_hash)&&typeof e.state==="string";
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
        if(!scopedEvent(e,p,runId,seq)||seq===0&&e.state!=="DRAFT"||seq>0&&(!allowedTransition(events[seq-1].state,e.state)||events[0].plan_hash!==e.plan_hash))return bad("RUN_JOURNAL_INVALID");
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
  return {read,create,transition};
}

export { makeForgeLedgerStore,createRunLedger,allowedTransition };
