import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {createProviderService,createGeminiProvider,GEMINI_URL} from "./provider.js";
import {previewTypedIntent} from "../core/ir/preview.js";
const now=Date.parse("2026-11-24T12:00:00Z"),clock=()=>now,digest=s=>createHash("sha256").update(s).digest("hex");
const context={accountId:"PRIVATE_ACTOR_FIXTURE",installContext:"PRIVATE_TENANT_FIXTURE",extension:{issue:{key:"HTF-2"}}};
function setup({enabled=true,output="change-review",fail=false}={}){
 const m=new Map();let calls=0;
 const store={create:async(k,v)=>{if(m.has(k))throw Error("conflict");m.set(k,v)}};
 const config={enabled,billingDisabled:true,verifiedUntil:new Date(now+3600000).toISOString(),apiKey:"synthetic-key-fixture"};
 const fetch=async(url,options)=>{calls++;assert.equal(url,GEMINI_URL);assert.equal(options.redirect,"error");assert.ok(!options.body.includes("PRIVATE"));assert.ok(!options.body.includes("HTF-2"));assert.ok(!options.body.includes("synthetic-key-fixture"));assert.equal(JSON.parse(options.body).generationConfig.maxOutputTokens,128);if(fail)throw Error("network");return {status:200,text:async()=>JSON.stringify({candidates:[{finishReason:"STOP",content:{parts:[{text:output}]}}]})}};
 const preview=(ctx,input)=>previewTypedIntent(ctx,input,now,()=>"fixture-plan");
 return {service:createProviderService({store,clock,digest,preview,config,development:()=>true,allowedInstall:c=>c.installContext===context.installContext,fetch}),calls:()=>calls};
}
test("provider default, consent, fixed synthetic text, one-call limit and same typed IR",async()=>{
 const a=setup(),template=await a.service.run(context,{provider:"template",fixture:"change"});assert.equal(template.ok,true);assert.equal(a.calls(),0);
 const denied=await a.service.run(context,{provider:"gemini",fixture:"change",consent:false});assert.equal(denied.provider.mode,"DETERMINISTIC_TEMPLATE");assert.equal(a.calls(),0);
 const selected=await a.service.run(context,{provider:"gemini",fixture:"change",consent:true});assert.equal(selected.provider.mode,"GEMINI_SYNTHETIC_CLASSIFIER");assert.deepEqual(selected.plan,template.plan);assert.equal(a.calls(),1);
 assert.equal((await a.service.run(context,{provider:"gemini",fixture:"change",consent:true})).provider.mode,"DETERMINISTIC_TEMPLATE");assert.equal(a.calls(),1);
 assert.equal((await a.service.run(context,{provider:"gemini",fixture:"change",consent:true,text:"customer"})).ok,false);
 assert.equal((await a.service.run({...context,installContext:"foreign"},{provider:"gemini",fixture:"change",consent:true})).ok,false);
 assert.equal((await a.service.run({...context,extension:{issue:{key:"HTF-3"}}},{provider:"gemini",fixture:"change",consent:true})).ok,false);assert.equal(a.calls(),1);
});
test("unknown billing, malicious model output and failure fall back without retry",async()=>{
 const disabled=setup({enabled:false});assert.equal((await disabled.service.run(context,{provider:"gemini",fixture:"change",consent:true})).provider.mode,"DETERMINISTIC_TEMPLATE");assert.equal(disabled.calls(),0);
 const evil=setup({output:'{"operation":"delete"}'});assert.equal((await evil.service.run(context,{provider:"gemini",fixture:"change",consent:true})).provider.reason,"PROVIDER_OUTPUT_REJECTED");assert.equal(evil.calls(),1);
 const failed=setup({fail:true});assert.equal((await failed.service.run(context,{provider:"gemini",fixture:"change",consent:true})).provider.reason,"PROVIDER_FAILED_NO_RETRY");assert.equal(failed.calls(),1);
});

test("P2 lower-level external classifier refuses arbitrary text and non-string fixture",async()=>{
 let calls=0;const classify=createGeminiProvider({apiKey:"fixture-only",fetch:async()=>{calls++;throw Error("must not send")}});
 for(const x of [{text:"private issue text"},"private issue text",["change"],null])await assert.rejects(classify(x),/PROVIDER_FIXTURE_DENIED/);
 assert.equal(calls,0);
 const a=setup();assert.equal((await a.service.run(context,{provider:"gemini",fixture:["change"],consent:true})).ok,false);assert.equal(a.calls(),0);
});
test("P2 free qualification expires during admission, no external call",async()=>{
 let t=now,calls=0;
 const service=createProviderService({store:{create:async()=>{t+=1001}},clock:()=>t,digest,preview:(ctx,input)=>previewTypedIntent(ctx,input,t,()=>"fixture-plan"),config:{enabled:true,billingDisabled:true,verifiedUntil:new Date(now+1000).toISOString(),apiKey:"synthetic-key-fixture"},development:()=>true,allowedInstall:()=>true,fetch:async()=>{calls++;throw Error("must not send")}});
 const r=await service.run(context,{provider:"gemini",fixture:"change",consent:true});assert.equal(r.ok,true);assert.equal(r.provider.mode,"DETERMINISTIC_TEMPLATE");assert.equal(r.provider.external_attempted,false);assert.equal(calls,0);
});


test("P2 provider UTC rollover during reservation never sends on the next day",async()=>{
 let t=Date.parse("2026-11-24T23:59:59.900Z"),calls=0;const m=new Map();
 const service=createProviderService({store:{create:async(k,v)=>{m.set(k,v);t+=200}},clock:()=>t,digest,preview:(ctx,input)=>previewTypedIntent(ctx,input,t,()=>"fixture-plan"),config:{enabled:true,billingDisabled:true,verifiedUntil:new Date(t+3600000).toISOString(),apiKey:"synthetic-key-fixture"},development:()=>true,allowedInstall:()=>true,fetch:async()=>{calls++;throw Error("must not send")}});
 const r=await service.run(context,{provider:"gemini",fixture:"change",consent:true});assert.equal(r.ok,true);assert.equal(r.provider.mode,"DETERMINISTIC_TEMPLATE");assert.equal(r.provider.external_attempted,false);assert.equal(calls,0);assert.ok(m.has("cg:provider-attempt:2026-11-24"));assert.equal(m.has("cg:provider-attempt:2026-11-25"),false);
});

 test("P2 provider time budget denies external dispatch before or after reservation",async()=>{
 for(const before of [true,false]){let allowed=!before,calls=0,writes=0;
 const service=createProviderService({store:{create:async()=>{writes++;allowed=false}},clock,digest,preview:(ctx,input)=>previewTypedIntent(ctx,input,now,()=>"fixture-plan"),config:{enabled:true,billingDisabled:true,verifiedUntil:new Date(now+3600000).toISOString(),apiKey:"synthetic-key-fixture"},development:()=>true,allowedInstall:()=>true,canDispatch:()=>allowed,fetch:async()=>{calls++;throw Error("must not send")}});
 const r=await service.run(context,{provider:"gemini",fixture:"change",consent:true});assert.equal(r.ok,true);assert.equal(r.provider.external_attempted,false);assert.equal(r.provider.mode,"DETERMINISTIC_TEMPLATE");assert.equal(calls,0);assert.equal(writes,before?0:1);
 }
 });
