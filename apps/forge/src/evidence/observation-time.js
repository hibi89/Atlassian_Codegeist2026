// Reject ambiguous/local timestamps and calendar rollover before normalization.
// Accept Jira's numeric offset without colon and Confluence's ISO offset.
export function observationTime(value){
 if(typeof value!=="string"||value.length>80)return null;
 const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:?\d{2})$/.exec(value);
 if(!m)return null;
 const [,y,mo,d,h,mi,s,,zone]=m,year=Number(y),month=Number(mo),day=Number(d);
 const leap=year%4===0&&(year%100!==0||year%400===0);
 const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
 if(year<1||month<1||month>12||day<1||day>days[month-1]||Number(h)>23||Number(mi)>59||Number(s)>59)return null;
 if(zone!=="Z"){const z=zone.slice(1).replace(":","");if(Number(z.slice(0,2))>23||Number(z.slice(2))>59)return null}
 const ms=Date.parse(value);
 return Number.isFinite(ms)?ms:null;
}
