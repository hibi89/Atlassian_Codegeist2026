// Forge's webpack ESM/CJS interop can expose either the SDK default or its
// CommonJS exports object. Only accept the expected trusted SDK interface.
export function resolveResolver(module){
  for(const candidate of [module,module?.default]){
    if(typeof candidate==="function"&&typeof candidate.prototype?.define==="function"&&typeof candidate.prototype?.getDefinitions==="function")return candidate;
  }
  throw new TypeError("FORGE_RESOLVER_EXPORT_INVALID");
}
export function resolveForgeApi(module){
  for(const candidate of [module,module?.default]){
    if(candidate&&typeof candidate.asUser==="function")return candidate;
  }
  throw new TypeError("FORGE_API_EXPORT_INVALID");
}
