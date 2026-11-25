import apiModule,{route,getAppContext} from "@forge/api";
import kvsModule,{WhereConditions} from "@forge/kvs";
import {resolveForgeApi} from "../forge-interop.js";
import {digest,readCurrentEvidence} from "../evidence/forge-evidence.js";
import {getKvs,createDevelopmentStore} from "../state/forge-review.js";
import {reserveDailySlot} from "../state/daily-budget.js";
import {loadProjectDashboard} from "./project-dashboard.js";
const api=resolveForgeApi(apiModule);
async function readProjectIssue(){
 const response=await api.asUser().requestJira(route`/rest/api/3/issue/HTF-2?fields=project`,{method:"GET",headers:{Accept:"application/json"}});
 if(response.status!==200)return null;
 const length=response.headers?.get?.("content-length");if(length&&Number(length)>131072)return null;
 const body=await response.text();if(typeof body!=="string"||Buffer.byteLength(body,"utf8")>131072)return null;
 const x=JSON.parse(body);return {key:x.key,id:x.id,project_id:x.fields?.project?.id,project_key:x.fields?.project?.key};
}
export async function projectDashboard(context){
 let development=false;try{development=String(getAppContext().environmentType).toUpperCase()==="DEVELOPMENT"}catch{}
 let store;
 return loadProjectDashboard(context,{development,cloudId:process.env.TRUSTFLOW_DEMO_CLOUD_ID,digest,clock:Date.now,
  admit:()=>reserveDailySlot(getKvs(kvsModule),Date.now(),24,Date.now),
  readProjectIssue,readEvidence:readCurrentEvidence,
  readStored:key=>(store??=createDevelopmentStore(getKvs(kvsModule))).get(key),
  queryReviews:(prefix,limit)=>getKvs(kvsModule).query({metadataFields:["EXPIRE_TIME"]}).where("key",WhereConditions.beginsWith(prefix)).limit(limit).getMany()
 });
}
