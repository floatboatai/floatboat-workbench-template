// ABOUTME: 验证外部创作到真实运行和归档的链路，不使用 Desktop 或替身数据库。
import assert from 'node:assert/strict';
import { test, before } from 'node:test';
import { cp, mkdir, mkdtemp, readFile, writeFile, rm, access, symlink } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { application, repository, prepareTools, checkApplication } from '../tooling/build.mjs';
import { initializeApplication } from '../tooling/cli.mjs';
import { startPreview } from '../tooling/preview.mjs';
import { exportApplication } from '../tooling/package.mjs';

before(prepareTools);

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

test('独立 HTTP、平台未连接、页面鉴权、SQLite 持久化和退出清理', async (t) => {
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
  let headers = { 'x-workbench-page-token': preview.config.pageToken };
  assert.equal((await fetch(`${preview.url}/api/app`)).status, 401);
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
  headers = { 'x-workbench-page-token': preview.config.pageToken };
  assert.notEqual(preview.config.pageToken, previous.config.pageToken);
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
