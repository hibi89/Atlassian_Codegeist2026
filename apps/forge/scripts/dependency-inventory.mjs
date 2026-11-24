// Only local installed package metadata and license files; no source or credentials transmitted.
import {readFileSync,readdirSync,statSync,writeFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {createHash} from "node:crypto";
const lock=JSON.parse(readFileSync("package-lock.json","utf8")),inventory=[];
for(const [path,entry] of Object.entries(lock.packages)){
 if(!path)continue;
 const dir=resolve(path);
 if(!dir.startsWith(resolve("node_modules")+"/"))throw Error("LOCK_PATH_INVALID");
 let installed=false,licenseFiles=[],license=entry.license??"UNDECLARED",name=path.split("node_modules/").at(-1);
 try{
  const pkg=JSON.parse(readFileSync(join(dir,"package.json"),"utf8"));
  if(pkg.version!==entry.version)throw Error("LOCK_VERSION_MISMATCH:"+name);
  installed=true;
  licenseFiles=readdirSync(dir).filter(n=>/^(licen[cs]e|notice|copying)([._-].*)?$/i.test(n)).filter(n=>statSync(join(dir,n)).isFile()).map(n=>({file:n,sha256:createHash("sha256").update(readFileSync(join(dir,n))).digest("hex")}));
 }catch(e){if(e.code!=="ENOENT"||!entry.optional)throw e}
 inventory.push({name,version:entry.version,license,installed,optional:!!entry.optional,license_files:licenseFiles,license_review:installed&&licenseFiles.length?"FILE_PRESENT_NOT_LEGAL_REVIEW":installed?"NEEDS_MANUAL_REVIEW":"OPTIONAL_NOT_INSTALLED"});
}
const summary={lock_entries:inventory.length,installed:inventory.filter(x=>x.installed).length,manual_review:inventory.filter(x=>x.license_review==="NEEDS_MANUAL_REVIEW").length,optional_absent:inventory.filter(x=>!x.installed).length,legal_status:"NOT_REVIEWED"};
writeFileSync("dependency-inventory.json",JSON.stringify({summary,inventory},null,2)+"\n");console.log("CG_DEPENDENCY_INVENTORY:"+JSON.stringify(summary));
