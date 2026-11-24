import { assessRelease } from "../evidence/release-assessment.js";
import { selectiveChecks } from "../lineage/selective-checks.js";
import { analyzeImpact } from "../lineage/impact.js";
import { buildObservedGraph } from "../lineage/observed-graph.js";
import { canonical } from "../core/ir/plan.js";
import { reviewClaims } from "../evidence/typed-claims.js";
import { principal, refreshEvidence } from "../evidence/bundle.js";
function evaluatePolicy(p,planResult,evidence,freshness,now,checkPlan,digest){
  const deny=reason=>({decision:"DENY",reason,policy_version:"cg-policy-v1",authorization:"NONE",execution:"DISABLED"});
  const review=reason=>({decision:"REVIEW",reason,policy_version:"cg-policy-v1",authorization:"NONE",execution:"DISABLED"});
  if(!p||!planResult?.ok||!planResult.plan)return deny("AUTH_OR_PLAN_INVALID");
  const {plan_hash,...plan}=planResult.plan;
  let check;
  try{check=checkPlan(plan,now);if(!check.ok||digest(plan)!==plan_hash)return deny("PLAN_INVALID_OR_TAMPERED")}catch{return deny("PLAN_INVALID_OR_TAMPERED")}
  if(plan.issue_key!==p.target)return deny("TARGET_SCOPE_MISMATCH");
  if(plan.steps.some(s=>s.side_effect==="WRITE"||s.permitted_scopes.some(sc=>sc!=="read:jira-work")))return deny("UNAUTHORIZED_EFFECT_OR_SCOPE");
  if(!evidence||evidence.installation_ref!==p.tenant||evidence.actor_ref!==p.actor||evidence.target!==p.target)return deny("EVIDENCE_SCOPE_MISMATCH");
  if(!Array.isArray(evidence.sources)||!evidence.sources.length||evidence.sources.some(s=>s.installation_ref!==p.tenant))return deny("EVIDENCE_SCOPE_MISMATCH");
  if(evidence.coverage!=="BOUNDED_READ_COMPLETE"||evidence.sources.some(s=>s.status!=="VERSION_OBSERVED")||freshness?.status!=="CURRENT_OBSERVED")return review("EVIDENCE_FRESHNESS_OR_COVERAGE_UNKNOWN");
  // Only preview, never a capability grant. Real write/graph/approval gates not present.
  return {decision:"ALLOW_PREVIEW",reason:"SCOPED_READ_ONLY_DRAFT",policy_version:"cg-policy-v1",authorization:"NONE",execution:"DISABLED",graph_status:"NOT_IMPLEMENTED"};
}

async function guardedPreview(context,input,services,savedRecord){
  const p=principal(context,services.digest);
  if(!p)return {ok:false,code:"AUTH_CONTEXT_REQUIRED"};
  const draft=services.preview(context,input,services.clock());
  if(!draft.ok)return draft;
  const observed=await refreshEvidence(context,services.adapter,services.digest,services.clock);
  if(!observed.ok)return {...draft,...(draft.plan.intent==="release-review"?{release_assessment:assessRelease(null,null,null)}:{}),policy:{decision:"REVIEW",reason:observed.code,policy_version:"cg-policy-v1",authorization:"NONE",execution:"DISABLED"},evidence:null};
  const reuse=savedRecord?selectiveChecks(p,savedRecord,observed.evidence,services.digest,services.clock()):undefined;
  const claim_review=reviewClaims(observed.evidence,reuse);
  let policy=evaluatePolicy(p,draft,observed.evidence,observed.freshness,services.clock(),services.checkPlan,services.planDigest);
  if(policy.decision==="ALLOW_PREVIEW"&&claim_review.reason==="CLAIMS_UNKNOWN")policy={...policy,decision:"REVIEW",reason:"CLAIMS_UNKNOWN"};
  if(policy.decision==="ALLOW_PREVIEW"&&claim_review.status==="CONFLICT_FOUND")policy={...policy,decision:"REVIEW",reason:"CLAIM_CONFLICT"};
  // Compare against the first observed dependency graph, never a client-provided graph.
  const prior=observed.previous_evidence;
  const priorGraph=buildObservedGraph(p,draft,prior,reviewClaims(prior,savedRecord?selectiveChecks(p,savedRecord,prior,services.digest,services.clock()):undefined),policy,services.digest,canonical);
  const impact=analyzeImpact(p,priorGraph,observed.freshness);
  // Do not return prior source identifiers after a potentially revoked read.
  const impact_summary=impact.ok?{status:impact.status,affected_count:impact.affected.length,unaffected_count:impact.unaffected.length,stale_approval_count:impact.stale_approvals.length,authorization:"NONE"}:{status:"HOLD",code:impact.code,authorization:"NONE"};
  if(!impact.ok&&policy.decision==="ALLOW_PREVIEW")policy={...policy,decision:"REVIEW",reason:impact.code};
  const visibleGraph=buildObservedGraph(p,draft,observed.evidence,claim_review,policy,services.digest,canonical);
  if(!visibleGraph.ok&&policy.decision==="ALLOW_PREVIEW")policy={...policy,decision:"REVIEW",reason:"GRAPH_UNKNOWN"};
  // Compare using complete internal refs, but never expose an identifier from a
  // previous observation when it is absent from the final authorized read.
  const visibleRefs=new Set(observed.evidence.sources.map(s=>s.source_ref));
  const freshness={...observed.freshness};
  for(const k of ["changed","unchanged","unknown"]){
    const refs=Array.isArray(freshness[k])?freshness[k]:[];
    freshness[k]=refs.filter(ref=>visibleRefs.has(ref));
    freshness[k+"_count"]=refs.length;
  }
  return {...draft,...(draft.plan.intent==="release-review"?{release_assessment:assessRelease(observed.evidence,claim_review,observed.freshness)}:{}),evidence:observed.evidence,freshness,claim_review,policy:{...policy,graph_status:visibleGraph.ok?"OBSERVED_PREVIEW_ONLY":"UNKNOWN"},graph:visibleGraph,impact_summary};
}

export { evaluatePolicy, guardedPreview };
