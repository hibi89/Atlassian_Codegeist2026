// Installation-local admission cap for explicit development storage requests.
// Not a substitute for the platform-wide billing meter.
export async function reserveDailySlot(kvs,now,limit=24,clock=()=>now){
 if(!Number.isSafeInteger(now)||now<0||!Number.isSafeInteger(limit)||limit<1||limit>24)return {ok:false,code:"DEVELOPMENT_BUDGET_UNKNOWN"};
 try{
  const day=new Date(now).toISOString().slice(0,10);
  const sameDay=()=>{const t=clock();return Number.isSafeInteger(t)&&t>=now&&new Date(t).toISOString().slice(0,10)===day};
  const rollover=()=>({ok:false,code:"DEVELOPMENT_BUDGET_DAY_CHANGED"});
  // Slots are append-only and filled from the lowest available index. Binary
  // search reduces serialized KVS requests at high utilization. A gap or
  // concurrent change can conservatively deny admission, never extend the cap:
  // the only grant is a single acknowledged conditional insert in [0,limit).
  const slot=i=>"cg:dev-budget:"+day+":"+i;
  let lo=0,hi=limit;
  while(lo<hi){
   if(!sameDay())return rollover();
   const mid=Math.floor((lo+hi)/2),existing=await kvs.get(slot(mid));
   if(!sameDay())return rollover();
   if(existing!=null)lo=mid+1;else hi=mid;
  }
  if(lo===limit)return {ok:false,code:"DEVELOPMENT_DAILY_BUDGET_EXHAUSTED"};
  if(!sameDay())return rollover();
  try{await kvs.set(slot(lo),{schema_version:"hae.dev.budget.v1",at:now},{keyPolicy:"FAIL_IF_EXISTS",ttl:{unit:"DAYS",value:2}});return sameDay()?{ok:true}:rollover()}
  catch{return {ok:false,code:"DEVELOPMENT_BUDGET_CONFLICT_OR_UNKNOWN"}}
 }catch{return {ok:false,code:"DEVELOPMENT_BUDGET_UNKNOWN"}}
}
