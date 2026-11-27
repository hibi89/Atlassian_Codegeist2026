function fail(code){return {ok:false,code};}

function issueHint(context){
  const key=context?.extension?.issue?.key;
  if(typeof context?.accountId!=="string"||!context.accountId||context.accountType==="anonymous")return fail("AUTH_REQUIRED");
  if(typeof key!=="string"||key.length>64||!/^[A-Z][A-Z0-9_]*-[1-9][0-9]*$/.test(key))return fail("ISSUE_CONTEXT_REQUIRED");
  return {ok:true,key};
}

export { fail, issueHint };
