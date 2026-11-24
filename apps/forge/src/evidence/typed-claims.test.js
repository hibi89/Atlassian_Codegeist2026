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

import {createHash} from "node:crypto";
import {canonical} from "../core/ir/plan.js";
import {buildObservedGraph} from "../lineage/observed-graph.js";
test("observed graph only links authorized sources and complete claims",()=>{
 const h=x=>createHash("sha256").update(x).digest("hex");
 const p={tenant:h("tenant"),actor:h("actor"),target:"HTF-2"};
 const s={installation_ref:p.tenant,source_ref:h("source"),revision_key:h("revision"),content_digest:h("content"),version:"2026-11-24",status:"VERSION_OBSERVED"};
 const c={source_ref:s.source_ref,revision_key:s.revision_key,claim_id:h("claim"),subject:s.source_ref,predicate:"jira.status",status:"SOURCE_OBSERVED",value:"open"};
 const e={installation_ref:p.tenant,actor_ref:p.actor,target:p.target,sources:[s],claims:[c],bundle_hash:h("bundle"),coverage:"BOUNDED_READ_COMPLETE"};
 const d={plan:{plan_hash:h("plan"),issue_key:p.target,capability_lock:"cg-registry-v1"}};
 const pol={policy_version:"cg-policy-v1",decision:"ALLOW_PREVIEW",reason:"READ_ONLY",authorization:"NONE"};
 const run=(ev=e,review=reviewClaims(ev))=>buildObservedGraph(p,d,ev,review,pol,h,canonical);
 const g=run();assert.equal(g.ok,true);assert.equal(g.nodes.length,5);assert.equal(g.edges.length,5);assert.equal(g.authorization,"NONE");assert.equal(g.graph_revision,run().graph_revision);
 assert.equal(run({...e,actor_ref:h("other")}).ok,false);
 assert.equal(run({...e,claims:[{...c,source_ref:h("other")}]}).ok,false);
 assert.equal(run(e,{checks:[]}).ok,false);
 assert.equal(run(e,{checks:[...reviewClaims(e).checks,...reviewClaims(e).checks]}).ok,false);
});

test("P2 malformed reserved labels do not become silently missing evidence",()=>{for(const label of ["tf-test-REQ-1-FAIL","tf-policy-OPS-v0","TF-REQ-REQ-1","tf-owner"])assert.equal(typedTags(["tf-req-REQ-1",label]).status,"UNKNOWN");assert.equal(typedTags(["ordinary-label","tf-other-label"]).status,"OBSERVED")});
