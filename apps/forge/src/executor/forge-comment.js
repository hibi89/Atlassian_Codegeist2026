import apiModule,{route} from "@forge/api";
import {resolveForgeApi} from "../forge-interop.js";
import {DEMO_ISSUE} from "../security/write-policy.js";
const api=resolveForgeApi(apiModule);
const headers={Accept:"application/json"};
async function json(res,limit=131072){
 const length=res.headers?.get?.("content-length");
 if(length&&Number(length)>limit)throw Error("COMMENT_RESPONSE_LIMIT");
 const text=await res.text();if(Buffer.byteLength(text,"utf8")>limit)throw Error("COMMENT_RESPONSE_LIMIT");
 return JSON.parse(text);
}
function target(key){if(key!==DEMO_ISSUE)throw Error("DEMO_TARGET_DENIED");return key}
export function createForgeCommentTransport(){
 return {
  async permissions(key){
   const res=await api.asUser().requestJira(route`/rest/api/3/mypermissions?issueKey=${target(key)}&permissions=BROWSE_PROJECTS,ADD_COMMENTS`,{method:"GET",headers});
   if(res.status!==200)return {browse:false,add:false};
   const body=await json(res,32768);return {browse:body.permissions?.BROWSE_PROJECTS?.havePermission===true,add:body.permissions?.ADD_COMMENTS?.havePermission===true};
  },
  async post(key,body){
   const res=await api.asUser().requestJira(route`/rest/api/3/issue/${target(key)}/comment`,{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify({body})});
   if(res.status!==201)return {status:res.status};
   try{return {status:201,id:String((await json(res)).id??"")}}catch{return {status:201}}
  },
  async get(key,id){
   if(typeof id!=="string"||!/^[1-9][0-9]{0,30}$/.test(id))throw Error("COMMENT_ID_INVALID");
   const res=await api.asUser().requestJira(route`/rest/api/3/issue/${target(key)}/comment/${id}`,{method:"GET",headers});
   return res.status===200?{status:200,comment:await json(res)}:{status:res.status};
  },
  async recent(key){
   const res=await api.asUser().requestJira(route`/rest/api/3/issue/${target(key)}/comment?maxResults=20&orderBy=-created`,{method:"GET",headers});
   return res.status===200?{status:200,comments:(await json(res,262144)).comments}:{status:res.status};
  }
 };
}
