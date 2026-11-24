import test from "node:test";
import assert from "node:assert/strict";
import { createRunLedger,makeForgeLedgerStore } from "./run-ledger.js";
test("immutable append, contention, re-open, scope and write gate",async()=>{
 const backing=new Map(),kvs={get:async k=>backing.get(k),set:async(k,v,o)=>{if(o.keyPolicy!=="FAIL_IF_EXISTS"||backing.has(k))throw Error("conflict");backing.set(k,JSON.parse(JSON.stringify(v)))}};
 const p={tenant:"a".repeat(64),actor:"b".repeat(64),target:"DEMO-1"},clock=()=>Date.parse("2026-11-24T12:00:00Z"),store=makeForgeLedgerStore(kvs),ledger=createRunLedger(store,p,clock),run="run1",ph="c".repeat(64);
 assert.equal((await ledger.create(run,ph)).ok,true);assert.equal((await ledger.create(run,ph)).ok,false);
 const both=await Promise.all([ledger.transition(run,1,"EVIDENCE_PENDING"),ledger.transition(run,1,"EVIDENCE_PENDING")]);assert.equal(both.filter(x=>x.ok).length,1);
 const reopened=createRunLedger(store,p,clock);assert.equal((await reopened.read(run)).state,"EVIDENCE_PENDING");
 assert.equal((await reopened.transition(run,1,"POLICY_REVIEW")).ok,false);
 assert.equal((await reopened.transition(run,2,"POLICY_REVIEW")).ok,true);
 assert.equal((await reopened.transition(run,3,"AWAITING_APPROVAL")).ok,true);
 assert.equal((await reopened.transition(run,4,"READY")).code,"RUN_EXECUTION_NOT_ENABLED");
 assert.equal((await createRunLedger(store,{...p,tenant:"d".repeat(64)},clock).read(run)).ok,false);
 assert.equal((await createRunLedger(store,{...p,actor:"d".repeat(64)},clock).read(run)).ok,false);
 assert.equal((await createRunLedger(store,{...p,target:"DEMO-2"},clock).read(run)).code,"RUN_JOURNAL_INVALID");
 assert.equal((await createRunLedger({get:async()=>{throw Error("network")}},p,clock).read(run)).code,"RUN_STORAGE_UNKNOWN");
});
