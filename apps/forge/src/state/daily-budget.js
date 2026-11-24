// Installation-local admission cap for explicit development storage requests.
// Not a substitute for the platform-wide billing meter.
export async function reserveDailySlot(kvs,now,limit=24,clock=()=>now){
 if(!Number.isSafeInteger(now)||now<0||!Number.isSafeInteger(limit)||limit<1||limit>24)return {ok:false,code:"DEVELOPMENT_BUDGET_UNKNOWN"};
 try{
  const day=new Date(now).toISOString().slice(0,10);
  const sameDay=()=>{const t=clock();return Number.isSafeInteger(t)&&t>=now&&new Date(t).toISOString().slice(0,10)===day};
  const rollover=()=>({ok:false,code:"DEVELOPMENT_BUDGET_DAY_CHANGED"});
  for(let i=0;i<limit;i++){
   const key="cg:dev-budget:"+day+":"+i;
   if(!sameDay())return rollover();
   const existing=await kvs.get(key);
   if(!sameDay())return rollover();
   if(existing!=null)continue;
   try{await kvs.set(key,{schema_version:"hae.dev.budget.v1",at:now},{keyPolicy:"FAIL_IF_EXISTS",ttl:{unit:"DAYS",value:2}});return sameDay()?{ok:true}:rollover()}
   catch{return {ok:false,code:"DEVELOPMENT_BUDGET_CONFLICT_OR_UNKNOWN"}}
  }
  return {ok:false,code:"DEVELOPMENT_DAILY_BUDGET_EXHAUSTED"};
 }catch{return {ok:false,code:"DEVELOPMENT_BUDGET_UNKNOWN"}}
}
