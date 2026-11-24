import { previewTypedIntent } from "../core/ir/preview.js";
import { canonical, validatePlan } from "../core/ir/plan.js";
import { digest, scopedAdapter } from "../evidence/forge-evidence.js";
import { guardedPreview } from "./policy.js";
export function previewWithPolicy(context,input){
  return guardedPreview(context,input,{
    adapter:scopedAdapter(context),digest,clock:Date.now,preview:previewTypedIntent,checkPlan:validatePlan,planDigest:p=>digest(canonical(p))
  });
}
