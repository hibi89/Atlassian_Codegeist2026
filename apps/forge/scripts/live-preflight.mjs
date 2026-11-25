// Local preflight: no network, credential reads, package installation, deploy or app writes.
import {spawnSync} from "node:child_process";
import {readFileSync,lstatSync,readdirSync} from "node:fs";
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
// Exclude only the exact outputs of the existing dependency inventory script.
// Other non-ignored untracked app files can change bundler resolution or packaging.
export function untrackedAppClean(raw){
 if(typeof raw!=="string")return false;
 if(raw==="")return true;
 if(!raw.endsWith("\0"))return false;
 const generated=new Set(["dependency-inventory.json","third-party-notices-review.txt"]);
 return raw.slice(0,-1).split("\0").every(p=>generated.has(p));
}
function command(executable,args,quiet=false){
 const r=spawnSync(executable,args,{cwd:root,encoding:"utf8",stdio:quiet?["ignore","pipe","pipe"]:"inherit",windowsHide:true,shell:false,timeout:300000});
 if(r.error||r.status!==0)throw Error("COMMAND_FAILED");
 return quiet?r.stdout.trim():"";
}
export function validateArtifacts(base=root){
 const out=[];
 function directory(relative){
  const dir=path.join(base,relative),st=lstatSync(dir);
  if(!st.isDirectory()||st.isSymbolicLink())throw Error("ARTIFACT_DIRECTORY_INVALID");
  return dir;
 }
 function add(file){
  const target=path.join(base,file),st=lstatSync(target);
  if(!st.isFile()||st.isSymbolicLink()||st.size<=0||st.size>10*1024*1024)throw Error("ARTIFACT_MISSING_OR_SIZE_INVALID");
  const bytes=readFileSync(target);
  if(bytes.length!==st.size)throw Error("ARTIFACT_CHANGED_DURING_READ");
  out.push({file,bytes:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex")});
  return bytes;
 }
 add("package-lock.json");
 directory("src");directory("src/ui");
 const required=["index.html","app.js","app.css"],optional=["app.js.LEGAL.txt","app.css.LEGAL.txt"];
 const permitted=new Set([...required,...optional]);
 for(const relative of ["src/ui/dist","src/ui/project-dist"]){
  const dir=directory(relative),names=readdirSync(dir);
  if(names.some(n=>!permitted.has(n)))throw Error("UNEXPECTED_RESOURCE_OUTPUT");
  if(required.some(n=>!names.includes(n)))throw Error("ARTIFACT_MISSING_OR_SIZE_INVALID");
  for(const name of required){
   const bytes=add(relative+"/"+name);
   if(name!=="index.html"&&bytes.toString("utf8").includes("For license information please see "+name+".LEGAL.txt")&&!names.includes(name+".LEGAL.txt"))throw Error("LINKED_LEGAL_OUTPUT_MISSING");
  }
  for(const name of optional)if(names.includes(name))add(relative+"/"+name);
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
  if(!untrackedAppClean(command("git",["ls-files","--others","--exclude-standard","-z","--","."],true)))throw Error("UNTRACKED_APP_FILES_PRESENT");
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
  if(!trackedClean(finalStatus,finalHead,opts.sha)||!untrackedAppClean(command("git",["ls-files","--others","--exclude-standard","-z","--","."],true)))throw Error("SOURCE_CHANGED_DURING_CHECK");
  console.log("LOCAL_PREFLIGHT="+(opts.outputsOnly?"OUTPUTS_ONLY_PASS":"TEST_AND_BUILD_PASS"));
  console.log("FORGE_LINT=NOT_RUN; LIVE_DEPLOY=NOT_RUN; BROWSER=NOT_RUN");
  return 0;
 }catch(e){console.error("LOCAL_PREFLIGHT_FAILED="+(typeof e?.message==="string"&&/^[A-Z0-9_]+$/.test(e.message)?e.message:"LOCAL_CHECK_UNKNOWN"));return 1;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))process.exitCode=main(process.argv.slice(2));
