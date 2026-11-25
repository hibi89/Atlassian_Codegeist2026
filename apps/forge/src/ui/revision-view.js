// Use only server-returned comparison rows, never infer inaccessible sources.
export function revisionView(comparison,filter="all"){
 if(!["all","changed","unchanged"].includes(filter)||!comparison||!["CURRENT_OBSERVED","STALE_VERSION"].includes(comparison.status)||!Array.isArray(comparison.rows)||comparison.rows.length>8)return null;
 const ids=new Set();let changed=0,unchanged=0;
 for(const row of comparison.rows){
  if(typeof row?.uri!=="string"||ids.has(row.uri)||typeof row.current_version!=="string"||!Number.isFinite(Date.parse(row.current_version))||!["NEW_DEPENDENCY","CHANGED","UNCHANGED"].includes(row.state))return null;
  ids.add(row.uri);
  if(row.state==="NEW_DEPENDENCY"){if(row.saved_version!==null||row.content_changed!==null||row.revision_changed!==null)return null}
  else if(typeof row.saved_version!=="string"||!Number.isFinite(Date.parse(row.saved_version))||typeof row.content_changed!=="boolean"||typeof row.revision_changed!=="boolean"||row.state==="UNCHANGED"&&(row.content_changed||row.revision_changed||row.saved_version!==row.current_version)||row.state==="CHANGED"&&!row.content_changed&&!row.revision_changed&&row.saved_version===row.current_version)return null;
  if(row.state==="UNCHANGED")unchanged++;else changed++;
 }
 if(comparison.status==="CURRENT_OBSERVED"&&changed)return null;
 return {total:comparison.rows.length,changed,unchanged,rows:comparison.rows.filter(r=>filter==="all"||(filter==="changed"?r.state!=="UNCHANGED":r.state==="UNCHANGED"))};
}
