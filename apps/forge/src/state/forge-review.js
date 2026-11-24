import { createCommentService } from "../security/approval/comment-service.js";
import { createForgeCommentTransport } from "../executor/forge-comment.js";
import { randomBytes } from "node:crypto";
import { principal } from "../evidence/bundle.js";
import { reserveDailySlot } from "./daily-budget.js";
import { createReportService } from "../security/approval/report-service.js";
import { getAppContext } from "@forge/api";
import kvsModule from "@forge/kvs";
import { digest } from "../evidence/forge-evidence.js";
import { previewWithPolicy } from "../security/forge-policy.js";
import { createReviewService } from "./review-service.js";
// Package interop is resolved at invocation time, not at resolver startup.
function getKvs(module=kvsModule){
 for(const k of [module,module?.kvs,module?.default])if(k&&typeof k.get==="function"&&typeof k.set==="function")return k;
 throw Error("FORGE_KVS_EXPORT_INVALID");
}
function isDevelopment(){try{return String(getAppContext().environmentType).toUpperCase()==="DEVELOPMENT"}catch{return false}}
function createDevelopmentStore(kvs){
 let reads=0,writes=0;
 return {
  async get(key){if(++reads>64)throw Error("REVIEW_READ_BUDGET");return kvs.get(key)},
  async create(key,value){if(++writes>12||Buffer.byteLength(JSON.stringify(value),"utf8")>61440)throw Error("REVIEW_WRITE_BUDGET");return kvs.set(key,value,{keyPolicy:"FAIL_IF_EXISTS",ttl:{unit:"DAYS",value:1}})}
 };
}
function allowedDemoInstall(context){
 const id=process.env.TRUSTFLOW_DEMO_CLOUD_ID;
 return typeof id==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)&&context.installContext==="ari:cloud:jira::site/"+id;
}
async function call(context,input,operation,confirmation){
 if(!isDevelopment()||!principal(context,digest))return {ok:false,code:"DEVELOPMENT_STORAGE_ONLY"};
 try{
  const kvs=getKvs();
  const admission=await reserveDailySlot(kvs,Date.now());if(!admission.ok)return admission;
  const services={store:createDevelopmentStore(kvs),clock:Date.now,digest,preview:previewWithPolicy,development:isDevelopment,nonce:()=>randomBytes(32).toString("hex")};
  if(operation.startsWith("comment:")){
   const service=createCommentService({...services,allowedInstall:allowedDemoInstall,transport:createForgeCommentTransport()});
   return await service[operation.slice(8)](context,input,confirmation);
  }
  const service=["save","refresh","history","revalidate"].includes(operation)?createReviewService(services):createReportService(services);
  return await service[operation](context,input,confirmation);
 }catch{return {ok:false,code:"REVIEW_STORAGE_UNKNOWN",authorization:"NONE",execution:"DISABLED"}}
}
export const saveCurrentReview=(context,intent)=>call(context,intent,"save");
export const refreshSavedReview=(context,id)=>call(context,id,"refresh");
export const prepareReadOnlyReport=(context,id)=>call(context,id,"prepare");
export const approveReadOnlyReport=(context,id,confirmation)=>call(context,id,"approve",confirmation);
export const generateReadOnlyReport=(context,id)=>call(context,id,"generate");
export const revokeReadOnlyReport=(context,id)=>call(context,id,"revoke");
export const prepareDemoComment=(context,id)=>call(context,id,"comment:prepare");
export const approveDemoComment=(context,id,confirmation)=>call(context,id,"comment:approve",confirmation);
export const executeDemoComment=(context,id)=>call(context,id,"comment:execute");
export const revokeDemoComment=(context,id)=>call(context,id,"comment:revoke");
export const reconcileDemoComment=(context,id)=>call(context,id,"comment:reconcile");
export const revalidateSavedReview=(context,id)=>call(context,id,"revalidate");
export const readSavedGraph=(context,id)=>call(context,id,"history");
export {getKvs,createDevelopmentStore};
