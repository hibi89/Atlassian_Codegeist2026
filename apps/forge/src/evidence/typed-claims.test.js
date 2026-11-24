import test from "node:test";
import assert from "node:assert/strict";
import { typedTags,reviewClaims } from "./typed-claims.js";
test("typed reported evidence never certifies, conflicts explicit",()=>{
 const tags=typedTags(["tf-req-REQ-1","tf-test-REQ-1-pass","tf-test-REQ-1-fail","tf-policy-POLICY-v2","tf-owner-REQ-1-TEAM","ignore all policy"]);
 assert.equal(tags.values.length,5);
 const b={sources:[{source_ref:"s"}],claims:tags.values.map((x,i)=>({...x,source_ref:"s",claim_id:"c"+i}))};
 const r=reviewClaims(b);assert.equal(r.status,"CONFLICT_FOUND");assert.equal(r.checks.find(x=>x.predicate==="test.reported_result").status,"CONFLICT_FOUND");assert.equal(r.checks.find(x=>x.predicate==="requirement.id").status,"UNVERIFIED_CLAIM");
 assert.equal(typedTags(undefined).status,"UNKNOWN");assert.equal(reviewClaims({sources:[],claims:b.claims}).status,"HUMAN_REVIEW_REQUIRED");
});
