// Server-only development policy. Judge/production authorization is deliberately
// NOT enabled here. Resolver context and server configuration are authoritative.
const knownOperations=new Set(["read","preview","save","refresh","history","revalidate","recoverReport","repairDraft","prepare","approve","generate","revoke","provider","comment:prepare","comment:approve","comment:execute","comment:revoke","comment:reconcile"]);
export const validCloudId=id=>typeof id==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
export const demoInstallMatches=(context,id)=>validCloudId(id)&&context?.installContext==="ari:cloud:jira::site/"+id;
export const demoIssueMatches=(context,id)=>demoInstallMatches(context,id)&&context?.extension?.issue?.key==="HTF-2";
export function syntheticScopeAllowed(context,operation,cloudId){
 if(!knownOperations.has(operation))return false;
 return operation==="read"||operation==="preview"||demoIssueMatches(context,cloudId);
}
export function syntheticReadiness(context,development,cloudId){
 if(development!==true)return "DEVELOPMENT_ENVIRONMENT_REQUIRED";
 if(context?.extension?.issue?.key!=="HTF-2")return "SYNTHETIC_ISSUE_REQUIRED";
 if(!validCloudId(cloudId))return "DEMO_SITE_NOT_CONFIGURED";
 if(!demoIssueMatches(context,cloudId))return "DEMO_SITE_MISMATCH";
 return "READY_FOR_SYNTHETIC_REQUESTS";
}
export function developmentAdmission(context,development,cloudId,operation){
 if(development!==true)return {ok:false,code:"DEVELOPMENT_STORAGE_ONLY"};
 if(!knownOperations.has(operation))return {ok:false,code:"DEVELOPMENT_OPERATION_DENIED",authorization:"NONE",execution:"DISABLED"};
 if(!syntheticScopeAllowed(context,operation,cloudId))return {ok:false,code:"SYNTHETIC_DEMO_SCOPE_REQUIRED",authorization:"NONE",execution:"DISABLED"};
 return {ok:true};
}
