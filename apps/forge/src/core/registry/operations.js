function validIssueKey(v){return typeof v==="string"&&v.length<=64&&/^[A-Z][A-Z0-9_]*-[1-9][0-9]*$/.test(v)}

function exactKeys(o,keys){return !!o&&typeof o==="object"&&!Array.isArray(o)&&Object.getPrototypeOf(o)===Object.prototype&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k))}

function operationSpec(op){
  const specs={
    "jira.issue.read":{effect:"READ",scopes:["read:jira-work"]},
    "jira.issue.links.read":{effect:"READ",scopes:["read:jira-work"]},
    "evidence.version.check":{effect:"PURE",scopes:[]},
    "evidence.contradiction.check":{effect:"PURE",scopes:[]},
    "report.evidence.generate":{effect:"METADATA",scopes:[]},
    "jira.issue.comment.create":{effect:"WRITE",scopes:["write:jira-work"]},
  };
  return typeof op==="string"&&Object.hasOwn(specs,op)?specs[op]:null;
}

function validateArgs(op,args,target){
  if(op==="jira.issue.comment.create")return exactKeys(args,["issue_key","comment"])&&args.issue_key===target&&typeof args.comment==="string"&&args.comment.trim().length>0&&args.comment.length<=2000;
  return operationSpec(op)!==null&&exactKeys(args,["issue_key"])&&args.issue_key===target;
}

export { validIssueKey, exactKeys, operationSpec, validateArgs };
