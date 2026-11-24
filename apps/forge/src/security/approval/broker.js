// Internal-only approval broker. Requires a trusted server caller and atomic create-if-absent storage.
// Never expose issue/consume as raw resolvers; current preview policy is not ALLOW.
function createApprovalBroker(store,clock){
  const hex=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
  const token=x=>typeof x==="string"&&/^[a-zA-Z0-9_-]{1,80}$/.test(x);
  const bad=code=>({ok:false,code});
  const fields=["plan_hash","evidence_bundle_hash","dependency_digest","policy_version","capability_lock","request_digest"];
  const valid=(p,b,now)=>p&&hex(p.tenant)&&hex(p.actor)&&typeof p.target==="string"&&p.target.length<=64&&/^[A-Z][A-Z0-9_]*-[1-9][0-9]*$/.test(p.target)&&b&&hex(b.plan_hash)&&hex(b.evidence_bundle_hash)&&hex(b.dependency_digest)&&hex(b.request_digest)&&token(b.policy_version)&&token(b.capability_lock)&&Number.isSafeInteger(b.expires_at)&&b.expires_at>now&&Number.isSafeInteger(now)&&now>=0&&b.graph_status==="VALID"&&b.policy_decision==="ALLOW";
  const key=(p,id,kind)=>`cg:approval:${p.tenant}:${p.actor}:${id}:${kind}`;
  const same=(r,p,b)=>r&&r.schema_version==="hae.approval.v2"&&r.tenant===p.tenant&&r.actor===p.actor&&r.target===p.target&&fields.every(k=>r[k]===b[k]);
  async function issue(p,b,confirmation){
    // Trusted server binding includes a unique request digest containing a server nonce.
    // Browser may confirm that digest only; it cannot supply b or grant a scope.
    const now=clock();
    if(!valid(p,b,now)||confirmation!==b.request_digest)return bad("APPROVAL_REQUEST_DENIED");
    try{
      const id=b.request_digest;
      const receipt={schema_version:"hae.approval.v2",approval_id:id,tenant:p.tenant,actor:p.actor,target:p.target,created_at:now,expires_at:Math.min(b.expires_at,now+300000),decision:"APPROVED"};
      for(const k of fields)receipt[k]=b[k];
      await store.create(key(p,id,"record"),receipt);
      return {ok:true,approval_id:id,expires_at:receipt.expires_at};
    }catch{return bad("APPROVAL_DUPLICATE_OR_STORAGE_UNKNOWN")}
  }
  async function inspect(p,id,b){
    const now=clock();
    if(!valid(p,b,now)||!hex(id)||id!==b.request_digest)return bad("APPROVAL_CONTEXT_DENIED");
    try{
      const r=await store.get(key(p,id,"record"));
      if(!same(r,p,b)||r.approval_id!==id||r.decision!=="APPROVED"||!Number.isSafeInteger(r.created_at)||!Number.isSafeInteger(r.expires_at)||r.created_at>now||r.expires_at<=r.created_at||r.expires_at-r.created_at>300000)return bad("APPROVAL_STALE_OR_MISSING");
      if(r.expires_at<=now)return bad("APPROVAL_EXPIRED");
      if(await store.get(key(p,id,"terminal"))!=null)return bad("APPROVAL_TERMINATED");
      return {ok:true,receipt:r};
    }catch{return bad("APPROVAL_STORAGE_UNKNOWN")}
  }
  async function consume(p,id,b){
    const checked=await inspect(p,id,b);
    if(!checked.ok)return checked;
    // Consume and revoke contend on the same atomic create-if-absent key.
    try{
      const now=clock();
      if(!valid(p,b,now)||checked.receipt.expires_at<=now)return bad("APPROVAL_EXPIRED");
      await store.create(key(p,id,"terminal"),{schema_version:"hae.approval.terminal.v1",approval_id:id,state:"CONSUMED",at:now});
      return {ok:true,receipt:checked.receipt};
    }catch{return bad("APPROVAL_TERMINATED_OR_STORAGE_UNKNOWN")}
  }
  async function revoke(p,id){
    if(!p||!hex(p.tenant)||!hex(p.actor)||!hex(id)||typeof p.target!=="string")return bad("APPROVAL_CONTEXT_DENIED");
    try{
      const r=await store.get(key(p,id,"record"));
      if(!r||r.schema_version!=="hae.approval.v2"||r.tenant!==p.tenant||r.actor!==p.actor||r.target!==p.target||r.approval_id!==id)return bad("APPROVAL_STALE_OR_MISSING");
      const now=clock();
      if(!Number.isSafeInteger(now)||!Number.isSafeInteger(r.created_at)||now<r.created_at)return bad("APPROVAL_CLOCK_UNKNOWN");
      await store.create(key(p,id,"terminal"),{schema_version:"hae.approval.terminal.v1",approval_id:id,state:"REVOKED",at:now});
      return {ok:true};
    }catch{return bad("APPROVAL_TERMINATED_OR_STORAGE_UNKNOWN")}
  }
  return {issue,inspect,consume,revoke};
}
export { createApprovalBroker };
