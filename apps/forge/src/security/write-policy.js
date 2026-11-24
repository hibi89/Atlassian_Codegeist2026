import {canonical} from "../core/ir/plan.js";
import {exactKeys,validateArgs} from "../core/registry/operations.js";
const hex=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
export const WRITE_POLICY="cg-demo-comment-v1";
export const WRITE_CAPABILITY="cg-demo-comment-registry-v1";
export const DEMO_ISSUE="HTF-2";
export const denyWrite=code=>({ok:false,code,authorization:"NONE",execution:"DISABLED"});
export function demoComment(target,evidence,nonce){
 return "HAE TrustFlow synthetic demo review for "+target+". Observed evidence snapshot SHA-256: "+evidence+". This is a human-approved review annotation, not a certification or release approval. TrustFlow reference: "+nonce;
}
export function makeCommentPlan(p,record,nonce,now){
 if(!p||p.target!==DEMO_ISSUE||!hex(nonce)||!hex(record?.id)||!hex(record.evidence?.bundle_hash)||!hex(record.graph?.graph_revision)||!["change-review","incident-coordinate"].includes(record.intent))return null;
 const expires=Math.min(now+120000,Date.parse(record.plan.expires_at));
 if(!Number.isSafeInteger(now)||!Number.isSafeInteger(expires)||expires<=now)return null;
 return {schema_version:"hae.forge.comment-plan.v1",review_id:record.id,tenant:p.tenant,actor:p.actor,target:p.target,intent:record.intent,capability_lock:WRITE_CAPABILITY,policy_version:WRITE_POLICY,created_at:now,expires_at:expires,nonce,evidence_bundle_hash:record.evidence.bundle_hash,dependency_digest:record.graph.graph_revision,operation:"jira.issue.comment.create",scope:"write:jira-work",typed_args:{issue_key:p.target,comment:demoComment(p.target,record.evidence.bundle_hash,nonce)}};
}
export function validateCommentPlan(p,plan,now,{allowExpired=false}={}){
 const fields=["schema_version","review_id","tenant","actor","target","intent","capability_lock","policy_version","created_at","expires_at","nonce","evidence_bundle_hash","dependency_digest","operation","scope","typed_args"];
 if(!p||!hex(p.tenant)||!hex(p.actor)||p.target!==DEMO_ISSUE||!exactKeys(plan,fields)||plan.schema_version!=="hae.forge.comment-plan.v1"||plan.tenant!==p.tenant||plan.actor!==p.actor||plan.target!==p.target||!["change-review","incident-coordinate"].includes(plan.intent)||plan.capability_lock!==WRITE_CAPABILITY||plan.policy_version!==WRITE_POLICY||plan.operation!=="jira.issue.comment.create"||plan.scope!=="write:jira-work"||![plan.review_id,plan.nonce,plan.evidence_bundle_hash,plan.dependency_digest].every(hex)||!Number.isSafeInteger(now)||!Number.isSafeInteger(plan.created_at)||!Number.isSafeInteger(plan.expires_at)||plan.created_at>now||plan.expires_at<=plan.created_at||plan.expires_at-plan.created_at>120000||(!allowExpired&&plan.expires_at<=now)||!validateArgs(plan.operation,plan.typed_args,p.target)||plan.typed_args.comment!==demoComment(p.target,plan.evidence_bundle_hash,plan.nonce))return denyWrite("WRITE_PLAN_INVALID_OR_EXPIRED");
 return {ok:true};
}
export function writeBinding(p,plan,record,current,id,digest,now){
 if(!validateCommentPlan(p,plan,now).ok||record?.id!==plan.review_id||record.intent!==plan.intent||record.evidence?.bundle_hash!==plan.evidence_bundle_hash||record.graph?.graph_revision!==plan.dependency_digest||current?.policy?.decision!=="ALLOW_PREVIEW"||current?.freshness?.status!=="CURRENT_OBSERVED"||current?.claim_review?.status==="CONFLICT_FOUND"||!["HUMAN_REVIEW_REQUIRED","CONFLICT_FOUND"].includes(current?.claim_review?.status)||!Array.isArray(current.evidence?.sources)||!current.evidence.sources.length||current.evidence.coverage!=="BOUNDED_READ_COMPLETE")return denyWrite("WRITE_DEPENDENCY_OR_POLICY_DENIED");
 const freshUntil=Math.min(...current.evidence.sources.map(s=>Date.parse(s.freshness_deadline)));
 if(!Number.isFinite(freshUntil)||freshUntil<=now||plan.expires_at>freshUntil)return denyWrite("WRITE_EVIDENCE_EXPIRED");
 const plan_hash=digest(canonical(plan));
 if(!hex(plan_hash)||id!==plan_hash)return denyWrite("WRITE_PLAN_DIGEST_MISMATCH");
 return {ok:true,binding:{plan_hash,evidence_bundle_hash:plan.evidence_bundle_hash,dependency_digest:plan.dependency_digest,policy_version:WRITE_POLICY,capability_lock:WRITE_CAPABILITY,request_digest:id,expires_at:plan.expires_at,policy_decision:"ALLOW",graph_status:"VALID"}};
}
