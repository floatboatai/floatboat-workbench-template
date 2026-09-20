// ABOUTME: 真实本地发现与心跳，不访问开发者正在运行的 Floatboat。
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { connectLocalHost } from "../tooling/host-connection.mjs";

test("客户端后启动、租约续期、重启重连和退出释放；只在 server 交换连接", async () => {
  const directory = await mkdtemp(join(tmpdir(), "floatboat-discovery-"));
  await chmod(directory, 0o700);
  let connects = 0,
    disconnects = 0;
  let failHeartbeat = false;
  const server = createServer(async (req, res) => {
    assert.equal(req.headers.authorization, `Bearer ${"a".repeat(64)}`);
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const input = JSON.parse(Buffer.concat(chunks));
    res.setHeader("content-type", "application/json");
    if (req.url === "/status") res.end('{"protocol":1}');
    else if (req.url === "/connect") {
      assert.equal(input.sourceDirectory, "/source");
      connects++;
      res.end(
        JSON.stringify({
          connection: { url, token: `scoped-${connects}` },
          lease: "b".repeat(64),
          resources: {},
        }),
      );
    } else if (req.url === "/disconnect") {
      disconnects++;
      res.end("{}");
    } else if (failHeartbeat) {
      failHeartbeat = false;
      res.statusCode = 401;
      res.end('{"error":{"code":"HOST_ACCOUNT_CHANGED"}}');
    } else res.end("{}");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const changes = [];
  const connector = await connectLocalHost(
    { sourceDirectory: "/source" },
    {
      directory,
      intervalMs: 15,
      onStatus() {},
      onChange: (value) => changes.push(value),
    },
  );
  try {
    assert.equal(connector.current(), null);
    const descriptor = {
      protocol: 1,
      instance: "test",
      url,
      token: "a".repeat(64),
    };
    await writeFile(join(directory, "test.json"), JSON.stringify(descriptor), {
      mode: 0o600,
    });
    for (let i = 0; i < 300 && connector.current()?.connection.token !== 'scoped-1'; i++) await delay(15);
    assert.equal(connects, 1);
    assert.equal(connector.current().connection.token, "scoped-1");
    await delay(40);
    assert.equal(connects, 1);
    failHeartbeat = true;
    for (let i = 0; i < 300 && connector.current()?.connection.token !== 'scoped-2'; i++) await delay(15);
    assert.equal(connects, 2);
    assert.ok(changes.includes(null));
    assert.equal(connector.current().connection.token, "scoped-2");
  } finally {
    await connector.close();
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
    await rm(directory, { recursive: true, force: true });
  }
  assert.equal(disconnects, 2);
});

test("不使用可被其他用户读取的发现凭据", async () => {
  if (!process.getuid) return;
  const directory = await mkdtemp(join(tmpdir(), "floatboat-discovery-mode-"));
  const statuses = [];
  await chmod(directory, 0o755);
  const connector = await connectLocalHost(
    {},
    {
      directory,
      intervalMs: 10000,
      onStatus: (status) => statuses.push(status),
    },
  );
  try {
    assert.equal(connector.current(), null);
    assert.ok(statuses.includes("HOST_DISCOVERY_PERMISSIONS_INVALID"));
  } finally {
    await connector.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('多个客户端需要选定实例，不自动选用其他账号', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'floatboat-multiple-'));
  await chmod(directory, 0o700);
  let connects = 0;
  const server = createServer((req, res) => {
    req.resume();
    res.setHeader('content-type', 'application/json');
    if (req.url === '/connect') connects++;
    res.end('{"protocol":1}');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  for (const instance of ['first', 'second']) await writeFile(join(directory, `${instance}.json`), JSON.stringify({
    protocol: 1, instance, url, token: 'a'.repeat(64),
  }), { mode: 0o600 });
  const statuses = [];
  const connection = await connectLocalHost({}, { directory, intervalMs: 10000, onStatus: (value) => statuses.push(value) });
  try {
    assert.equal(connection.current(), null);
    assert.ok(statuses.some((value) => value.startsWith('HOST_INSTANCE_REQUIRED')));
    assert.equal(connects, 0);
  } finally {
    await connection.close();
    await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    await rm(directory, { recursive: true, force: true });
  }
});
