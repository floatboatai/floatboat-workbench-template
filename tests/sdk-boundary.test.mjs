// ABOUTME: 分发 SDK 只访问本机 Host，拒绝直接供应商地址及 HTTP 重定向。
import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { prepareTools } from '../tooling/build.mjs';
let createHostClient;
before(async () => { await prepareTools(); ({ createHostClient } = await import('../.generated/sdk/host.mjs')); });

test('远端地址在发起网络请求前被拒绝', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', () => { throw new Error('unexpected upstream request'); });
  for (const url of ['https://api.example.com', 'http://upstream.example.com', 'http://localhost:3001', 'http://user:secret@127.0.0.1:3001']) {
    await assert.rejects(createHostClient({ url }).llm.generateText({ prompt: 'test' }), { code: 'HOST_ENDPOINT_INVALID' });
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test('Host 响应不能让 SDK 跟随重定向连接其他服务', async () => {
  let upstreamRequests = 0;
  const upstream = createServer((_req, res) => { upstreamRequests++; res.end('{}'); });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const host = createServer((_req, res) => { res.writeHead(307, { location: `http://127.0.0.1:${upstream.address().port}/provider` }); res.end(); });
  await new Promise((resolve) => host.listen(0, '127.0.0.1', resolve));
  try {
    await assert.rejects(createHostClient({ url: `http://127.0.0.1:${host.address().port}` }).llm.generateText({ prompt: 'test' }), { code: 'HOST_TRANSPORT_FAILED' });
    assert.equal(upstreamRequests, 0);
  } finally {
    await Promise.all([host, upstream].map((server) => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); })));
  }
});

test('llm 调用未指定模型时使用 DEFAULT_LLM_MODEL，显式模型保持不变', async () => {
  const { DEFAULT_LLM_MODEL } = await import('../.generated/sdk/host.mjs');
  assert.equal(DEFAULT_LLM_MODEL, 'gemini-3.8-flash');
  const bodies = [];
  const host = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk)).on('end', () => {
      bodies.push(JSON.parse(body));
      res.writeHead(503, { 'content-type': 'application/json' }).end('{"error":{"code":"HOST_UNAVAILABLE"}}');
    });
  });
  await new Promise((resolve) => host.listen(0, '127.0.0.1', resolve));
  try {
    const { llm } = createHostClient({ url: `http://127.0.0.1:${host.address().port}` });
    await llm.generateText({ prompt: 'a' }).catch(() => {});
    await llm.generateObject({ prompt: 'b', schema: { type: 'object' } }).catch(() => {});
    await llm.generateText({ prompt: 'c', model: 'deepseek-flash' }).catch(() => {});
    const models = bodies.map((body) => JSON.stringify(body).match(/"model":"([^"]+)"/)?.[1]);
    assert.deepEqual(models, [DEFAULT_LLM_MODEL, DEFAULT_LLM_MODEL, 'deepseek-flash']);
  } finally {
    await new Promise((resolve) => { host.close(resolve); host.closeAllConnections(); });
  }
});
