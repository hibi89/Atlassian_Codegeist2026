import {canonical} from "../core/ir/plan.js";
export function commentBody(text){return {version:1,type:"doc",content:[{type:"paragraph",content:[{type:"text",text}]}]}}
export function commentObservationDigest(plan,id,digest){return digest(canonical([id,plan.target,commentBody(plan.typed_args.comment)]))}
export function commentLineage(p,plan,id,observation,digest){
  const node=(kind,ref,value)=>({id:digest(canonical([p.tenant,p.actor,kind,ref])),installation_ref:p.tenant,kind,ref,digest:value});
  const planNode=node("PLAN",id,id),policyNode=node("POLICY",id,digest(canonical([plan.policy_version,plan.dependency_digest]))),approvalNode=node("APPROVAL",id,id),stepNode=node("STEP",id,digest(canonical(commentBody(plan.typed_args.comment)))),receiptNode=node("RECEIPT",id,observation.observation_digest);
  const edge=(from,to,relation)=>({from_dependency:from,to_dependent:to.id,relation});
  return {schema_version:"hae.comment.lineage.v1",base_graph_revision:plan.dependency_digest,nodes:[planNode,policyNode,approvalNode,stepNode,receiptNode],edges:[edge(plan.policy_node_id,planNode,"BOUND_EVIDENCE_PLAN"),edge(planNode.id,policyNode,"WRITE_POLICY"),edge(policyNode.id,approvalNode,"EXACT_APPROVAL"),edge(approvalNode.id,stepNode,"APPROVED_COMMENT"),edge(stepNode.id,receiptNode,"JIRA_READBACK")]};
 }

export function reportLineage(p,record,id,step,payloadDigest,reportDigest,digest){
 const policyNode=record.graph.nodes.find(n=>n.kind==="POLICY");
 if(!policyNode)return null;
 const approvalNode=digest(canonical([p.tenant,"APPROVAL",id]));
 const stepNode=digest(canonical([p.tenant,"STEP",record.id,step.step_id,id]));
 const receiptNode=digest(canonical([p.tenant,"RECEIPT",id,reportDigest]));
 return {schema_version:"hae.report.lineage.v1",graph_revision:record.graph.graph_revision,nodes:[{id:approvalNode,kind:"APPROVAL",digest:id},{id:stepNode,kind:"STEP",digest:payloadDigest},{id:receiptNode,kind:"RECEIPT",digest:reportDigest}],edges:[{from_dependency:policyNode.id,to_dependent:approvalNode,relation:"AUTHORIZED_READ_ONLY"},{from_dependency:approvalNode,to_dependent:stepNode,relation:"APPROVED_STEP"},{from_dependency:stepNode,to_dependent:receiptNode,relation:"OBSERVED_REPORT"}]};
}
