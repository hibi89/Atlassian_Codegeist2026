// Local-only artifact evidence. Hash equality is not a signature or deployment proof.
import {readFileSync,lstatSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {validateArtifacts} from "./live-preflight.mjs";
const schema="hae.build.evidence.v1";
const sha=x=>typeof x==="string"&&/^[a-f0-9]{40}$/.test(x);
const hash=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
const positive=x=>Number.isSafeInteger(x)&&x>0;
const metadataFiles=["dependency-inventory.json","third-party-notices-review.txt"];
const required=["package-lock.json",...["src/ui/dist","src/ui/project-dist"].flatMap(d=>["index.html","app.js","app.css"].map(f=>d+"/"+f)),...metadataFiles];
const optional=["src/ui/dist","src/ui/project-dist"].flatMap(d=>["app.js.LEGAL.txt","app.css.LEGAL.txt"].map(f=>d+"/"+f));
const permitted=new Set([...required,...optional]);
function metadata(base,file){
 const target=path.join(base,file),st=lstatSync(target);
 if(!st.isFile()||st.isSymbolicLink()||st.size<1||st.size>10*1024*1024)throw Error("EVIDENCE_FILE_INVALID");
 const bytes=readFileSync(target);
 if(bytes.length!==st.size)throw Error("EVIDENCE_FILE_CHANGED");
 return {file,bytes:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex")};
}
function observedFiles(base){
 return [...validateArtifacts(base),...metadataFiles.map(f=>metadata(base,f))].sort((a,b)=>a.file<b.file?-1:a.file>b.file?1:0);
}
export function validManifest(m){
 return !!m&&m.schema_version===schema&&sha(m.source_sha)&&positive(m.run_id)&&positive(m.run_attempt)&&m.scope==="NATIVE_BUILD_OUTPUTS_ONLY"&&m.deployment==="NOT_RUN"&&m.signature==="NONE"&&Array.isArray(m.files)&&m.files.length>=required.length&&m.files.length<=permitted.size&&new Set(m.files.map(f=>f?.file)).size===m.files.length&&required.every(n=>m.files.some(f=>f?.file===n))&&m.files.every(f=>permitted.has(f?.file)&&positive(f.bytes)&&f.bytes<=10*1024*1024&&hash(f.sha256));
}
export function createBuildManifest(base,source,run,attempt){
 const m={schema_version:schema,source_sha:source,run_id:run,run_attempt:attempt,scope:"NATIVE_BUILD_OUTPUTS_ONLY",deployment:"NOT_RUN",signature:"NONE",files:observedFiles(base)};
 if(!validManifest(m))throw Error("EVIDENCE_MANIFEST_INVALID");
 return m;
}
export function verifyBuildManifest(base,m,source,run,attempt){
 if(!validManifest(m)||m.source_sha!==source||m.run_id!==run||m.run_attempt!==attempt)throw Error("EVIDENCE_REFERENCE_MISMATCH");
 const actual=observedFiles(base),expected=new Map(m.files.map(f=>[f.file,f]));
 if(actual.length!==expected.size||actual.some(f=>{const e=expected.get(f.file);return !e||e.bytes!==f.bytes||e.sha256!==f.sha256}))throw Error("EVIDENCE_HASH_MISMATCH");
 return {ok:true,files:actual.length,scope:m.scope,deployment:"NOT_RUN",signature:"NONE"};
}
function id(x){return typeof x==="string"&&/^[1-9][0-9]*$/.test(x)&&positive(Number(x))?Number(x):null}
function main(args){
 if(args.length!==5||!["--create","--verify"].includes(args[0])||!sha(args[2])||!id(args[3])||!id(args[4]))throw Error("EVIDENCE_ARGS_INVALID");
 const base=path.resolve(args[1]),st=lstatSync(base);
 if(!st.isDirectory()||st.isSymbolicLink())throw Error("EVIDENCE_DIRECTORY_INVALID");
 const file=path.join(base,"build-evidence-manifest.json");
 if(args[0]==="--create"){
  const m=createBuildManifest(base,args[2],id(args[3]),id(args[4]));
  // Do not overwrite a prior file or follow an existing symlink.
  writeFileSync(file,JSON.stringify(m,null,2)+"\n",{flag:"wx"});
  console.log("BUILD_EVIDENCE_MANIFEST="+JSON.stringify(m));
 }else{
  const st=lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.size>65536)throw Error("EVIDENCE_MANIFEST_INVALID");
  const m=JSON.parse(readFileSync(file,"utf8"));
  const r=verifyBuildManifest(base,m,args[2],id(args[3]),id(args[4]));
  console.log("BUILD_EVIDENCE_VERIFY="+JSON.stringify(r));
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{main(process.argv.slice(2))}catch(e){console.error(typeof e?.message==="string"&&/^[A-Z0-9_]+$/.test(e.message)?e.message:"BUILD_EVIDENCE_UNKNOWN");process.exitCode=1}
}
