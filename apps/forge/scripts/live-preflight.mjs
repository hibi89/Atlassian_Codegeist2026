// Local preflight: no network, credential reads, package installation, deploy or app writes.
import {spawnSync} from "node:child_process";
import {readFileSync,statSync} from "node:fs";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import path from "node:path";
const root=fileURLToPath(new URL("../",import.meta.url));
export function parsePreflightArgs(args){
 if(!Array.isArray(args)||![2,3].includes(args.length)||args[0]!=="--expected-sha"||!/^[a-f0-9]{40}$/.test(args[1])||args.length===3&&args[2]!=="--outputs-only")return null;
 return {sha:args[1],outputsOnly:args.length===3};
}
export function nativeTestArgs(script){
 if(typeof script!=="string"||!/^node --test(?: src\/[a-zA-Z0-9_./-]+\.test\.js)+$/.test(script))return null;
 const args=script.split(" ").slice(1);
 if(args.slice(1).some(p=>p.split("/").some(x=>x===".."||x===".")))return null;
 return args;
}
export function trackedClean(status,head,expected){
 return typeof status==="string"&&status.trim()===""&&typeof head==="string"&&head.trim()===expected;
}
function command(executable,args,quiet=false){
 const r=spawnSync(executable,args,{cwd:root,encoding:"utf8",stdio:quiet?["ignore","pipe","pipe"]:"inherit",windowsHide:true,shell:false,timeout:300000});
 if(r.error||r.status!==0)throw Error("COMMAND_FAILED");
 return quiet?r.stdout.trim():"";
}
export function validateArtifacts(base=root){
 const out=[];
 for(const file of ["package-lock.json","src/ui/dist/index.html","src/ui/dist/app.js","src/ui/dist/app.css","src/ui/project-dist/index.html","src/ui/project-dist/app.js","src/ui/project-dist/app.css"]){
  const target=path.join(base,file),st=statSync(target);
  if(!st.isFile()||st.size<=0||st.size>10*1024*1024)throw Error("ARTIFACT_MISSING_OR_SIZE_INVALID");
  out.push({file,bytes:st.size,sha256:createHash("sha256").update(readFileSync(target)).digest("hex")});
 }
 return out;
}
export function main(args){
 const opts=parsePreflightArgs(args);
 if(!opts){console.error("PREFLIGHT_ARGS_INVALID: --expected-sha <40 lowercase hex> [--outputs-only]");return 2;}
 try{
  if(process.versions.node.split(".")[0]!=="22")throw Error("NODE_22_REQUIRED");
  const head=command("git",["rev-parse","HEAD"],true),status=command("git",["status","--porcelain","--untracked-files=no"],true);
  if(!trackedClean(status,head,opts.sha))throw Error("SOURCE_HEAD_OR_TRACKED_FILES_MISMATCH");
  console.log("SOURCE_SHA="+head);
  console.log("NODE="+process.versions.node);
  if(!opts.outputsOnly){
   const pkg=JSON.parse(readFileSync(path.join(root,"package.json"),"utf8"));
   for(const name of ["test:smoke","test:p2"]){
    const argv=nativeTestArgs(pkg.scripts?.[name]);if(!argv)throw Error("TEST_COMMAND_INVALID");
    command(process.execPath,argv);
   }
   command(process.execPath,["src/ui/build.mjs"]);
  }
  for(const item of validateArtifacts())console.log(JSON.stringify(item));
  const finalHead=command("git",["rev-parse","HEAD"],true),finalStatus=command("git",["status","--porcelain","--untracked-files=no"],true);
  if(!trackedClean(finalStatus,finalHead,opts.sha))throw Error("SOURCE_CHANGED_DURING_CHECK");
  console.log("LOCAL_PREFLIGHT="+(opts.outputsOnly?"OUTPUTS_ONLY_PASS":"TEST_AND_BUILD_PASS"));
  console.log("FORGE_LINT=NOT_RUN; LIVE_DEPLOY=NOT_RUN; BROWSER=NOT_RUN");
  return 0;
 }catch(e){console.error("LOCAL_PREFLIGHT_FAILED="+(typeof e?.message==="string"&&/^[A-Z0-9_]+$/.test(e.message)?e.message:"LOCAL_CHECK_UNKNOWN"));return 1;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))process.exitCode=main(process.argv.slice(2));
