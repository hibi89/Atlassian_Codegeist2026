import { validIssueKey, exactKeys, operationSpec, validateArgs } from "../registry/operations.js";
function canonical(value){
  if(value===null||typeof value==="string"||typeof value==="boolean")return JSON.stringify(value);
  if(typeof value==="number"&&Number.isFinite(value))return JSON.stringify(value);
  if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]";
  if(value&&typeof value==="object"&&Object.getPrototypeOf(value)===Object.prototype)return "{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+canonical(value[k])).join(",")+"}";
  throw new TypeError("Noncanonical value");
}

function invalid(code){return {ok:false,code}}

function validatePlan(plan,nowMs){
  const fields=["schema_version","plan_id","issue_key","intent","capability_lock","created_at","expires_at","authorization","status","steps"];
  if(!exactKeys(plan,fields)||plan.schema_version!=="hae.forge.plan.v2"||!validIssueKey(plan.issue_key)||typeof plan.plan_id!=="string"||!/^[a-zA-Z0-9_-]{1,80}$/.test(plan.plan_id))return invalid("IR_SCHEMA_INVALID");
  if(!["change-review","incident-coordinate","release-review"].includes(plan.intent)||plan.capability_lock!=="cg-registry-v1"||plan.authorization!=="NONE"||plan.status!=="EVIDENCE_PENDING")return invalid("IR_PRIVILEGE_INVALID");
  const created=typeof plan.created_at==="string"?Date.parse(plan.created_at):NaN, expires=typeof plan.expires_at==="string"?Date.parse(plan.expires_at):NaN;
  if(!Number.isFinite(nowMs)||!Number.isFinite(created)||!Number.isFinite(expires)||created>nowMs||expires<=nowMs||expires<=created||expires-created>900000)return invalid("IR_STALE");
  if(!Array.isArray(plan.steps)||plan.steps.length<1||plan.steps.length>20)return invalid("IR_STEP_LIMIT");
  const map=new Map();
  for(const s of plan.steps){
    if(!exactKeys(s,["step_id","op_id","version","typed_args","predecessor_ids","side_effect","permitted_scopes"])||typeof s.step_id!=="string"||!/^[a-z0-9_-]{1,40}$/.test(s.step_id)||map.has(s.step_id)||s.version!==1)return invalid("IR_STEP_INVALID");
    const spec=operationSpec(s.op_id);
    if(!spec)return invalid("IR_UNKNOWN_OPERATION");
    if(s.side_effect!==spec.effect||!Array.isArray(s.permitted_scopes)||canonical(s.permitted_scopes)!==canonical(spec.scopes)||!validateArgs(s.op_id,s.typed_args,plan.issue_key))return invalid("IR_EFFECT_OR_SCOPE_INVALID");
    // P1 draft never carries a write-capable operation yet. Registry retains
    // the typed write contract for the future guarded executor.
    if(spec.effect==="WRITE")return invalid("IR_WRITE_NOT_ADMITTED");
    if(!Array.isArray(s.predecessor_ids)||s.predecessor_ids.length>20||s.predecessor_ids.some(x=>typeof x!=="string")||new Set(s.predecessor_ids).size!==s.predecessor_ids.length)return invalid("IR_DEPENDENCY_INVALID");
    map.set(s.step_id,s);
  }
  const active=new Set(),done=new Set(),order=[];
  function visit(id){
    if(active.has(id))return false;
    if(done.has(id))return true;
    if(!map.has(id))return false;
    active.add(id);
    for(const pred of map.get(id).predecessor_ids)if(!visit(pred))return false;
    active.delete(id);done.add(id);order.push(id);return true;
  }
  for(const id of map.keys())if(!visit(id))return invalid("IR_CYCLE_OR_MISSING_DEPENDENCY");
  return {ok:true,order};
}

function makeDraftPlan(intentId,target,nowMs,planId){
  if(!validIssueKey(target)||!Number.isFinite(nowMs)||!["change-review","incident-coordinate","release-review"].includes(intentId))return invalid("IR_SCHEMA_INVALID");
  const ops=intentId==="incident-coordinate"?["jira.issue.read","jira.issue.links.read","evidence.version.check","evidence.contradiction.check","report.evidence.generate"]:["jira.issue.read","evidence.version.check","evidence.contradiction.check","report.evidence.generate"];
  const plan={schema_version:"hae.forge.plan.v2",plan_id:planId,issue_key:target,intent:intentId,capability_lock:"cg-registry-v1",created_at:new Date(nowMs).toISOString(),expires_at:new Date(nowMs+900000).toISOString(),authorization:"NONE",status:"EVIDENCE_PENDING",steps:ops.map((op,i)=>{const spec=operationSpec(op);return {step_id:"s"+(i+1),op_id:op,version:1,typed_args:{issue_key:target},predecessor_ids:i?["s"+i]:[],side_effect:spec.effect,permitted_scopes:spec.scopes}})};
  const valid=validatePlan(plan,nowMs);
  return valid.ok?{ok:true,plan,order:valid.order}:valid;
}

export { canonical, validatePlan, makeDraftPlan };
