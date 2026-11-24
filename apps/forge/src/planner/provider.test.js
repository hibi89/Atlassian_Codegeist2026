import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {createProviderService,GEMINI_URL} from "./provider.js";
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
});
test("unknown billing, malicious model output and failure fall back without retry",async()=>{
 const disabled=setup({enabled:false});assert.equal((await disabled.service.run(context,{provider:"gemini",fixture:"change",consent:true})).provider.mode,"DETERMINISTIC_TEMPLATE");assert.equal(disabled.calls(),0);
 const evil=setup({output:'{"operation":"delete"}'});assert.equal((await evil.service.run(context,{provider:"gemini",fixture:"change",consent:true})).provider.reason,"PROVIDER_OUTPUT_REJECTED");assert.equal(evil.calls(),1);
 const failed=setup({fail:true});assert.equal((await failed.service.run(context,{provider:"gemini",fixture:"change",consent:true})).provider.reason,"PROVIDER_FAILED_NO_RETRY");assert.equal(failed.calls(),1);
});
