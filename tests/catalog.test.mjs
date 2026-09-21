// ABOUTME: 外部目录命令固定访问本机端口，验证参数、实例和错误，不连接真实账户。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {queryCatalog,catalogOrigin} from '../tooling/catalog.mjs';
const identity={protocol:1,service:'floatboat-workbench-catalog',instance:'test'};
test('三种命令走固定本机只读入口，返回精确契约',async()=>{
 for(const args of [['providers','--query','gmail'],['actions','--provider','connector:gmail','--query','messages'],['describe','--capability','connector:gmail:gmail.fetch_emails']]) {
  const calls=[];
  const fetchImpl=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({...identity,data:{id:'exact'}}));};
  const result=await queryCatalog(args,{fetchImpl,instance:'test'});
  assert.equal(result.data.id,'exact');assert.equal(calls[0].url,`${catalogOrigin}/status`);assert.equal(calls[1].url,`${catalogOrigin}/catalog`);
  assert.equal(calls[1].options.redirect,'error');assert.equal(JSON.parse(calls[1].options.body).operation,args[0]);
  assert.equal(calls[1].options.headers.authorization,undefined);
 }
});
test('拒绝缺参、实例错误、不可用 Host 与越权',async()=>{
 await assert.rejects(queryCatalog(['actions']),/provider is required/);
 await assert.rejects(queryCatalog(['call']),/Usage/);
 await assert.rejects(queryCatalog(['providers'],{fetchImpl:async()=>{throw new Error('offline');}}),/HOST_NOT_CONNECTED/);
 await assert.rejects(queryCatalog(['providers'],{instance:'other',fetchImpl:async()=>new Response(JSON.stringify(identity))}),/INSTANCE_MISMATCH/);
 await assert.rejects(queryCatalog(['providers'],{fetchImpl:async()=>new Response(JSON.stringify({error:{code:'HOST_ACCOUNT_REQUIRED'}}),{status:401})}),/HOST_ACCOUNT_REQUIRED/);
});
