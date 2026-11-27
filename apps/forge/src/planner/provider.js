import {intentPreview} from "./templates.js";
import {validatePlan,canonical} from "../core/ir/plan.js";
const fixtures=Object.freeze({change:{text:"Review this synthetic change",alias:"review change",intent:"change-review"},incident:{text:"Coordinate this synthetic incident",alias:"coordinate incident",intent:"incident-coordinate"},release:{text:"Review this synthetic release",alias:"review release",intent:"release-review"}});
export const GEMINI_MODEL="gemini-3.5-flash-lite";
export const GEMINI_URL="https://generativelanguage.googleapis.com/v1beta/models/"+GEMINI_MODEL+":generateContent";
export const providerLimits=Object.freeze({external_attempts_per_utc_day:1,max_output_tokens:128,max_response_bytes:8192,max_prompt_bytes:512});
const fail=code=>({ok:false,code,authorization:"NONE",execution:"DISABLED"});
export function freeProjectReady(config,now){
 const until=Date.parse(config?.verifiedUntil??"");
 return config?.enabled===true&&config?.billingDisabled===true&&typeof config.apiKey==="string"&&config.apiKey.length>10&&config.apiKey.length<=256&&Number.isFinite(now)&&Number.isFinite(until)&&until>now&&until-now<=86400000;
}
export function createGeminiProvider({fetch,apiKey}){
 return async function classify(fixtureId){
  if(typeof fixtureId!=="string"||!Object.hasOwn(fixtures,fixtureId))throw Error("PROVIDER_FIXTURE_DENIED");
  const fixture=fixtures[fixtureId];
  const prompt="Classify this fictional request into exactly one intent: change-review, incident-coordinate, release-review. Reply with the intent ID only. Fictional request: "+fixture.text;
  if(Buffer.byteLength(prompt,"utf8")>providerLimits.max_prompt_bytes)throw Error("PROVIDER_PROMPT_LIMIT");
  const response=await fetch(GEMINI_URL,{method:"POST",redirect:"error",signal:AbortSignal.timeout(8000),headers:{"Content-Type":"application/json","x-goog-api-key":apiKey},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:0,maxOutputTokens:providerLimits.max_output_tokens}})});
  if(response?.status!==200)throw Error("PROVIDER_UNAVAILABLE");
  const length=response.headers?.get?.("content-length");if(length&&Number(length)>providerLimits.max_response_bytes)throw Error("PROVIDER_RESPONSE_LIMIT");
  const raw=await response.text();if(typeof raw!=="string"||Buffer.byteLength(raw,"utf8")>providerLimits.max_response_bytes)throw Error("PROVIDER_RESPONSE_LIMIT");
  const data=JSON.parse(raw),candidate=data.candidates?.[0];
  if(candidate?.finishReason!=="STOP"||!Array.isArray(candidate.content?.parts)||candidate.content.parts.length!==1||candidate.content.parts[0].thought||typeof candidate.content.parts[0].text!=="string")throw Error("PROVIDER_RESULT_INVALID");
  return candidate.content.parts[0].text.trim();
 };
}
export function createProviderService({store,clock,digest,preview,config,development,allowedInstall,fetch,canDispatch=()=>true}){
 async function run(context,input){
  if(!development()||!allowedInstall(context)||context.extension?.issue?.key!=="HTF-2")return fail("PROVIDER_DEMO_CONTEXT_DENIED");
  if(!input||Object.getPrototypeOf(input)!==Object.prototype||typeof input.fixture!=="string"||!Object.hasOwn(fixtures,input.fixture)||!["template","gemini"].includes(input.provider)||Object.keys(input).some(k=>!["fixture","provider","consent"].includes(k)))return fail("PROVIDER_INPUT_INVALID");
  const fixture=fixtures[input.fixture];
  let mode="DETERMINISTIC_TEMPLATE",reason="NO_EXTERNAL_REQUEST",attempted=false;
  if(input.provider==="gemini"){
   if(input.consent!==true||!freeProjectReady(config,clock()))reason="FREE_PROJECT_OR_CONSENT_UNVERIFIED";
   else if(!canDispatch())reason="PROVIDER_INVOCATION_TIME_BUDGET";
   else{
    try{
     const reservedAt=clock(),day=new Date(reservedAt).toISOString().slice(0,10);
     await store.create("cg:provider-attempt:"+day,{schema_version:"hae.provider.attempt.v1",provider:GEMINI_MODEL,fixture:input.fixture,at:reservedAt});
     const dispatchAt=clock();
     if(!Number.isSafeInteger(dispatchAt)||dispatchAt<reservedAt||new Date(dispatchAt).toISOString().slice(0,10)!==day)throw Error("PROVIDER_DAY_CHANGED");
     if(!freeProjectReady(config,dispatchAt)||!development()||!allowedInstall(context))throw Error("PROVIDER_QUALIFICATION_CHANGED");
     if(!canDispatch())throw Error("PROVIDER_INVOCATION_TIME_BUDGET");
     attempted=true;
     const result=await createGeminiProvider({fetch,apiKey:config.apiKey})(input.fixture);
     // Model output can select only the already intended fixture, never IR or scopes.
     if(result!==fixture.intent)reason="PROVIDER_OUTPUT_REJECTED";
     else{mode="GEMINI_SYNTHETIC_CLASSIFIER";reason="VALIDATED_INTENT_ONLY"}
    }catch{reason=attempted?"PROVIDER_FAILED_NO_RETRY":"PROVIDER_DAILY_CAP_OR_STORAGE_UNKNOWN"}
   }
  }
  const template=intentPreview(fixture.alias);if(!template.ok||template.draft.intentId!==fixture.intent)return fail("PROVIDER_TEMPLATE_INVALID");
  const result=await preview(context,fixture.alias);
  if(!result?.ok)return result??fail("PROVIDER_PREVIEW_UNAVAILABLE");
  const {plan_hash,...plan}=result.plan??{};
  if(!validatePlan(plan,clock()).ok||digest(canonical(plan))!==plan_hash||plan.intent!==fixture.intent||plan.issue_key!==context.extension?.issue?.key)return fail("PROVIDER_IR_REJECTED");
  return {...result,provider:{mode,reason,external_attempted:attempted,synthetic_only:true,model:mode==="GEMINI_SYNTHETIC_CLASSIFIER"?GEMINI_MODEL:"NONE"},authorization:"NONE",execution:"DISABLED"};
 }
 return {run};
}
