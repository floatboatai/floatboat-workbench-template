// ABOUTME: 外部 Agent 经固定本机 Host 查询 Connector 契约，不处理授权或执行。
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
export const catalogOrigin = 'http://127.0.0.1:47831';
export async function queryCatalog(args, { fetchImpl = fetch, instance = process.env.FLOATBOAT_HOST_INSTANCE } = {}) {
  const [operation, ...rest] = args.filter(arg => arg !== '--');
  if (!['providers', 'actions', 'describe'].includes(operation)) throw new Error('Usage: workbench:catalog providers --query gmail | actions --provider connector:gmail --query messages | describe --capability <exact-id>');
  const { values } = parseArgs({args:rest,strict:true,options:{query:{type:'string'},provider:{type:'string'},capability:{type:'string'},limit:{type:'string'},page:{type:'string'}}});
  if(operation==='actions' && !values.provider) throw new Error('--provider is required');
  if(operation==='describe' && !values.capability) throw new Error('--capability is required');
  if(operation==='describe' && Object.keys(values).some(key=>key!=='capability')) throw new Error('describe accepts only --capability');
  if(operation!=='describe' && values.capability) throw new Error('--capability is only valid for describe');
  if(operation==='actions' && values.page!==undefined) throw new Error('--page is only supported by providers');
  if(operation==='providers' && values.provider) throw new Error('--provider is only valid for actions');
  const limit=values.limit===undefined?undefined:Number(values.limit);
  if(limit!==undefined && (!Number.isInteger(limit)||limit<1||limit>50)) throw new Error('--limit must be between 1 and 50');
  if(values.page!==undefined && !/^\d{1,8}$/.test(values.page)) throw new Error('--page must be a returned page token');
  const post = async (path,body) => {
    let response;
    try { response=await fetchImpl(`${catalogOrigin}${path}`,{method:'POST',redirect:'error',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)}); }
    catch { throw new Error('HOST_NOT_CONNECTED: Start Floatboat with local catalog support (127.0.0.1:47831).'); }
    let result;
    try { result=await response.json(); } catch { throw new Error('HOST_CATALOG_IDENTITY_INVALID'); }
    if(!response.ok) {
      const code=result.error?.code ?? 'HOST_CATALOG_QUERY_FAILED';
      const hint={HOST_ACCOUNT_REQUIRED:'Sign in to Floatboat first.',HOST_FEATURE_ACCESS_DENIED:'This Floatboat account needs workbench execution access.'}[code];
      throw new Error(hint ? `${code}: ${hint}` : code);
    }
    if(result.protocol!==1 || result.service!=='floatboat-workbench-catalog' || typeof result.instance!=='string') throw new Error('HOST_CATALOG_IDENTITY_INVALID');
    if(instance && result.instance!==instance) throw new Error('HOST_CATALOG_INSTANCE_MISMATCH: Port 47831 belongs to another Floatboat instance.');
    return result;
  };
  const status=await post('/status',{});
  const input=operation==='describe'?{capability:values.capability}:{...(values.query===undefined?{}:{query:values.query}),...(values.provider?{provider:values.provider}:{}),...(limit===undefined?{}:{pageSize:limit}),...(values.page===undefined?{}:{pageToken:values.page})};
  const result=await post('/catalog',{operation,input});
  if(result.instance!==status.instance) throw new Error('HOST_CATALOG_INSTANCE_CHANGED');
  return result;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  queryCatalog(process.argv.slice(2)).then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error.message);process.exitCode=1;});
}
