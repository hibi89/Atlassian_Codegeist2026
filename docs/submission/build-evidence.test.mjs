import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildEvidence,assertEvidenceCurrent} from "./build-evidence.mjs";
const ledger=JSON.parse(readFileSync(new URL("../P2_VERIFICATION_LEDGER.json",import.meta.url),"utf8"));
const copy=()=>structuredClone(ledger);
test("submission snapshot is deterministic, keeps CI and live source separate",()=>{
 const a=buildEvidence(ledger),b=buildEvidence(copy());assert.deepEqual(a,b);
 assert.match(a.md,/NOT live acceptance/);assert.ok(a.md.includes(ledger.latest_candidate_ci.source_sha));assert.ok(a.md.includes(ledger.source_sha));assert.ok(a.svg.includes(ledger.submission_benchmark.source_sha));assert.match(a.md,/Not an accuracy rate/);assert.match(a.md,/owner submission GO remain pending/);
});
test("submission snapshot rejects failed CI, mismatched references and invented gate totals",()=>{
 const cases=[x=>x.p2_pass++,x=>x.p1_candidates=x.p1_total+1,x=>x.latest_candidate_ci.source_sha="0".repeat(40),x=>x.latest_candidate_ci.fail=1,x=>x.latest_candidate_ci.skip=1,x=>x.latest_candidate_ci.live_forge="PASS",x=>x.latest_candidate_ci_followup.conclusion="failure",x=>x.submission_benchmark.source_sha="0".repeat(40),x=>x.submission_benchmark.rows[0].full_ms=-1,x=>x.records[1].gate_id=x.records[0].gate_id];
 for(const modify of cases){const l=copy();modify(l);assert.throws(()=>buildEvidence(l));}
});
test("different benchmark and candidate SHA remain separately attributed",()=>{
 const l=copy();l.submission_benchmark.source_sha="a".repeat(40);l.submission_benchmark.run_id=1234;l.submission_benchmark.job_id=5678;
 const out=buildEvidence(l);assert.ok(out.svg.includes(l.submission_benchmark.source_sha));assert.ok(out.md.includes(l.latest_candidate_ci.source_sha));assert.ok(out.md.includes(l.submission_benchmark.source_sha));
 l.submission_benchmark.rows[1].decision_equal=false;const unknown=buildEvidence(l);assert.match(unknown.md,/Not established per individual case/);assert.doesNotMatch(unknown.md,/Decision agreement: 40\/60/);
});
test("stale generated evidence fails the snapshot contract",()=>{
 const e=buildEvidence(ledger);assert.doesNotThrow(()=>assertEvidenceCurrent(e,e));assert.throws(()=>assertEvidenceCurrent({...e,md:e.md+"stale"},e));assert.throws(()=>assertEvidenceCurrent({...e,svg:e.svg+"stale"},e));
});
