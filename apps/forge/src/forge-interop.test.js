import test from "node:test";
import assert from "node:assert/strict";
import ResolverModule from "@forge/resolver";
import apiModule, { route } from "@forge/api";
import { resolveResolver, resolveForgeApi } from "./forge-interop.js";
import { handler } from "./index.js";
test("real installed Forge SDK initializes resolver entrypoint and exposes asUser",()=>{
  const C=resolveResolver(ResolverModule);
  const instance=new C();
  assert.equal(typeof instance.define,"function");
  assert.equal(typeof instance.getDefinitions,"function");
  assert.equal(typeof handler,"function");
  assert.equal(typeof resolveForgeApi(apiModule).asUser,"function");
  assert.equal(typeof route,"function");
});
test("direct and CJS wrapped SDK exports accepted; unexpected shapes rejected",()=>{
  class DemoResolver {define(){} getDefinitions(){}}
  const api={asUser(){}};
  assert.equal(resolveResolver(DemoResolver),DemoResolver);
  assert.equal(resolveResolver({default:DemoResolver}),DemoResolver);
  assert.equal(resolveForgeApi(api),api);
  assert.equal(resolveForgeApi({default:api}),api);
  assert.throws(()=>resolveResolver({default:{}}),/FORGE_RESOLVER_EXPORT_INVALID/);
  assert.throws(()=>resolveForgeApi({default:{}}),/FORGE_API_EXPORT_INVALID/);
});

import {parsePreflightArgs,nativeTestArgs,trackedClean,validateArtifacts} from "../scripts/live-preflight.mjs";
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
test("local preflight accepts exact SHA and native test paths, refuses unsafe args and stale source",()=>{
 const sha="a".repeat(40);assert.deepEqual(parsePreflightArgs(["--expected-sha",sha]),{sha,outputsOnly:false});assert.deepEqual(parsePreflightArgs(["--expected-sha",sha,"--outputs-only"]),{sha,outputsOnly:true});
 for(const args of [[],["--expected-sha","HEAD"],["--expected-sha",sha,"--deploy"],["--expected-sha",sha,"--outputs-only","extra"]])assert.equal(parsePreflightArgs(args),null);
 assert.deepEqual(nativeTestArgs("node --test src/a.test.js src/dir/b.test.js"),["--test","src/a.test.js","src/dir/b.test.js"]);
 for(const cmd of ["node --test src/../a.test.js","node --test src/a.test.js;whoami","node --test /tmp/a.test.js","npm test"])assert.equal(nativeTestArgs(cmd),null);
 assert.equal(trackedClean("",sha,sha),true);assert.equal(trackedClean(" M source",sha,sha),false);assert.equal(trackedClean("","b".repeat(40),sha),false);
});
test("local preflight requires both nonempty UI artifact sets and hashes exact bytes",()=>{
 const root=mkdtempSync(path.join(tmpdir(),"trustflow-preflight-"));
 try{for(const dir of ["src/ui/dist","src/ui/project-dist"])mkdirSync(path.join(root,dir),{recursive:true});
 for(const file of ["package-lock.json","src/ui/dist/index.html","src/ui/dist/app.js","src/ui/dist/app.css","src/ui/project-dist/index.html","src/ui/project-dist/app.js","src/ui/project-dist/app.css"])writeFileSync(path.join(root,file),"fixture");
 const result=validateArtifacts(root);assert.equal(result.length,7);assert.ok(result.every(r=>r.bytes===7&&/^[a-f0-9]{64}$/.test(r.sha256)));writeFileSync(path.join(root,"src/ui/project-dist/app.css"),"");assert.throws(()=>validateArtifacts(root),/ARTIFACT_MISSING_OR_SIZE_INVALID/);
 }finally{rmSync(root,{recursive:true,force:true})}
});
