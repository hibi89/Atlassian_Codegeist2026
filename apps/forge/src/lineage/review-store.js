import { canonical, validatePlan } from "../core/ir/plan.js";
import { compareEvidence } from "../evidence/bundle.js";
import { buildObservedGraph } from "./observed-graph.js";
import { analyzeImpact } from "./impact.js";
const hex=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
const bad=code=>({ok:false,code,authorization:"NONE",execution:"DISABLED"});
const intents=new Set(["change-review","incident-coordinate","release-review"]);
const ttlMs=24*60*60*1000;
function scope(p){return p&&hex(p.tenant)&&hex(p.actor)&&typeof p.target==="string"&&/^[A-Z][A-Z0-9_]*-[1-9][0-9]*$/.test(p.target)&&p.target.length<=64}
function scopedGraph(p,g){return g?.ok===true&&g.installation_ref===p.tenant&&g.actor_ref===p.actor&&g.target===p.target&&g.coverage==="BOUNDED_READ_COMPLETE"&&hex(g.graph_revision)&&Array.isArray(g.nodes)&&Array.isArray(g.edges)}
function scopedEvidence(p,e){return e?.installation_ref===p.tenant&&e.actor_ref===p.actor&&e.target===p.target&&e.coverage==="BOUNDED_READ_COMPLETE"&&Array.isArray(e.sources)&&e.sources.length>0&&e.sources.length<=7&&hex(e.bundle_hash)&&e.sources.every(s=>s.installation_ref===p.tenant&&hex(s.source_ref)&&hex(s.revision_key)&&hex(s.content_digest)&&s.status==="VERSION_OBSERVED"&&typeof s.version==="string"&&Number.isFinite(Date.parse(s.version))&&typeof s.freshness_deadline==="string")}
function evidenceMetadata(e){
 return {installation_ref:e.installation_ref,actor_ref:e.actor_ref,target:e.target,coverage:e.coverage,bundle_hash:e.bundle_hash,sources:e.sources.map(s=>({installation_ref:s.installation_ref,source_ref:s.source_ref,revision_key:s.revision_key,content_digest:s.content_digest,version:s.version,status:s.status,freshness_deadline:s.freshness_deadline}))};
}
function graphMetadata(g){return {ok:true,schema_version:g.schema_version,installation_ref:g.installation_ref,actor_ref:g.actor_ref,target:g.target,coverage:g.coverage,graph_revision:g.graph_revision,nodes:g.nodes.map(n=>({id:n.id,installation_ref:n.installation_ref,kind:n.kind,ref:n.ref,version:n.version,digest:n.digest})),edges:g.edges.map(e=>({from_dependency:e.from_dependency,to_dependent:e.to_dependent,relation:e.relation}))}}
function createReviewStore(store,p,clock,digest){
 const key=(id,kind)=>"cg:review:"+p.tenant+":"+p.actor+":"+id+":"+kind;
 function validRecord(r,id){
  const now=clock();
  if(!r||r.schema_version!=="hae.review.snapshot.v2"||r.id!==id||r.tenant!==p.tenant||r.actor!==p.actor||r.target!==p.target||!intents.has(r.intent)||!Number.isSafeInteger(r.created_at)||!Number.isSafeInteger(r.expires_at)||r.created_at>now||r.expires_at<=now||r.expires_at-r.created_at!==ttlMs||!scopedGraph(p,r.graph)||!scopedEvidence(p,r.evidence)||!r.plan||r.plan.issue_key!==p.target||r.plan.intent!==r.intent||digest(canonical(r.plan))!==id)return false;
  const {record_digest,...body}=r;return hex(record_digest)&&digest(canonical(body))===record_digest;
 }
 async function save(preview){
  const now=clock();
  if(!scope(p)||!Number.isSafeInteger(now)||!preview?.ok||preview.policy?.decision!=="ALLOW_PREVIEW"||preview.freshness?.status!=="CURRENT_OBSERVED"||!hex(preview.plan?.plan_hash)||preview.plan.issue_key!==p.target||!intents.has(preview.plan.intent)||!scopedGraph(p,preview.graph)||!scopedEvidence(p,preview.evidence))return bad("REVIEW_NOT_SAVEABLE");
  try{
   const {plan_hash:id,...plan}=preview.plan;
   if(!validatePlan(plan,now).ok||digest(canonical(plan))!==id)return bad("REVIEW_PLAN_INVALID");
   const coverage=analyzeImpact(p,preview.graph,preview.freshness);if(!coverage.ok||coverage.affected.length)return bad("REVIEW_GRAPH_INVALID");
   const body={schema_version:"hae.review.snapshot.v2",id,tenant:p.tenant,actor:p.actor,target:p.target,intent:preview.plan.intent,plan,created_at:now,expires_at:now+ttlMs,graph:graphMetadata(preview.graph),evidence:evidenceMetadata(preview.evidence),policy_version:preview.policy.policy_version};
   const record={...body,record_digest:digest(canonical(body))};
   if(!validRecord(record,id)||Buffer.byteLength(JSON.stringify(record),"utf8")>61440)return bad("REVIEW_STORAGE_LIMIT");
   // Explicit save only; immutable snapshot. No raw Jira descriptions or claim values.
   await store.create(key(id,"snapshot"),record);
   return {ok:true,review_id:id,expires_at:body.expires_at,authorization:"NONE",execution:"DISABLED"};
  }catch{return bad("REVIEW_SAVE_CONFLICT_OR_UNKNOWN")}
 }
 async function inspectCurrent(id,loadCurrent,internal){
  if(!scope(p)||!hex(id))return bad("REVIEW_UNAVAILABLE");
  try{
   const r=await store.get(key(id,"snapshot"));
   if(!validRecord(r,id))return bad("REVIEW_UNAVAILABLE");
   // Current source access is required for returning any historical status.
   // Unknown access or topology changes permanently invalidate this snapshot.
   async function invalidate(reason){
    const existing=await store.get(key(id,"invalidated"));
    const matches=m=>m?.schema_version==="hae.review.invalidation.v1"&&m.snapshot_digest===r.record_digest&&m.review_id===id;
    if(existing!=null)return matches(existing);
    const value={schema_version:"hae.review.invalidation.v1",review_id:id,snapshot_digest:r.record_digest,reason,at:clock()};
    try{await store.create(key(id,"invalidated"),value);return true}catch{return matches(await store.get(key(id,"invalidated")))}
   }
   let current;
   try{current=await loadCurrent(r.intent)}catch{current=null}
   if(!current?.ok||!scopedEvidence(p,current.evidence)||!scopedGraph(p,current.graph)){
    if(!await invalidate("ACCESS_OR_COVERAGE_UNKNOWN"))return bad("REVIEW_INVALIDATION_UNKNOWN");
    return bad("REVIEW_ACCESS_OR_COVERAGE_UNKNOWN");
   }
   const now=clock();if(!validRecord(r,id))return bad("REVIEW_UNAVAILABLE");
   const f=compareEvidence(r.evidence,current.evidence,now);
   const impact=analyzeImpact(p,r.graph,f);
   if(!impact.ok){if(!await invalidate("DEPENDENCY_UNKNOWN_OR_CHANGED"))return bad("REVIEW_INVALIDATION_UNKNOWN");return bad(impact.code)}
   const rebound=buildObservedGraph(p,{plan:{...r.plan,plan_hash:id}},current.evidence,current.claim_review,current.policy,digest,canonical);
   const policyChanged=current.policy?.policy_version!==r.policy_version||current.policy?.decision!=="ALLOW_PREVIEW"||current.freshness?.status!=="CURRENT_OBSERVED"||!rebound.ok||rebound.graph_revision!==r.graph.graph_revision;
   const marker=await store.get(key(id,"invalidated"));
   if(marker!=null&&(marker.schema_version!=="hae.review.invalidation.v1"||marker.snapshot_digest!==r.record_digest||marker.review_id!==id))return bad("REVIEW_INVALIDATION_UNKNOWN");
   const stale=marker!=null||impact.affected.length>0||policyChanged;
   if(stale&&!await invalidate(policyChanged?"POLICY_CHANGED_OR_REVIEW":"DEPENDENCY_CHANGED"))return bad("REVIEW_INVALIDATION_UNKNOWN");
   if(internal){if(stale||!validatePlan(r.plan,now).ok)return bad("REPORT_REVIEW_STALE_OR_EXPIRED");return {ok:true,record:r,current};}
   return {ok:true,review_id:id,status:stale?"STALE_REVIEW_REQUIRED":"NO_CHANGE_OBSERVED",affected_count:impact.affected.length,unaffected_count:impact.unaffected.length,persisted_invalidation:stale,authorization:"NONE",execution:"DISABLED"};
  }catch{return bad("REVIEW_STORAGE_UNKNOWN")}
 }
 return {save,refresh:(id,loadCurrent)=>inspectCurrent(id,loadCurrent,false),authorizeReadOnly:(id,loadCurrent)=>inspectCurrent(id,loadCurrent,true)};
}
export {createReviewStore};
