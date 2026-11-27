// Presentation of current returned claim checks only. Never infer unseen evidence.
const known=new Set(["SOURCE_OBSERVED","UNVERIFIED_CLAIM","CONFLICT_FOUND"]);
export function claimExplorer(evidence,review,filter="all",source="all",query=""){
 if(!Array.isArray(evidence?.sources)||!Array.isArray(review?.checks)||review.reason==="CLAIMS_UNKNOWN"||!["all","SOURCE_OBSERVED","UNVERIFIED_CLAIM","CONFLICT_FOUND","UNKNOWN"].includes(filter)||typeof query!=="string"||query.length>160)return null;
 const sources=new Map();
 for(const s of evidence.sources){if(typeof s?.source_ref!=="string"||typeof s.uri!=="string"||sources.has(s.source_ref))return null;sources.set(s.source_ref,s.uri)}
 if(source!=="all"&&!sources.has(source))return null;
 const counts={SOURCE_OBSERVED:0,UNVERIFIED_CLAIM:0,CONFLICT_FOUND:0,UNKNOWN:0},rows=[],ids=new Set();
 for(const x of review.checks){
  if(typeof x?.subject!=="string"||typeof x.predicate!=="string"||!Array.isArray(x.values)||!x.values.every(v=>typeof v==="string")||!Array.isArray(x.source_refs)||!x.source_refs.length||x.source_refs.some(r=>!sources.has(r)))return null;
  const key=JSON.stringify([x.subject,x.predicate]);if(ids.has(key))return null;ids.add(key);
  const state=known.has(x.status)?x.status:"UNKNOWN";counts[state]++;
  const subject=sources.get(x.subject)??((x.predicate.startsWith("jira.")||x.predicate==="confluence.page_version")?"Observed source":x.subject);
  const uris=[...new Set(x.source_refs.map(r=>sources.get(r)))];
  const search=[subject,x.predicate,...x.values,...uris].join(" ").toLowerCase();
  if((filter==="all"||state===filter)&&(source==="all"||x.source_refs.includes(source))&&search.includes(query.trim().toLowerCase()))rows.push({key,subject,predicate:x.predicate,values:x.values,state,reason:typeof x.reason==="string"?x.reason:"UNKNOWN",uris});
 }
 return {total:review.checks.length,counts,rows,sources:[...sources].map(([ref,uri])=>({ref,uri}))};
}
