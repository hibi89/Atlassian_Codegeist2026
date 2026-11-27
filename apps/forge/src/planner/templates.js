import { fail, issueHint } from "../security-context.js";
function intentPreview(input){
  if(typeof input!=="string"||input.length>300)return fail("UNSUPPORTED_INTENT");
  const value=input.trim().normalize("NFKC").toLowerCase().replace(/[.!?]+$/u,"").replace(/\s+/gu," ");
  const templates={
    "review change": {id:"change-review",title:"Evidence-backed change review",steps:["Read current issue","Check requirements and policy","Draft a bounded review comment for human approval"]},
    "coordinate incident": {id:"incident-coordinate",title:"Incident coordination",steps:["Read linked incident context","Compare ownership evidence","Draft a guarded response plan"]},
    "review release": {id:"release-review",title:"Release assurance",steps:["Read release context","Identify missing or conflicting evidence","Draft a read-only evidence report"]},
  };
  const aliases={
    "review change":"review change","review this change":"review change","review the change":"review change","변경 검토":"review change","변경 요청 검토":"review change",
    "coordinate incident":"coordinate incident","coordinate this incident":"coordinate incident","review incident":"coordinate incident","장애 대응":"coordinate incident","장애 검토":"coordinate incident",
    "review release":"review release","review this release":"review release","check release readiness":"review release","릴리스 검토":"review release","출시 준비 검토":"review release"
  };
  if(!Object.hasOwn(aliases,value))return fail("UNSUPPORTED_INTENT");
  const t=templates[aliases[value]];
  return {ok:true,mode:"DETERMINISTIC_TEMPLATE",draft:{intentId:t.id,title:t.title,steps:t.steps,authorization:"NONE",effect:"PREVIEW_ONLY",status:"EVIDENCE_PENDING"}};
}

function contextPreview(context,input){
  const hint=issueHint(context);
  if(!hint.ok)return hint;
  const result=intentPreview(input);
  if(!result.ok)return result;
  return {...result,issueKey:hint.key};
}

export { intentPreview, contextPreview };
