// Local installed dependency evidence only; no network or legal approval.
import {readFileSync,readdirSync,lstatSync,writeFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
const hash=b=>createHash("sha256").update(b).digest("hex");
const packagePart=/^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/;
const compare=(a,b)=>a<b?-1:a>b?1:0;
// Lock paths use POSIX separators even on Windows.
export function lockPackageName(p){
 if(typeof p!=="string"||p.length>2048)return null;
 const parts=p.split("/");let name=null;
 for(let i=0;i<parts.length;){
  if(parts[i++]!=="node_modules"||i>=parts.length)return null;
  const first=parts[i++];
  if(first.startsWith("@")){
   if(!packagePart.test(first.slice(1))||i>=parts.length||!packagePart.test(parts[i]))return null;
   name=first+"/"+parts[i++];
  }else{
   if(!packagePart.test(first))return null;
   name=first;
  }
 }
 return name;
}
function directory(base,p){
 let dir=base;
 for(const part of p.split("/")){
  dir=join(dir,part);
  const st=lstatSync(dir);
  if(!st.isDirectory()||st.isSymbolicLink())throw Error("LOCK_DIRECTORY_INVALID");
 }
 return dir;
}
function readBounded(file,limit){
 const st=lstatSync(file);
 if(!st.isFile()||st.isSymbolicLink()||st.size<1||st.size>limit)throw Error("EVIDENCE_FILE_INVALID");
 const bytes=readFileSync(file);
 if(bytes.length!==st.size)throw Error("EVIDENCE_FILE_CHANGED");
 return bytes;
}
export function inspectDependencies(base,lock){
 if(!lock?.packages||typeof lock.packages!=="object"||Array.isArray(lock.packages))throw Error("LOCK_INVALID");
 const inventory=[],noticeSections=[];
 for(const [p,entry] of Object.entries(lock.packages).sort(([a],[b])=>compare(a,b))){
  if(p==="")continue;
  const name=lockPackageName(p);
  if(!name||!entry||typeof entry.version!=="string"||!entry.version)throw Error("LOCK_PATH_OR_VERSION_INVALID");
  let dir;
  try{dir=directory(base,p)}catch(e){if(e.code!=="ENOENT"||entry.optional!==true)throw e}
  const installed=dir!==undefined,license=typeof entry.license==="string"?entry.license:"UNDECLARED";
  let licenseFiles=[],installedLicense=null;
  if(installed){
   // Missing metadata in an installed optional package is not an absent package.
   const pkg=JSON.parse(readBounded(join(dir,"package.json"),1048576).toString("utf8"));
   if(pkg.name!==name||pkg.version!==entry.version)throw Error("LOCK_PACKAGE_IDENTITY_MISMATCH:"+name);
   installedLicense=typeof pkg.license==="string"?pkg.license:"UNDECLARED";
   const names=readdirSync(dir).filter(n=>/^(licen[cs]e|notice|copying)([._-].*)?$/i.test(n)).sort(compare);
   for(const file of names){
    const target=join(dir,file),st=lstatSync(target);
    if(st.isDirectory()&&!st.isSymbolicLink())continue;
    const bytes=readBounded(target,262144),sha256=hash(bytes);
    licenseFiles.push({file,sha256});
    noticeSections.push("===== "+name+"@"+entry.version+" / "+p+" / "+file+" / SHA256 "+sha256+" =====\n"+bytes.toString("utf8"));
   }
  }
  const mismatch=installed&&installedLicense!==license;
  inventory.push({path:p,name,version:entry.version,license,installed_license:installedLicense,installed,optional:entry.optional===true,license_files:licenseFiles,license_review:installed&&(!licenseFiles.length||mismatch)?"NEEDS_MANUAL_REVIEW":installed?"FILE_PRESENT_NOT_LEGAL_REVIEW":"OPTIONAL_NOT_INSTALLED",review_reasons:installed?[...(!licenseFiles.length?["LICENSE_FILE_MISSING"]:[]),...(mismatch?["LICENSE_DECLARATION_MISMATCH"]:[])]:[]});
 }
 const manual=inventory.filter(x=>x.license_review==="NEEDS_MANUAL_REVIEW");
 const summary={lock_entries:inventory.length,installed:inventory.filter(x=>x.installed).length,manual_review:manual.length,optional_absent:inventory.filter(x=>!x.installed).length,legal_status:"NOT_REVIEWED"};
 const notices="HAE TrustFlow — installed dependency license/NOTICE evidence for review only.\nMissing or inconsistent entries listed below; not a complete distribution notice or legal approval.\n"+manual.map(x=>x.path+" "+x.name+"@"+x.version+" declared "+x.license+" installed "+x.installed_license+" "+x.review_reasons.join(",")).join("\n")+"\n\n"+noticeSections.join("\n\n")+"\n";
 return {summary,inventory,notices};
}
function main(){
 const base=resolve("."),lock=JSON.parse(readBounded(join(base,"package-lock.json"),10485760).toString("utf8"));
 const {summary,inventory,notices}=inspectDependencies(base,lock);
 for(const file of ["third-party-notices-review.txt","dependency-inventory.json"]){
  try{const st=lstatSync(join(base,file));if(!st.isFile()||st.isSymbolicLink())throw Error("INVENTORY_OUTPUT_INVALID")}catch(e){if(e.code!=="ENOENT")throw e}
 }
 writeFileSync(join(base,"third-party-notices-review.txt"),notices);
 writeFileSync(join(base,"dependency-inventory.json"),JSON.stringify({summary,inventory},null,2)+"\n");
 console.log("CG_DEPENDENCY_INVENTORY:"+JSON.stringify(summary));
 console.log("CG_LICENSE_MANUAL:"+JSON.stringify(inventory.filter(x=>x.license_review==="NEEDS_MANUAL_REVIEW").map(({path,name,version,license,installed_license,review_reasons})=>({path,name,version,license,installed_license,review_reasons}))));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
