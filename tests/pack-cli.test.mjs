// ABOUTME: 在隔离模板副本中验证 CLI 参数、数据选择及交付归档，不读取开发者实际数据。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { repository } from '../tooling/build.mjs';

const exec = promisify(execFile);
test('package CLI 通过 bindings 与 include-data 交付完整快照，默认排除业务文件', async (t) => {
  const root = await mkdtemp(join(repository, '.local/cli-export-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const name of ['app', 'sdk', 'tooling']) await cp(join(repository, name), join(root, name), {
    recursive: true, filter: (path) => !['node_modules', 'dist', '.workbench-vite'].includes(basename(path)),
  });
  // 编译器只允许读取本副本工具链；保持 pnpm 内部相对链接，不链接到副本外的工具链。
  await cp(join(repository, 'node_modules'), join(root, 'node_modules'), { recursive: true, verbatimSymlinks: true });
  const manifestFile = join(root, 'app/manifest.json');
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  manifest.appId = 'workbench.cli-export';
  manifest.resources = [
    { id: 'constructor', kind: 'file', location: 'external', role: 'asset', required: false },
    { id: 'local-template', kind: 'file', location: 'project', role: 'asset', path: 'templates/report.txt' },
    { id: 'template', kind: 'file', location: 'external', role: 'asset' },
    { id: 'contracts', kind: 'directory', location: 'external', role: 'data' },
    { id: 'drive', kind: 'directory', location: 'external', role: 'data', transfer: 'rebind' },
  ];
  manifest.dependencies = [{ id: 'extract', kind: 'workflow', source: { type: 'bundle', path: 'dependencies/extract.workflow.js' } }];
  await mkdir(join(root, 'app/templates'));
  await mkdir(join(root, 'app/dependencies'));
  await writeFile(join(root, 'app/templates/report.txt'), 'local fixed');
  await writeFile(join(root, 'app/dependencies/extract.workflow.js'), 'export const meta = { name: \"extract\" };');
  await writeFile(manifestFile, JSON.stringify(manifest));
  const outside = join(root, 'outside');
  await mkdir(outside);
  await writeFile(join(outside, 'template.txt'), 'fixed');
  await mkdir(join(outside, 'contracts'));
  await writeFile(join(outside, 'contracts/customer.txt'), 'business');
  await writeFile(join(outside, 'contracts/.env'), 'must-not-export');
  await mkdir(join(root, '.local/data', manifest.appId), { recursive: true });
  await writeFile(join(root, '.local/data', manifest.appId, 'managed.txt'), 'managed');
  await writeFile(join(root, '.local/bindings.json'), JSON.stringify({ resources: {
    template: join(outside, 'template.txt'), contracts: join(outside, 'contracts'), drive: join(root, 'nonexistent'),
  } }));
  for (const includeData of [false, true]) {
    const output = join(root, `${includeData ? 'migration' : 'application'}.fbworkbench`);
    const result = await exec(process.execPath, ['tooling/cli.mjs', 'pack', '--bindings', '.local/bindings.json',
      ...(includeData ? ['--include-data'] : []), '--output', output], { cwd: root, timeout: 60000 });
    assert.match(result.stdout, new RegExp(`business data ${includeData ? 'included' : 'excluded'}`));
    const { unpackWorkbench } = await import(pathToFileURL(join(root, '.generated/archive.mjs')));
    const unpacked = join(root, `unpacked-${includeData}`);
    const archive = await unpackWorkbench(output, unpacked);
    assert.equal(archive.kind, includeData ? 'migration' : 'application');
    assert.equal(archive.files.some((file) => file.path === 'data/managed.txt'), includeData);
    assert.equal(archive.files.some((file) => file.path === 'resource-data/contracts/customer.txt'), includeData);
    assert.ok(archive.files.every((file) => !file.path.endsWith('/.env')));
    const { validateWorkbenchAssetTransfer } = await import(pathToFileURL(join(root, '.generated/assets.mjs')));
    const imported = JSON.parse(await readFile(join(unpacked, 'application/manifest.json'), 'utf8'));
    const lock = await validateWorkbenchAssetTransfer(unpacked, imported);
    assert.equal(lock.resources.find((item) => item.id === 'drive').status, 'rebind');
    assert.equal(lock.resources.find((item) => item.id === 'constructor').status, 'missing');
    assert.equal(lock.dependencies[0].status, 'bundled');
    const localResource = imported.resources.find((item) => item.id === 'local-template');
    assert.equal(await readFile(join(unpacked, 'application', localResource.path), 'utf8'), 'local fixed');
    assert.match(await readFile(join(unpacked, 'application', imported.dependencies[0].source.path), 'utf8'), /extract/);
    assert.ok(!JSON.stringify(lock).includes(outside));
    if (process.env.WORKBENCH_EXPORT_EVIDENCE_DIRECTORY) {
      await mkdir(process.env.WORKBENCH_EXPORT_EVIDENCE_DIRECTORY, { recursive: true });
      await cp(output, join(process.env.WORKBENCH_EXPORT_EVIDENCE_DIRECTORY, basename(output)));
    }
  }
  assert.equal(await readFile(join(outside, 'contracts/customer.txt'), 'utf8'), 'business');
  await assert.rejects(exec(process.execPath, ['tooling/cli.mjs', 'check', '--include-data'], { cwd: root }), /EXPORT_OPTIONS_REQUIRE_PACK/);
});
