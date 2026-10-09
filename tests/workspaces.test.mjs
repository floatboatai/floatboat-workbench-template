// ABOUTME: 验证生成 SDK 的跨空间 HTTP 契约、公开结果和失败传播，不模拟 Desktop 身份隔离。
import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { createServer } from 'node:http';
import { prepareTools } from '../tooling/build.mjs';

let createHostClient;
let workbenchManifestSchema;
before(async () => {
  await prepareTools();
  ({ createHostClient } = await import('../.generated/sdk/host.mjs'));
  ({ workbenchManifestSchema } = await import('../.generated/manifest.mjs'));
});

async function hostFixture(t, respond) {
  const calls = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    calls.push({ path: request.url, body, authorization: request.headers.authorization });
    const result = respond(body);
    if (result.events) {
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.end(result.events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''));
    } else {
      response.writeHead(result.status ?? 200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(result.error ? { error: result.error } : { data: result.data }));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const client = createHostClient({ url: `http://127.0.0.1:${server.address().port}` });
  return { client, calls };
}

test('工作空间方法经真实 HTTP 保留目标、独立身份、幂等键与导航回执', async t => {
  const workspace = { id: 'space-b', name: 'Account B', status: 'active' };
  const responses = {
    list: { workspaces: [workspace], nextCursor: 'spaces-page-2' },
    create: { workspace, created: true },
    activate: { workspaceId: workspace.id, displayed: true },
    openUrl: { workspaceId: workspace.id, tabId: 'login-b', displayed: true },
  };
  const { client, calls } = await hostFixture(t, body => ({ data: responses[body.operation] }));
  assert.deepEqual(await client.workspaces.list({ limit: 10, cursor: 'spaces-page-1' }), responses.list);
  const creation = { name: 'Account B', browserIdentity: 'isolated', idempotencyKey: 'account-b:create' };
  assert.deepEqual(await client.workspaces.create(creation, { requestId: 'request-create' }), responses.create);
  assert.deepEqual(await client.workspaces.activate({ workspaceId: workspace.id }), responses.activate);
  const navigation = { workspaceId: workspace.id, url: 'https://example.com/login', idempotencyKey: 'account-b:login' };
  assert.deepEqual(await client.workspaces.openUrl(navigation), responses.openUrl);
  await client.workspaces.openUrl(navigation);
  assert.deepEqual(calls.map(call => call.body), [
    { domain: 'workspaces', operation: 'list', input: { limit: 10, cursor: 'spaces-page-1' } },
    { domain: 'workspaces', operation: 'create', input: creation, requestId: 'request-create' },
    { domain: 'workspaces', operation: 'activate', input: { workspaceId: workspace.id } },
    { domain: 'workspaces', operation: 'openUrl', input: navigation },
    { domain: 'workspaces', operation: 'openUrl', input: navigation },
  ]);
  assert.ok(calls.every(call => call.path === '/v1/call' && call.authorization === undefined));
});

test('跨空间 Workflow 查询保留分页、来源和事件，省略目标不被 SDK 改写', async t => {
  const run = {
    id: 'run-b', workspaceId: 'space-b', source: { kind: 'workbench', workspaceId: 'space-a', appId: 'app-a' },
    workflowId: 'verify', status: 'succeeded', triggerType: 'manual', startedAt: 1, completedAt: 2,
    durationMs: 1, output: { account: 'account-b' }, safeError: null,
  };
  const { client, calls } = await hostFixture(t, body => {
    if (body.operation === 'events') return { events: [{ type: 'result', run }, { type: 'done' }] };
    if (body.operation === 'get') return { data: run };
    if (body.operation === 'list') return { data: { runs: [run], nextCursor: 'run-page-2' } };
    return { data: { runId: run.id, idempotencyKey: body.input.idempotencyKey } };
  });
  const start = { dependency: 'verify', workspaceId: 'space-b', input: { taskId: 'task-b' }, idempotencyKey: 'dispatch-b' };
  await client.workflows.start(start);
  const filters = { workspaceId: 'space-b', workflowId: 'verify', status: 'succeeded', cursor: 'run-page-1', limit: 10 };
  assert.deepEqual(await client.workflows.list(filters), { runs: [run], nextCursor: 'run-page-2' });
  assert.deepEqual(await client.workflows.get({ runId: run.id }), run);
  const events = [];
  for await (const event of client.workflows.events({ runId: run.id, afterSequence: 2 })) events.push(event);
  assert.deepEqual(events, [{ type: 'result', run }, { type: 'done' }]);
  await client.workflows.start({ dependency: 'verify', idempotencyKey: 'dispatch-default' });
  assert.deepEqual(calls[0].body.input, start);
  assert.deepEqual(calls[1].body.input, filters);
  assert.equal(calls[3].path, '/v1/events');
  assert.deepEqual(calls[3].body.input, { runId: run.id, afterSequence: 2 });
  assert.equal(Object.hasOwn(calls[4].body.input, 'workspaceId'), false);
});

test('导航未知结果与离线状态保持错误，不自动换键或重试', async t => {
  const { client, calls } = await hostFixture(t, () => ({
    status: 409, error: { code: 'WORKSPACE_UI_NOT_PRESENTED', execution: 'unknown', requestId: 'navigate-request' },
  }));
  await assert.rejects(client.workspaces.openUrl({ workspaceId: 'space-b', url: 'https://example.com', idempotencyKey: 'login' }),
    { code: 'WORKSPACE_UI_NOT_PRESENTED', execution: 'unknown', requestId: 'navigate-request' });
  assert.equal(calls.length, 1);
  const offline = createHostClient(null);
  await assert.rejects(offline.workspaces.list(), { code: 'HOST_NOT_CONNECTED' });
  await assert.rejects(offline.workspaces.create({ name: 'B', browserIdentity: 'isolated', idempotencyKey: 'create' }), { code: 'HOST_NOT_CONNECTED' });
  await assert.rejects(offline.workspaces.activate({ workspaceId: 'space-b' }), { code: 'HOST_NOT_CONNECTED' });
  await assert.rejects(offline.workspaces.openUrl({ workspaceId: 'space-b', url: 'https://example.com', idempotencyKey: 'open' }), { code: 'HOST_NOT_CONNECTED' });
});

test('manifest 接受完整八域但继续拒绝重复与未知能力', () => {
  const manifest = { schemaVersion: 1, appId: 'workbench.test', name: 'Test', version: '0.1.0', sdkVersion: '1.0.0',
    runtime: 'node22-sqlite-v1', server: 'dist/server/index.mjs', ui: 'dist/ui', migrations: 'migrations',
    capabilities: ['llm', 'agent', 'asr', 'workflows', 'connected-services', 'calendar', 'automation', 'workspaces'] };
  assert.deepEqual(workbenchManifestSchema.parse(manifest).capabilities, manifest.capabilities);
  assert.equal(workbenchManifestSchema.safeParse({ ...manifest, capabilities: ['workspaces', 'workspaces'] }).success, false);
  assert.equal(workbenchManifestSchema.safeParse({ ...manifest, capabilities: ['browser'] }).success, false);
});
