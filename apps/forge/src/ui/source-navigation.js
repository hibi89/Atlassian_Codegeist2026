// Only exact relative references emitted by the existing authorized evidence readers.
export function sourceNavigationPath(uri){
 if(typeof uri!=="string"||uri.length>128||/\s/.test(uri))return null;
 if(/^\/browse\/[A-Z][A-Z0-9_]*-[1-9][0-9]*$/.test(uri)&&uri.slice(8).length<=64)return uri;
 if(/^\/wiki\/pages\/viewpage\.action\?pageId=[1-9][0-9]{0,30}$/.test(uri))return uri;
 return null;
}
export async function openObservedSource(uri,open){
 const path=sourceNavigationPath(uri);
 if(!path||typeof open!=="function")return {ok:false,code:"SOURCE_NAVIGATION_DENIED"};
 try{await open(path);return {ok:true}}catch{return {ok:false,code:"SOURCE_NAVIGATION_UNAVAILABLE"}}
}
