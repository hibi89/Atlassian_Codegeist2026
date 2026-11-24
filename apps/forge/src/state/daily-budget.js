// Installation-local admission cap for explicit development storage requests.
// Not a substitute for the platform-wide billing meter.
export async function reserveDailySlot(kvs,now,limit=24){
 if(!Number.isSafeInteger(now)||now<0||!Number.isSafeInteger(limit)||limit<1||limit>24)return {ok:false,code:"DEVELOPMENT_BUDGET_UNKNOWN"};
 try{
  const day=new Date(now).toISOString().slice(0,10);
  for(let i=0;i<limit;i++){
   const key="cg:dev-budget:"+day+":"+i;
   if(await kvs.get(key)!=null)continue;
   try{await kvs.set(key,{schema_version:"hae.dev.budget.v1",at:now},{keyPolicy:"FAIL_IF_EXISTS",ttl:{unit:"DAYS",value:2}});return {ok:true}}
   catch{return {ok:false,code:"DEVELOPMENT_BUDGET_CONFLICT_OR_UNKNOWN"}}
  }
  return {ok:false,code:"DEVELOPMENT_DAILY_BUDGET_EXHAUSTED"};
 }catch{return {ok:false,code:"DEVELOPMENT_BUDGET_UNKNOWN"}}
}
