// ABOUTME: 运行包离开模板与 node_modules 后仍能启动，源码导出保持原协议。
import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fork } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { application, repository, prepareTools } from '../tooling/build.mjs';
import { exportApplication } from '../tooling/package.mjs';

before(prepareTools);
test('仅运行包脱离模板依赖后提供 HTTP 与 WASM，且不含源码、source map 或业务数据', async (t) => {
  await mkdir(join(repository, '.local'), { recursive: true });
  const directory = await mkdtemp(join(repository, '.local/runtime-test-'));
  const installed = await mkdtemp(join(tmpdir(), 'standalone-runtime-'));
  let child;
  t.after(async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      const stopped = once(child, 'exit');
      child.kill();
      await stopped;
    }
    await rm(directory, { recursive: true, force: true });
    await rm(installed, { recursive: true, force: true });
  });
  const root = join(directory, 'app');
  await cp(application, root, {
    recursive: true,
    filter: (path) => !['dist', 'sdk', 'node_modules', '.workbench-vite'].includes(basename(path)),
  });
  await mkdir(join(root, 'src/sdk'));
  await writeFile(join(root, 'src/sdk/constants.ts'), 'export const businessValue = 42;');
  const serverFile = join(root, 'src/server/index.ts');
  const server = await readFile(serverFile, 'utf8');
  await writeFile(
    serverFile,
    `import { createElement } from 'react';
import { basename } from 'node:path';
` +
      server.replace(
        'await app.listen();',
        `app.route('GET', '/api/proof', () => ({ result: basename('/private/proof'), element: createElement('div').type }));
await app.listen();`,
      ),
  );
  const metadata = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
  metadata.resources = [
    { id: 'template', kind: 'file', location: 'project', role: 'asset', path: 'templates/proof.txt' },
  ];
  metadata.dependencies = [
    { id: 'extract', kind: 'workflow', source: { type: 'bundle', path: 'dependencies/extract.workflow.js' } },
  ];
  await mkdir(join(root, 'templates'));
  await mkdir(join(root, 'dependencies'));
  await writeFile(join(root, 'templates/proof.txt'), 'fixed resource');
  await writeFile(join(root, 'dependencies/extract.workflow.js'), 'export const meta = {name:"extract"};');
  await writeFile(join(root, 'manifest.json'), JSON.stringify(metadata));
  const wasm = Buffer.from(
    '0061736d010000000105016000017f03020100070a0106616e7377657200000a06010400412a0b',
    'hex',
  );
  await writeFile(join(root, 'src/ui/answer.wasm'), wasm);
  const main = join(root, 'src/ui/main.tsx');
  await writeFile(
    main,
    (await readFile(main, 'utf8')) +
      `\ndocument.body.dataset.wasm = new URL('./answer.wasm', import.meta.url).href;`,
  );
  await writeFile(join(root, '.env'), 'SECRET=do-not-export');
  await writeFile(join(root, 'LICENSE.txt'), 'Author license notice');
  await writeFile(join(root, 'THIRD_PARTY_NOTICES.txt'), 'Author supplied attribution');
  const destination = join(directory, 'runtime.fbworkbench');
  const archive = await exportApplication(destination, root, { runtime: true });
  assert.equal(archive.formatVersion, 3);
  assert.equal(archive.runtimeArtifact.sourceAccess, 'restricted');
  assert.equal(archive.runtimeArtifact.protection, 'business-compatible-v1');
  const sourceArchive = await exportApplication(join(directory, 'source.fbworkbench'), root);
  const sourceFiles = sourceArchive.files
    .filter((file) => file.path.startsWith('application/'))
    .map((file) => ({ ...file, path: file.path.slice('application/'.length) }));
  sourceFiles.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
  const sourceHash = createHash('sha256')
    .update(JSON.stringify({ algorithm: 'workbench-source-tree-v1', files: sourceFiles }))
    .digest('hex');
  assert.equal(archive.runtimeArtifact.sourceTreeHash, sourceHash);

  assert.ok(
    archive.files.every(
      ({ path }) =>
        !/(?:\/src\/|\/tests\/|node_modules|\.map$|\.env|package\.json|pnpm-lock|workbench\.preview\.json|^data\/)/.test(
          path,
        ),
    ),
  );
  const { unpackWorkbench } = await import('../.generated/archive.mjs');
  await unpackWorkbench(destination, installed);
  const runtime = join(installed, 'application');
  const manifest = JSON.parse(await readFile(join(runtime, 'manifest.json'), 'utf8'));
  assert.equal(manifest.build, undefined);
  const { validateWorkbenchAssetTransfer } = await import('../.generated/assets.mjs');
  const lock = await validateWorkbenchAssetTransfer(installed, manifest);
  assert.equal(lock.dependencies[0].status, 'bundled');
  assert.equal(await readFile(join(runtime, manifest.resources[0].path), 'utf8'), 'fixed resource');
  const { readWorkbenchRuntimeArtifact } = await import('../.generated/runtime-artifact.mjs');
  await readWorkbenchRuntimeArtifact(runtime);
  assert.match(await readFile(join(runtime, 'THIRD_PARTY_NOTICES.txt'), 'utf8'), /react@/);
  assert.match(await readFile(join(runtime, 'THIRD_PARTY_NOTICES.txt'), 'utf8'), /Author supplied attribution/);
  assert.equal(await readFile(join(runtime, 'LICENSE.txt'), 'utf8'), 'Author license notice');
  const config = join(installed, 'config.json');
  await writeFile(
    config,
    JSON.stringify({
      appId: manifest.appId,
      sourceDirectory: runtime,
      dataDirectory: join(installed, 'data'),
      generation: randomUUID(),
      nonce: randomUUID(),
      hostConnection: null,
      development: true,
    }),
  );
  child = fork(join(runtime, manifest.server), [], {
    cwd: installed,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: {
      ...process.env,
      NODE_PATH: '',
      FLOATBOAT_HOST_MODE: 'offline',
      FLOATBOAT_WORKBENCH_CONFIG: config,
    },
    execArgv: ['--disable-warning=ExperimentalWarning'],
  });
  let logs = '';
  child.stderr.on('data', (b) => (logs += b));
  const ready = await new Promise((accept, reject) => {
    const timer = setTimeout(() => reject(new Error('RUNTIME_NOT_READY:' + logs)), 10000);
    child.once('error', reject);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error('RUNTIME_EXIT:' + code + logs));
    });
    child.on('message', (message) => {
      if (message.type === 'ready') {
        clearTimeout(timer);
        accept(message);
      }
    });
  });
  assert.deepEqual(await (await fetch(ready.url + '/api/proof')).json(), { result: 'proof', element: 'div' });
  const ui = await (await fetch(ready.url)).text();
  assert.match(ui, /script/);
  const module = archive.files.find(({ path }) => path.endsWith('.wasm'));
  assert.ok(module);
  const response = await fetch(ready.url + module.path.slice('application/dist/ui'.length));
  assert.equal(response.headers.get('content-type'), 'application/wasm');
  const { instance } = await WebAssembly.instantiateStreaming(response);
  assert.equal(instance.exports.answer(), 42);
  await assert.rejects(
    exportApplication(join(directory, 'with-data.fbworkbench'), root, { runtime: true, includeData: true }),
    /RUNTIME_EXPORT_EXCLUDES_DATA/,
  );
  await writeFile(join(runtime, 'dist/server/index.mjs'), 'tampered');
  await assert.rejects(readWorkbenchRuntimeArtifact(runtime), /INTEGRITY/);
});
