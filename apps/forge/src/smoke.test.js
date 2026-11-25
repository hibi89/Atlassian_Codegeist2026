import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { issueHint } from "./security-context.js";
import { contextPreview } from "./planner/templates.js";
import { readIssue } from "./adapters/jira/reader.js";
const ctx={accountId:"synthetic-user",accountType:"licensed",extension:{issue:{key:"DEMO-1"}}};
const raw={id:"10001",key:"DEMO-1",fields:{summary:"Synthetic change",status:{name:"Open"},issuetype:{name:"Task"},updated:"2026-11-24T12:00:00.000+0000"}};
const clock=()=>"2026-11-24T12:01:00Z";
const digest=s=>createHash("sha256").update(s).digest("hex");
test("valid context and strict template aliases; no arbitrary actions",()=>{
  assert.equal(issueHint(ctx).key,"DEMO-1");
  for(const i of ["Review this change","Coordinate incident","릴리스 검토"])assert.equal(contextPreview(ctx,i).draft.authorization,"NONE");
  for(const i of ["review change and delete issue","__proto__","constructor",{}, "x".repeat(301)])assert.equal(contextPreview(ctx,i).ok,false);
  assert.equal(contextPreview({}, "review change").ok,false);
});
test("scoped reader returns bounded source, digest and immutable snapshot",async()=>{
  const result=await readIssue(ctx,async key=>{assert.equal(key,"DEMO-1");return {status:200,text:async()=>JSON.stringify(raw)}},clock,digest);
  assert.equal(result.ok,true);assert.equal(result.source.version,"2026-11-24T12:00:00.000Z");assert.match(result.source.contentHash,/^[a-f0-9]{64}$/);assert.equal(Object.isFrozen(result.source),true);
});
test("denied/missing/rate limit/invalid and transport errors",async()=>{
  let calls=0;const request=async()=>{calls++;return {status:200,text:async()=>JSON.stringify(raw)}};
  assert.equal((await readIssue({},request,clock,digest)).ok,false);assert.equal(calls,0);
  for(const [status,code] of [[401,"SOURCE_ACCESS_UNKNOWN"],[403,"SOURCE_ACCESS_UNKNOWN"],[404,"SOURCE_NOT_VISIBLE_OR_MISSING"],[429,"JIRA_RATE_LIMITED"],[503,"JIRA_UNAVAILABLE"]])assert.equal((await readIssue(ctx,async()=>({status}),clock,digest)).code,code);
  assert.equal((await readIssue(ctx,async()=>({status:200,text:async()=>"{bad"}),clock,digest)).code,"JIRA_RESPONSE_INVALID");
  assert.equal((await readIssue(ctx,async()=>({status:200,text:async()=>"x".repeat(131073)}),clock,digest)).code,"JIRA_RESPONSE_TOO_LARGE");
  assert.equal((await readIssue(ctx,async()=>({status:200,text:async()=>JSON.stringify({...raw,key:"OTHER-1"})}),clock,digest)).code,"JIRA_RESPONSE_INVALID");
  assert.equal((await readIssue(ctx,async()=>{throw Error("network")},clock,digest)).code,"JIRA_READ_UNAVAILABLE");
});

test("P2 Jira byte limit applies to multibyte UTF-8 responses",async()=>{
 const large=JSON.stringify({...raw,fields:{...raw.fields,extra:"한".repeat(50000)}});
 assert.ok(large.length<131072);assert.ok(Buffer.byteLength(large,"utf8")>131072);
 assert.equal((await readIssue(ctx,async()=>({status:200,text:async()=>large}),clock,digest)).code,"JIRA_RESPONSE_TOO_LARGE");
});


import {untrackedAppClean,validateArtifacts} from "../scripts/live-preflight.mjs";
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
test("P2 preflight refuses unexpected untracked app inputs while allowing known generated inventory",()=>{
 for(const x of ["","dependency-inventory.json\0","third-party-notices-review.txt\0dependency-inventory.json\0"])assert.equal(untrackedAppClean(x),true);
 for(const x of ["src/new.js\0","src/ui/app.tsx\0","dependency-inventory.json\0src/x.js\0","sub/dependency-inventory.json\0","dependency-inventory.json",null,"\0"])assert.equal(untrackedAppClean(x),false);
});
test("P2 preflight hashes complete known resource sets and rejects stale or missing outputs",()=>{
 const root=mkdtempSync(join(tmpdir(),"trustflow-resource-"));
 try{
  writeFileSync(join(root,"package-lock.json"),"{}");
  const dirs=["src/ui/dist","src/ui/project-dist"];
  for(const dir of dirs){mkdirSync(join(root,dir),{recursive:true});for(const file of ["index.html","app.js","app.css"])writeFileSync(join(root,dir,file),file);}
  assert.equal(validateArtifacts(root).length,7);
  const first=join(root,dirs[0]),second=join(root,dirs[1]);
  writeFileSync(join(first,"app.js"),"/*! For license information please see app.js.LEGAL.txt */");
  assert.throws(()=>validateArtifacts(root),/LINKED_LEGAL_OUTPUT_MISSING/);
  writeFileSync(join(first,"app.js.LEGAL.txt"),"synthetic legal notice");
  const complete=validateArtifacts(root);assert.equal(complete.length,8);assert.ok(complete.every(x=>/^[a-f0-9]{64}$/.test(x.sha256)));
  writeFileSync(join(second,"stale.js"),"stale");assert.throws(()=>validateArtifacts(root),/UNEXPECTED_RESOURCE_OUTPUT/);rmSync(join(second,"stale.js"));
  mkdirSync(join(second,"extra"));assert.throws(()=>validateArtifacts(root),/UNEXPECTED_RESOURCE_OUTPUT/);rmSync(join(second,"extra"),{recursive:true});
  rmSync(join(second,"app.css"));assert.throws(()=>validateArtifacts(root),/ARTIFACT_MISSING_OR_SIZE_INVALID/);
  writeFileSync(join(second,"app.css"),"");
  assert.throws(()=>validateArtifacts(root),/ARTIFACT_MISSING_OR_SIZE_INVALID/);
  if(process.platform!=="win32"){
   rmSync(join(second,"app.css"));symlinkSync(join(first,"app.css"),join(second,"app.css"));assert.throws(()=>validateArtifacts(root),/ARTIFACT_MISSING_OR_SIZE_INVALID/);
  }
 }finally{rmSync(root,{recursive:true,force:true})}
});
