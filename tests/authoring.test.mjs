// 本地构建测试不连接开发者的真实账号，连接协议由独立测试覆盖。
process.env.FLOATBOAT_HOST_MODE = 'offline';
// ABOUTME: 验证外部创作到真实运行和归档的链路，不使用 Desktop 或替身数据库。
import assert from 'node:assert/strict';
import { test, before } from 'node:test';
import { cp, mkdir, mkdtemp, readFile, readdir, writeFile, rm, access, symlink } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { application, repository, prepareTools, checkApplication } from '../tooling/build.mjs';
import { initializeApplication } from '../tooling/cli.mjs';
import { startPreview } from '../tooling/preview.mjs';
import { exportApplication } from '../tooling/package.mjs';

before(prepareTools);

test('WASM 同源资源可流式执行，源码包保留模块且不携带 SDK', async (t) => {
  const { directory, root, manifest } = await fixture(t);
  const wasm = Buffer.from('0061736d010000000105016000017f03020100070a0106616e7377657200000a06010400412a0b', 'hex');
  await writeFile(join(root, 'src/ui/answer.wasm'), wasm);
  await writeFile(join(root, 'src/ui/main.tsx'), `
const url = new URL('./answer.wasm', import.meta.url);
void WebAssembly.instantiateStreaming(fetch(url)).then(({ instance }) => {
  document.body.textContent = String((instance.exports.answer as () => number)());
});
`);
  await mkdir(join(root, 'public'));
  await writeFile(join(root, 'public/dictionary.json'), '{"test":42}');
  manifest.build.staticAssets = [{ source: 'public', target: 'vendor' }];
  manifest.browser = { blobWorkers: true, crossOriginIsolated: true, connectOrigins: ['https://api.example.com'] };
  await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest));
  await writeFile(join(root, 'src/ui/worker.ts'), 'export {}; self.postMessage(42);');
  const main = join(root, 'src/ui/main.tsx');
  await writeFile(main, (await readFile(main, 'utf8')) + "\nnew Worker(new URL('./worker.ts', import.meta.url), {type:'module'});\n");
  await checkApplication(root);
  assert.equal(await readFile(join(root, 'dist/ui/vendor/dictionary.json'), 'utf8'), '{"test":42}');
  assert.ok((await readdir(join(root, 'dist/ui/assets'))).some((name) => name.startsWith('worker-')));
  const assets = join(root, 'dist/ui/assets');
  const module = (await readdir(assets)).find((name) => name.endsWith('.wasm'));
  assert.ok(module, 'WASM 不应被内联为 data URL');
  assert.deepEqual(await readFile(join(assets, module)), wasm);
  const preview = await startPreview(root);
  try {
    const policy = (await fetch(preview.url)).headers.get('content-security-policy');
    assert.ok(policy.includes("script-src 'self' 'wasm-unsafe-eval';"));
    assert.ok(!policy.includes("'unsafe-eval'"));
    assert.ok(policy.includes("connect-src 'self' https://api.example.com;"));
    const response = await fetch(`${preview.url}/assets/${module}`);
    assert.equal(response.headers.get('content-type'), 'application/wasm');
    const { instance } = await WebAssembly.instantiateStreaming(response);
    assert.equal(instance.exports.answer(), 42);
  } finally {
    await preview.stop();
  }
  const destination = join(directory, 'wasm.fbworkbench');
  await exportApplication(destination, root);
  const { unpackWorkbench } = await import('../.generated/archive.mjs');
  const unpacked = join(directory, 'unpacked');
  await unpackWorkbench(destination, unpacked);
  assert.deepEqual(await readFile(join(unpacked, 'application/src/ui/answer.wasm')), wasm);
  await assert.rejects(access(join(unpacked, 'application/sdk')));
  const unpackedManifest = JSON.parse(await readFile(join(unpacked, 'application/manifest.json'), 'utf8'));
  assert.deepEqual(unpackedManifest.browser, manifest.browser);
  assert.equal(await readFile(join(unpacked, 'application/public/dictionary.json'), 'utf8'), '{"test":42}');
});

test('跨空间 SDK 类型通过真实编译，workspaces 声明随源包交付', async (t) => {
  const { directory, root, manifest } = await fixture(t);
  manifest.capabilities = ['workspaces', 'workflows'];
  await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest));
  await writeFile(join(root, 'src/server/workspaces.ts'), `
import type { HostClient, WorkspaceSummary, WorkflowRun } from '../../sdk/host.mjs';
export async function startInAccount(host: HostClient, key: string): Promise<WorkflowRun> {
  const result = await host.workspaces.create({ name: 'Account B', browserIdentity: 'isolated', idempotencyKey: key });
  const workspace: WorkspaceSummary = result.workspace;
  await host.workspaces.openUrl({ workspaceId: workspace.id, url: 'https://example.com/login', idempotencyKey: key + ':login' });
  const started = await host.workflows.start({ dependency: 'verify', workspaceId: workspace.id, idempotencyKey: key + ':run' });
  const page = await host.workflows.list({ workspaceId: workspace.id, status: 'succeeded', cursor: 'cursor', limit: 10 });
  const cursor: string | null = page.nextCursor;
  void cursor;
  return host.workflows.get({ runId: started.runId });
}
`);
  const destination = join(directory, 'workspaces.fbworkbench');
  await exportApplication(destination, root);
  const { unpackWorkbench } = await import('../.generated/archive.mjs');
  const unpacked = join(directory, 'unpacked');
  await unpackWorkbench(destination, unpacked);
  const imported = JSON.parse(await readFile(join(unpacked, 'application/manifest.json'), 'utf8'));
  assert.deepEqual(imported.capabilities, ['workspaces', 'workflows']);
  assert.match(await readFile(join(unpacked, 'application/src/server/workspaces.ts'), 'utf8'), /workspaceId: workspace.id/);
  await assert.rejects(access(join(unpacked, 'application/sdk')));
});

test('Connector 声明可随包交付，个人 connectionId 被 manifest 校验拒绝', async (t) => {
  const { directory, root, manifest } = await fixture(t);
  manifest.capabilities = ['connected-services'];
  manifest.connectedServices = [{ id: 'mail', provider: 'connector:gmail' }];
  await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest));
  const destination = join(directory, 'connector.fbworkbench');
  await exportApplication(destination, root);
  const { unpackWorkbench } = await import('../.generated/archive.mjs');
  const unpacked = join(directory, 'unpacked');
  await unpackWorkbench(destination, unpacked);
  const imported = JSON.parse(await readFile(join(unpacked, 'application/manifest.json'), 'utf8'));
  assert.deepEqual(imported.connectedServices, manifest.connectedServices);
  manifest.connectedServices[0].connectionId = 'personal-account';
  await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest));
  await assert.rejects(checkApplication(root), /connectionId/);
});

test('声明的固定资源与 Workflow 随包交付，业务资源只保留声明，本机绑定缺失阻止导出', async (t) => {
  const { directory, root, manifest } = await fixture(t);
  await mkdir(join(root, 'templates'));
  await writeFile(join(root, 'templates/report.txt'), 'portable asset');
  await mkdir(join(root, 'dependencies'));
  await writeFile(join(root, 'dependencies/extract.workflow.js'), 'export const meta = { name: "extract" };');
  manifest.resources = [
    { id: 'templates', role: 'asset', location: 'project', kind: 'directory', path: 'templates' },
    { id: 'files', role: 'data', location: 'data', kind: 'directory', path: 'files', access: 'read-write' },
  ];
  manifest.dependencies = [{ id: 'extract', kind: 'workflow', source: { type: 'bundle', path: 'dependencies/extract.workflow.js' } }];
  await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest));
  const destination = join(directory, 'resources.fbworkbench');
  await exportApplication(destination, root);
  const { unpackWorkbench } = await import('../.generated/archive.mjs');
  const { validateWorkbenchAssetTransfer } = await import('../.generated/assets.mjs');
  const unpacked = join(directory, 'unpacked');
  const archive = await unpackWorkbench(destination, unpacked);
  assert.equal(archive.formatVersion, 2);
  const imported = JSON.parse(await readFile(join(unpacked, 'application/manifest.json'), 'utf8'));
  const lock = await validateWorkbenchAssetTransfer(unpacked, imported);
  assert.equal(lock.dependencies[0].status, 'bundled');
  assert.equal(lock.resources[1].status, 'excluded');
  assert.equal(await readFile(join(unpacked, 'application', imported.resources[0].path, 'report.txt'), 'utf8'), 'portable asset');
  assert.ok(!JSON.stringify(lock).includes(root));
  manifest.dependencies[0].source = { type: 'binding' };
  await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest));
  await assert.rejects(exportApplication(join(directory, 'missing.fbworkbench'), root), /WORKBENCH_DEPENDENCY_UNBOUND/);
});

async function fixture(t) {
  const local = join(repository, '.local');
  await mkdir(local, { recursive: true });
  const directory = await mkdtemp(join(local, 'test-'));
  const root = join(directory, 'app');
  await cp(application, root, { recursive: true, filter: (path) => !['node_modules', 'sdk', 'dist', '.workbench-vite'].includes(basename(path)) });
  const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
  manifest.appId = `workbench.test-${randomUUID()}`;
  await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest));
  t.after(async () => {
    await rm(directory, { recursive: true, force: true });
    await rm(join(local, 'data', manifest.appId), { recursive: true, force: true });
  });
  return { directory, root, manifest };
}

test('初始化独立名称，拒绝非法上架标识及重复覆盖', async (t) => {
  const { root, manifest } = await fixture(t);
  manifest.appId = 'workbench.starter';
  await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest));
  await assert.rejects(initializeApplication({ registry: '中文', name: '项目', description: '项目管理' }, root));
  const result = await initializeApplication({ registry: 'deal-tracker', name: '项目管理', description: '跟进项目进度' }, root);
  assert.equal(result.registryName, 'deal-tracker');
  assert.equal(result.name, '项目管理');
  assert.notEqual(result.appId, manifest.appId);
  const before = await readFile(join(root, 'manifest.json'), 'utf8');
  await assert.rejects(initializeApplication({ registry: 'different', name: 'Other', description: 'Other' }, root), /ALREADY_INITIALIZED/);
  assert.equal(await readFile(join(root, 'manifest.json'), 'utf8'), before);
});

test('校验 manifest 并拒绝源码链接，失败不产生导出包', async (t) => {
  const { directory, root, manifest } = await fixture(t);
  manifest.sdkVersion = '99.0.0';
  await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest));
  const destination = join(directory, 'invalid.fbworkbench');
  await assert.rejects(exportApplication(destination, root), /1.0.0/);
  await assert.rejects(access(destination));
  manifest.sdkVersion = '1.0.0';
  await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest));
  await symlink(join(root, 'manifest.json'), join(root, 'src', 'linked.json'));
  await assert.rejects(checkApplication(root), /SOURCE_SYMLINK_UNSUPPORTED/);
});

test('类型错误和浏览器越界导入保持阻断', async (t) => {
  const { root } = await fixture(t);
  const path = join(root, 'src/ui/invalid.ts');
  let diagnostics = [];
  await writeFile(path, 'export const value: string = 42;');
  await assert.rejects(checkApplication(root, (issue) => diagnostics.push(issue)), /WORKBENCH_CHECK_FAILED/);
  assert.ok(diagnostics.some((issue) => issue.code === 'TS2322'));
  diagnostics = [];
  await writeFile(path, "export { readFile } from 'node:fs/promises';");
  await assert.rejects(checkApplication(root, (issue) => diagnostics.push(issue)), /WORKBENCH_CHECK_FAILED/);
  assert.ok(diagnostics.some((issue) => issue.code === 'WORKBENCH_BROWSER_SERVER_IMPORT'));
});

test('独立无凭据 HTTP、平台未连接、Origin 校验、SQLite 持久化和退出清理', async (t) => {
  const { root } = await fixture(t);
  await writeFile(join(root, 'migrations/0002_test.sql'), 'CREATE TABLE preview_notes (text TEXT NOT NULL);');
  const entry = join(root, 'src/server/index.ts');
  await writeFile(entry, (await readFile(entry, 'utf8')).replace('await app.listen();', `
app.route('POST', '/api/notes', ({ database }) => { database.prepare('INSERT INTO preview_notes(text) VALUES (?)').run('persisted'); return { saved: true }; });
app.route('GET', '/api/notes', ({ database }) => database.prepare('SELECT text FROM preview_notes').all());
app.route('GET', '/api/platform-probe', ({ host }) => host.capabilities.list());
await app.listen();`));
  await checkApplication(root);
  let preview = await startPreview(root);
  t.after(() => preview.stop());
  await assert.rejects(access(preview.configPath));
  assert.equal(new URL(preview.url).hostname, '127.0.0.1');
  const headers = {};
  assert.equal((await fetch(`${preview.url}/api/app`)).status, 200);
  assert.equal((await fetch(`${preview.url}/api/app`, { headers: { ...headers, origin: 'https://example.com' } })).status, 403);
  assert.equal((await (await fetch(`${preview.url}/api/app`, { headers })).json()).platform, 'not-connected');
  assert.equal((await (await fetch(`${preview.url}/api/platform-probe`, { headers })).json()).error.code, 'HOST_NOT_CONNECTED');
  assert.equal((await (await fetch(`${preview.url}/api/notes`, { method: 'POST', headers })).json()).saved, true);
  await assert.rejects(startPreview(root), /WORKBENCH_DATA_IN_USE/);
  const previous = preview;
  await preview.stop();
  await assert.rejects(access(previous.configPath));
  await assert.rejects(fetch(`${previous.url}/api/app`));
  preview = await startPreview(root);
  assert.equal(preview.config.pageToken, undefined);
  assert.equal(new URL(preview.browserUrl).hash, '');
  assert.deepEqual(await (await fetch(`${preview.url}/api/notes`, { headers })).json(), [{ text: 'persisted' }]);
});

test('源码包可验证读取，预览数据、工具链和运行产物不进入包，已有文件不覆盖', async (t) => {
  const { directory, root, manifest } = await fixture(t);
  const destination = join(directory, 'valid.fbworkbench');
  await writeFile(join(root, '.env'), 'TEST_ONLY=value');
  const packed = await exportApplication(destination, root);
  const { unpackWorkbench } = await import('../.generated/archive.mjs');
  const unpacked = join(directory, 'unpacked');
  assert.deepEqual(await unpackWorkbench(destination, unpacked), packed);
  assert.equal(packed.sourceAppId, manifest.appId);
  assert.ok(packed.files.every((file) => file.path.startsWith('application/')));
  assert.ok(packed.files.every((file) => !/\/(?:sdk|dist|node_modules|\.local|\.env|tooling)(?:\/|$)/.test(file.path)));
  assert.equal(await readFile(join(unpacked, 'application/src/server/index.ts'), 'utf8'), await readFile(join(root, 'src/server/index.ts'), 'utf8'));
  const original = await readFile(destination);
  await assert.rejects(exportApplication(destination, root), /EEXIST/);
  assert.deepEqual(await readFile(destination), original);
});

test('外部固定资源与显式业务数据打包，rebind 不复制且本机路径不泄露', async (t) => {
  const { directory, root, manifest } = await fixture(t);
  const external = join(directory, 'external');
  const dataDirectory = join(repository, '.local/data', manifest.appId);
  await mkdir(external);
  await mkdir(join(dataDirectory, 'files'), { recursive: true });
  await writeFile(join(external, 'template.txt'), 'fixed');
  await writeFile(join(external, 'record.txt'), 'business');
  await writeFile(join(dataDirectory, 'files/note.txt'), 'managed');
  manifest.resources = [
    { id: 'template', role: 'asset', location: 'external', kind: 'file' },
    { id: 'records', role: 'data', location: 'external', kind: 'file' },
    { id: 'files', role: 'data', location: 'data', path: 'files', kind: 'directory' },
    { id: 'drive', role: 'data', location: 'external', kind: 'directory', transfer: 'rebind' },
  ];
  await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest));
  const bindings = { resources: { template: join(external, 'template.txt'), records: join(external, 'record.txt'), drive: external } };
  const { unpackWorkbench } = await import('../.generated/archive.mjs');
  const { validateWorkbenchAssetTransfer } = await import('../.generated/assets.mjs');
  for (const includeData of [false, true]) {
    const output = join(directory, `external-${includeData}.fbworkbench`);
    const info = await exportApplication(output, root, { bindings, includeData });
    assert.equal(info.kind, includeData ? 'migration' : 'application');
    const unpacked = join(directory, `unpacked-${includeData}`);
    await unpackWorkbench(output, unpacked);
    const imported = JSON.parse(await readFile(join(unpacked, 'application/manifest.json'), 'utf8'));
    const lock = await validateWorkbenchAssetTransfer(unpacked, imported);
    assert.deepEqual(lock.resources.map((entry) => entry.status), ['bundled', includeData ? 'bundled' : 'excluded', includeData ? 'bundled' : 'excluded', 'rebind']);
    assert.ok(!JSON.stringify(lock).includes(directory));
    assert.ok(!JSON.stringify(imported).includes(directory));
    const fixed = lock.resources[0];
    assert.equal(await readFile(join(unpacked, fixed.directory, 'file'), 'utf8'), 'fixed');
    if (includeData) {
      assert.equal(await readFile(join(unpacked, 'data/files/note.txt'), 'utf8'), 'managed');
      assert.equal(JSON.parse(await readFile(join(unpacked, 'operation-history.json'), 'utf8')).coverage, 'unknown');
      const { validateSnapshot } = await import('../.generated/data-snapshot.mjs');
      await validateSnapshot(unpacked);
    }
  }
  await assert.rejects(exportApplication(join(directory, 'bad.fbworkbench'), root, { bindings: { resources: { typo: external } } }), /BINDING/);
});

test('带数据导出备份真实 SQLite，拒绝活动写入及外部链接，失败不留下包', async (t) => {
  const { directory, root, manifest } = await fixture(t);
  const data = join(repository, '.local/data', manifest.appId);
  await mkdir(data, { recursive: true });
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(join(data, 'data.sqlite'));
  db.exec("PRAGMA journal_mode=WAL; CREATE TABLE _workbench_migrations(name TEXT, hash TEXT); CREATE TABLE notes(value TEXT); INSERT INTO notes VALUES ('retained');");
  const { acquireWorkbenchDataLock } = await import('../.generated/sdk/data-lock.mjs');
  const release = await acquireWorkbenchDataLock(data, manifest.appId);
  const output = join(directory, 'data.fbworkbench');
  try { await assert.rejects(exportApplication(output, root, { includeData: true }), /WORKBENCH_DATA_IN_USE/); }
  finally { await release(); db.close(); }
  await assert.rejects(access(output));
  await exportApplication(output, root, { includeData: true });
  const { unpackWorkbench } = await import('../.generated/archive.mjs');
  const unpacked = join(directory, 'database-unpacked');
  await unpackWorkbench(output, unpacked);
  const { validateSnapshot } = await import('../.generated/data-snapshot.mjs');
  await validateSnapshot(unpacked);
  const restored = new DatabaseSync(join(unpacked, 'data/data.sqlite'), { readOnly: true });
  try { assert.equal(restored.prepare('SELECT value FROM notes').get().value, 'retained'); }
  finally { restored.close(); }
  manifest.resources = [{ id: 'outside', kind: 'file', role: 'asset', location: 'external' }];
  await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest));
  const link = join(directory, 'link');
  await symlink(join(root, 'manifest.json'), link);
  await assert.rejects(exportApplication(join(directory, 'link.fbworkbench'), root, { bindings: { resources: { outside: link } } }), /SYMLINK/);
  await assert.rejects(access(join(directory, 'link.fbworkbench')));
  await assert.rejects(exportApplication(join(directory, 'relative.fbworkbench'), root, { bindings: { resources: { outside: 'relative.txt' } } }), /BINDING/);
});
