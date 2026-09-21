// 本地构建测试不连接开发者的真实账号，连接协议由独立测试覆盖。
process.env.FLOATBOAT_HOST_MODE = 'offline';
// ABOUTME: 使用真实文件、HTTP 和数据库验证保存更新、失败恢复和停止边界。
import assert from 'node:assert/strict';
import { test, before } from 'node:test';
import { cp, mkdir, mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { get } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { application, repository, prepareTools } from '../tooling/build.mjs';
import { startLivePreview } from '../tooling/live-preview.mjs';

before(prepareTools);

test('首次校验失败会释放监听和临时快照', async (t) => {
  const local = join(repository, '.local');
  await mkdir(local, { recursive: true });
  const root = await mkdtemp(join(local, 'invalid-preview-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'manifest.json'), '{}');
  const before = (await readdir(local)).sort();
  await assert.rejects(startLivePreview(root));
  assert.deepEqual((await readdir(local)).sort(), before);
});

async function waitFor(check) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(100);
  }
  assert.fail('Preview condition timed out');
}

test(
  '保存自动更新、失败保留旧版本及数据、恢复后固定地址可用，停止不再启动',
  { timeout: 120000 },
  async (t) => {
    await mkdir(join(repository, '.local'), { recursive: true });
    const directory = await mkdtemp(join(repository, '.local/live-test-'));
    const root = join(directory, 'app');
    await cp(application, root, {
      recursive: true,
      filter: (path) =>
        !['node_modules', 'sdk', 'dist', '.workbench-vite'].includes(basename(path)),
    });
    const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
    manifest.appId = `workbench.test-${randomUUID()}`;
    await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest));
    const entry = join(root, 'src/server/index.ts');
    const original = await readFile(entry, 'utf8');
    const source = (version) =>
      original.replace(
        'await app.listen();',
        `
app.route('GET', '/api/version', () => ({ version: '${version}' }));
app.route('POST', '/api/notes', ({ database }) => { database.prepare('INSERT INTO notes(text) VALUES (?)').run('saved'); return { saved: true }; });
app.route('GET', '/api/notes', ({ database }) => database.prepare('SELECT text FROM notes').all());
let finishSlow: (() => void) | undefined;
app.route('POST', '/api/slow', async () => { await new Promise<void>((resolve) => { finishSlow = resolve; }); return { done: true }; });
app.route('POST', '/api/release', () => { finishSlow?.(); return { released: true }; });
await app.listen();`,
      );
    await writeFile(
      join(root, 'migrations/0002_notes.sql'),
      'CREATE TABLE notes (text TEXT NOT NULL);',
    );
    await writeFile(entry, source('one'));
    const messages = [];
    const preview = await startLivePreview(root, {
      onStatus: (state) => messages.push(state),
    });
    t.after(async () => {
      await preview.stop();
      await rm(directory, { recursive: true, force: true });
      await rm(join(repository, '.local/data', manifest.appId), {
        recursive: true,
        force: true,
      });
    });
    const headers = {};
    const status = async () => (await fetch(`${preview.url}/__preview/status`, { headers })).json();
    const api = async (path, method = 'GET') => {
      const current = await status();
      return (
        await fetch(`${current.url}${path}`, {
          method,
          headers: {},
        })
      ).json();
    };
    assert.equal((await fetch(`${preview.url}/__preview/status`)).status, 200);
    assert.equal(new URL(preview.browserUrl).hash, '');
    assert.equal(
      (
        await fetch(`${preview.url}/__preview/status`, {
          headers: { ...headers, origin: 'https://example.com' },
        })
      ).status,
      403,
    );
    assert.equal(
      await new Promise((resolve, reject) => {
        get(preview.url, { headers: { host: 'evil.example' } }, (response) => {
          response.resume();
          resolve(response.statusCode);
        }).on('error', reject);
      }),
      403,
    );
    assert.deepEqual(await api('/api/version'), { version: 'one' });
    await api('/api/notes', 'POST');
    const businessFile = join(repository, '.local/data', manifest.appId, 'report.txt');
    await writeFile(businessFile, 'user data');
    const initial = await status();
    await mkdir(join(root, 'dist'), { recursive: true });
    await writeFile(join(root, 'dist/ignored.txt'), 'ignored');
    await delay(800);
    assert.equal((await status()).revision, initial.revision);
    await writeFile(entry, `${source('broken')}\nconst invalid: string = 42;`);
    await waitFor(() => messages.at(-1)?.phase === 'failed');
    assert.equal((await status()).revision, initial.revision);
    assert.deepEqual(await api('/api/version'), { version: 'one' });
    const slow = api('/api/slow', 'POST');
    await writeFile(entry, source('two'));
    await waitFor(async () => (await status()).phase === 'waiting');
    assert.equal((await status()).revision, initial.revision);
    await api('/api/release', 'POST');
    assert.deepEqual(await slow, { done: true });
    await waitFor(async () => (await status()).revision > initial.revision);
    assert.deepEqual(await api('/api/version'), { version: 'two' });
    assert.deepEqual(await api('/api/notes'), [{ text: 'saved' }]);
    assert.equal(await readFile(businessFile, 'utf8'), 'user data');
    const second = (await status()).revision;
    // 候选启动先改变数据再失败，恢复必须同时还原数据库与旧服务。
    await writeFile(
      entry,
      source('bad').replace(
        'await app.listen();',
        "app.database.exec('DELETE FROM notes'); throw new Error('TEST_STARTUP_FAILURE');",
      ),
    );
    await waitFor(
      () =>
        messages.at(-1)?.phase === 'failed' &&
        messages.at(-1)?.message.includes('TEST_STARTUP_FAILURE'),
    );
    assert.ok((await status()).revision > second);
    assert.deepEqual(await api('/api/version'), { version: 'two' });
    assert.deepEqual(await api('/api/notes'), [{ text: 'saved' }]);
    await writeFile(entry, source('three'));
    await waitFor(async () => (await status()).phase === 'watching');
    assert.deepEqual(await api('/api/version'), { version: 'three' });
    await writeFile(entry, source('after-stop'));
    await waitFor(async () => (await status()).phase === 'building');
    await preview.stop();
    await preview.closed;
    await assert.rejects(fetch(preview.url));
  },
);
