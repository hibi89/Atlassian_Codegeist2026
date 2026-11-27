import { createHash, randomUUID } from "node:crypto";
import { contextPreview } from "../../planner/templates.js";
import { canonical, makeDraftPlan } from "./plan.js";
export function previewTypedIntent(context,input,now=Date.now(),newId=randomUUID){
  const preview=contextPreview(context,input);
  if(!preview.ok)return preview;
  const result=makeDraftPlan(preview.draft.intentId,preview.issueKey,now,newId());
  if(!result.ok)return result;
  const plan_hash=createHash("sha256").update(canonical(result.plan),"utf8").digest("hex");
  return {...preview,plan:{...result.plan,plan_hash},execution_order:result.order};
}
