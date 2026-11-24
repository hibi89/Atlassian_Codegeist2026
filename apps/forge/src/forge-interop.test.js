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
