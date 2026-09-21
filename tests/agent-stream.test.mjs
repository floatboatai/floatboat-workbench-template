// ABOUTME: 分发 SDK 在真实 HTTP 断流后按游标续订，不重发任务或重复交付进度。
import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { prepareTools } from '../tooling/build.mjs';
let createHostClient;
before(async () => { await prepareTools(); ({ createHostClient } = await import('../.generated/sdk/host.mjs')); });

test('Agent 断流恢复保留上下文路径与游标，重放事件只交付一次', async () => {
  const calls = [];
  const event = (cursor) => ({ type: 'event', cursor, event: { type: 'text', text: String(cursor) } });
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    calls.push({ path: req.url, body: JSON.parse(Buffer.concat(chunks)), authorization: req.headers.authorization });
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const frames = calls.length === 1 ? [event(1)] : [event(1), event(2), { type: 'done' }];
    res.end(frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join(''));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const client = createHostClient({ url: `http://127.0.0.1:${server.address().port}/workbenches/test/generation` });
    const received = [];
    for await (const frame of client.agent.events({ runId: 'test-run' }, { timeoutMs: 5000 })) received.push(frame);
    assert.deepEqual(received.filter((frame) => frame.type === 'event').map((frame) => frame.cursor), [1, 2]);
    assert.equal(received.at(-1).type, 'done');
    assert.deepEqual(calls.map((call) => call.body.input.afterSequence), [0, 1]);
    assert.ok(calls.every((call) => call.path === '/workbenches/test/generation/v1/events' && call.body.operation === 'events' && call.authorization === undefined));
  } finally {
    await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
  }
});
