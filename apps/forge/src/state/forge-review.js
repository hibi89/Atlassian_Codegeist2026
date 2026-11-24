import { createProviderService, freeProjectReady, providerLimits, GEMINI_MODEL } from "../planner/provider.js";
import { readCurrentEvidence } from "../evidence/forge-evidence.js";
import { fetch as forgeFetch } from "@forge/api";
import { createCommentService } from "../security/approval/comment-service.js";
import { createForgeCommentTransport } from "../executor/forge-comment.js";
import { performance } from "node:perf_hooks";
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
function createDevelopmentStore(kvs,clock=Date.now){
 let reads=0,writes=0;
 const validKey=key=>typeof key==="string"&&key.length<=500&&/^[a-zA-Z0-9:._#-]+$/.test(key);
 return {
  async get(key){
   if(!validKey(key)||++reads>64)throw Error("REVIEW_READ_BUDGET_OR_KEY");
   // Forge may return expired values until asynchronous deletion completes.
   // A present-but-expired or malformed record is UNKNOWN, not an empty slot.
   const result=await kvs.get(key,{metadataFields:["EXPIRE_TIME"]});
   if(result===undefined||result===null)return undefined;
   if(result.key!==key||!Object.hasOwn(result,"value")||typeof result.expireTime!=="string"||!Number.isFinite(Date.parse(result.expireTime))||!Number.isSafeInteger(clock())||Date.parse(result.expireTime)<=clock())throw Error("REVIEW_STORAGE_EXPIRY_UNKNOWN");
   return result.value;
  },
  async create(key,value){
   if(!validKey(key)||++writes>12||Buffer.byteLength(JSON.stringify(value),"utf8")>61440)throw Error("REVIEW_WRITE_BUDGET_OR_KEY");
   return kvs.set(key,value,{keyPolicy:"FAIL_IF_EXISTS",ttl:{unit:"DAYS",value:1}});
  }
 };
}
function allowedDemoInstall(context){
 const id=process.env.TRUSTFLOW_DEMO_CLOUD_ID;
 return typeof id==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)&&context.installContext==="ari:cloud:jira::site/"+id;
}
function providerConfig(){return {enabled:process.env.TRUSTFLOW_GEMINI_ENABLED==="true",billingDisabled:process.env.TRUSTFLOW_GEMINI_BILLING_DISABLED==="true",verifiedUntil:process.env.TRUSTFLOW_GEMINI_FREE_VERIFIED_UNTIL,apiKey:process.env.TRUSTFLOW_GEMINI_API_KEY}}
export function getSafetySettings(context){
 if(!principal(context,digest))return {ok:false,code:"AUTH_CONTEXT_REQUIRED"};
 return {ok:true,synthetic_storage_ready:isDevelopment()&&allowedDemoInstall(context)&&context.extension?.issue?.key==="HTF-2",environment:isDevelopment()?"DEVELOPMENT":"DISABLED",daily_admitted_actions:24,storage_reads_per_action:64,storage_writes_per_action:12,max_record_bytes:61440,retention_hours:24,comment_attempts_per_day:1,external_ai_default:"OFF",external_ai_config_ready:isDevelopment()&&allowedDemoInstall(context)&&context.extension?.issue?.key==="HTF-2"&&freeProjectReady(providerConfig(),Date.now()),model:GEMINI_MODEL,...providerLimits,billing:"OWNER_CONSOLE_CHECK_REQUIRED",paid_fallback:"DISABLED",document_page_configured:allowedDemoInstall(context)&&context.extension?.issue?.key==="HTF-2"&&!!process.env.TRUSTFLOW_DEMO_PAGE_ID};
}
function requiresSyntheticScope(operation){return operation!=="read"&&operation!=="preview"}
function syntheticScopeAllowed(context,operation,cloudId){
 if(!requiresSyntheticScope(operation))return true;
 return typeof cloudId==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cloudId)&&context?.installContext==="ari:cloud:jira::site/"+cloudId&&context?.extension?.issue?.key==="HTF-2";
}
async function call(context,input,operation,confirmation){
 const started=performance.now();
 // 25s platform invocation limit; reserve a conservative 10s for POST/readback and storage.
 const canDispatch=()=>performance.now()-started<15000;
 if(!isDevelopment()||!principal(context,digest))return {ok:false,code:"DEVELOPMENT_STORAGE_ONLY"};
 if(!syntheticScopeAllowed(context,operation,process.env.TRUSTFLOW_DEMO_CLOUD_ID))return {ok:false,code:"SYNTHETIC_DEMO_SCOPE_REQUIRED",authorization:"NONE",execution:"DISABLED"};
 try{
  const kvs=getKvs();
  const admission=await reserveDailySlot(kvs,Date.now(),24,Date.now);if(!admission.ok)return admission;
  const services={store:createDevelopmentStore(kvs),clock:Date.now,digest,preview:previewWithPolicy,development:isDevelopment,nonce:()=>randomBytes(32).toString("hex")};
  if(operation==="read")return readCurrentEvidence(context);
  if(operation==="preview")return previewWithPolicy(context,input);
  if(operation==="provider")return createProviderService({...services,config:providerConfig(),allowedInstall:allowedDemoInstall,fetch:forgeFetch}).run(context,input);
  if(operation.startsWith("comment:")){
   const service=createCommentService({...services,allowedInstall:allowedDemoInstall,transport:createForgeCommentTransport(),canDispatch});
   return await service[operation.slice(8)](context,input,confirmation);
  }
  const service=["save","refresh","history","revalidate","recoverReport"].includes(operation)?createReviewService(services):createReportService(services);
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
export const recoverSavedReport=(context,id)=>call(context,id,"recoverReport");
export const readSavedGraph=(context,id)=>call(context,id,"history");
export const budgetedRead=(context)=>call(context,null,"read");
export const budgetedPreview=(context,input)=>call(context,input,"preview");
export const runSyntheticProvider=(context,input)=>call(context,input,"provider");
export {getKvs,createDevelopmentStore,syntheticScopeAllowed};
