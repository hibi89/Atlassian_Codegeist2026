// A configured synthetic page only; never take a page ID or URL from the browser.
export const validPageId=id=>typeof id==="string"&&/^[1-9][0-9]{0,30}$/.test(id);
const fail=code=>({ok:false,code});
export async function readPage(id,request,clock,digest){
 if(!validPageId(id))return fail("CONFLUENCE_TARGET_INVALID");
 try{
  const res=await request(id);
  if(res?.status===401||res?.status===403)return fail("CONFLUENCE_ACCESS_UNKNOWN");
  if(res?.status===404)return fail("CONFLUENCE_NOT_VISIBLE_OR_MISSING");
  if(res?.status===429)return fail("CONFLUENCE_RATE_LIMITED");
  if(res?.status!==200)return fail("CONFLUENCE_UNAVAILABLE");
  const length=res.headers?.get?.("content-length");if(length&&Number(length)>131072)return fail("CONFLUENCE_RESPONSE_LIMIT");
  const text=await res.text();if(typeof text!=="string"||Buffer.byteLength(text,"utf8")>131072)return fail("CONFLUENCE_RESPONSE_LIMIT");
  const page=JSON.parse(text),version=page.version?.createdAt,number=page.version?.number,body=page.body?.storage;
  if(page.id!==id||page.status!=="current"||typeof page.title!=="string"||page.title.length>500||!Number.isSafeInteger(number)||number<1||typeof version!=="string"||!Number.isFinite(Date.parse(version))||body?.representation!=="storage"||typeof body.value!=="string")return fail("CONFLUENCE_VERSION_OR_CONTENT_UNKNOWN");
  // Hash the content without returning/storing raw page text, title or HTML.
  const contentHash=digest(JSON.stringify([id,page.title,number,version,body.value]));
  return {ok:true,page:{objectId:id,version:new Date(Date.parse(version)).toISOString(),versionNumber:number,contentHash,retrievedAt:new Date(clock()).toISOString(),visibility:"OBSERVED_AS_USER"}};
 }catch{return fail("CONFLUENCE_UNAVAILABLE")}
}
