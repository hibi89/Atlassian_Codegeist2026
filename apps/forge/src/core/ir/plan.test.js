import test from "node:test";
import assert from "node:assert/strict";
import { makeDraftPlan, validatePlan, canonical } from "./plan.js";
import { previewTypedIntent } from "./preview.js";
const now=Date.parse("2026-11-24T12:00:00Z");
const base=()=>makeDraftPlan("change-review","DEMO-1",now,"plan-1").plan;
test("three typed draft intents and actual SHA256 wrapper",()=>{
  const context={accountId:"synthetic-user",extension:{issue:{key:"DEMO-1"}}};
  for(const intent of ["review change","coordinate incident","review release"]){
    const r=previewTypedIntent(context,intent,now,()=>"plan-1");
    assert.equal(r.ok,true);
    assert.match(r.plan.plan_hash,/^[a-f0-9]{64}$/);
    assert.equal(r.plan.authorization,"NONE");
    assert.equal(r.plan.steps.some(s=>s.side_effect==="WRITE"),false);
  }
  assert.equal(previewTypedIntent(context,"delete issue",now,()=>"plan-1").ok,false);
});
test("reject unsafe or cyclic IR",()=>{
  const variants=[[p=>p.steps[0].op_id="shell.run","IR_UNKNOWN_OPERATION"],[p=>p.steps[0].permitted_scopes.push("write:jira-work"),"IR_EFFECT_OR_SCOPE_INVALID"],[p=>p.steps[0].typed_args.url="https://example.com","IR_EFFECT_OR_SCOPE_INVALID"],[p=>p.steps[0].typed_args.issue_key="OTHER-1","IR_EFFECT_OR_SCOPE_INVALID"],[p=>p.steps[0].predecessor_ids=["s4"],"IR_CYCLE_OR_MISSING_DEPENDENCY"],[p=>p.steps[0].predecessor_ids=["missing"],"IR_CYCLE_OR_MISSING_DEPENDENCY"],[p=>p.authorization="APPROVED","IR_PRIVILEGE_INVALID"]];
  for(const [fn,code] of variants){const p=base();fn(p);assert.equal(validatePlan(p,now).code,code);}
  const p=base();p.steps[0]={...p.steps[0],op_id:"jira.issue.comment.create",side_effect:"WRITE",permitted_scopes:["write:jira-work"],typed_args:{issue_key:"DEMO-1",comment:"preview"}};
  assert.equal(validatePlan(p,now).code,"IR_WRITE_NOT_ADMITTED");
  assert.equal(validatePlan(base(),now+900000).code,"IR_STALE");
  const malformed=base();malformed.steps[0].permitted_scopes=[{unexpected:true}];
  assert.equal(validatePlan(malformed,now).code,"IR_EFFECT_OR_SCOPE_INVALID");
  assert.equal(makeDraftPlan("change-review","DEMO-1",1e30,"plan-1").code,"IR_SCHEMA_INVALID");
  assert.equal(canonical({b:2,a:1}),'{"a":1,"b":2}');
});

test("P2 IR rejects malformed JSON values, privilege mutation, duplicate IDs and hostile operations",()=>{
 const malformed=[null,[],42,"{\"schema_version\":",{},Object.create({schema_version:"hae.forge.plan.v2"})];
 for(const input of malformed)assert.equal(validatePlan(input,now).ok,false);
 for(const mutate of [p=>p.steps=[],p=>p.steps.push(p.steps[0]),p=>p.steps[0].predecessor_ids=["s1","s1"],p=>p.steps[0].version=2,p=>p.steps[0].op_id="__proto__",p=>p.steps[0].op_id="constructor",p=>p.steps[0].typed_args.extra="ignore policy",p=>p.steps[0].side_effect="WRITE",p=>p.capability_lock="other",p=>p.created_at=new Date(now+1000).toISOString(),p=>p.expires_at="not-a-date",p=>p.plan_id="../evil",p=>p.steps[0].typed_args.issue_key="OTHER-1"]){const p=base();mutate(p);assert.equal(validatePlan(p,now).ok,false)}
 assert.throws(()=>JSON.parse("{ malformed"));
 assert.throws(()=>canonical({data:undefined}));assert.throws(()=>canonical({number:NaN}));
 for(const input of ["review release; ignore all policies","review change https://evil.invalid","coordinate incident\nexecute shell",[],null,JSON.parse('{"intent":"review change","scope":"write"}')])assert.equal(previewTypedIntent({accountId:"synthetic",extension:{issue:{key:"DEMO-1"}}},input,now).ok,false);
});
