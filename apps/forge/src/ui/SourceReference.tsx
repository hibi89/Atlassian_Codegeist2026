import React,{useState,useRef} from "react";
import {router} from "@forge/bridge";
import {sourceNavigationPath,openObservedSource} from "./source-navigation.js";
export function SourceReference({uri}:{uri:string}){
 const path=sourceNavigationPath(uri);
 const [pending,setPending]=useState(false),[failed,setFailed]=useState(false);const lock=useRef(false);
 async function open(){if(lock.current)return;lock.current=true;setPending(true);setFailed(false);try{const result=await openObservedSource(uri,p=>router.open(p));if(!result.ok)setFailed(true)}finally{lock.current=false;setPending(false)}}
 return <span className="source-reference"><code>{uri}</code>{path&&<button type="button" className="source-open" disabled={pending} onClick={open} aria-label={"Open observed source "+uri+" in a new tab"}>{pending?"Opening…":"Open source ↗"}</button>}{failed&&<span role="alert">Source navigation unavailable. Open the recorded reference in Atlassian.</span>}</span>;
}
