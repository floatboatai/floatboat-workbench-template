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
    await assert.rejects(createHostClient({ url, token: 'host-scope' }).llm.generateText({ prompt: 'test' }), { code: 'HOST_ENDPOINT_INVALID' });
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
    await assert.rejects(createHostClient({ url: `http://127.0.0.1:${host.address().port}`, token: 'host-scope' }).llm.generateText({ prompt: 'test' }), { code: 'HOST_TRANSPORT_FAILED' });
    assert.equal(upstreamRequests, 0);
  } finally {
    await Promise.all([host, upstream].map((server) => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); })));
  }
});
