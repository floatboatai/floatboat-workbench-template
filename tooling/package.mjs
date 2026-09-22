// ABOUTME: 将明确允许的业务源码交付为已有协议的应用包，业务数据仅在显式选择时参与归档。
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readdir, lstat, rm, open, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { application, repository, checkApplication, readManifest } from './build.mjs';
import { packDeclaredAssets, validateResourceBindings } from './assets.mjs';

const files = ['manifest.json', 'package.json', 'pnpm-lock.yaml', 'tsconfig.json', 'index.html',
  'REQUIREMENTS.md', 'DESIGN.md', 'ENGINEERING.md', 'LICENSE'];

export async function exportApplication(destination, root = application, { bindings, includeData = false } = {}) {
  if (!isAbsolute(destination) || !destination.endsWith('.fbworkbench')) throw new Error('ABSOLUTE_FBWORKBENCH_OUTPUT_REQUIRED');
  const outputPath = relative(root, destination);
  if (!isAbsolute(outputPath) && outputPath !== '..' && !outputPath.startsWith(`..${sep}`))
    throw new Error('OUTPUT_MUST_BE_OUTSIDE_APP');
  const manifest = await readManifest(root);
  validateResourceBindings(manifest, bindings);
  const dataDirectory = join(repository, '.local/data', manifest.appId);
  const { packWorkbench, validateTransferPath, hashTransferFile } = await import('../.generated/archive.mjs');
  await mkdir(join(repository, '.local'), { recursive: true, mode: 0o700 });
  const staging = await mkdtemp(join(repository, '.local', 'export-'));
  const contents = join(staging, 'contents');
  await mkdir(join(contents, 'application'), { recursive: true });
  let release;
  const sourceFiles = [];
  let total = 0;
  let count = 0;
  const copy = async (path) => {
    if (sourceFiles.some((copied) => copied.path === path)) return;
    const source = join(root, path);
    const stat = await lstat(source);
    validateTransferPath(`application/${path}`);
    if (stat.isSymbolicLink()) throw new Error(`SOURCE_SYMLINK_UNSUPPORTED:${path}`);
    if (stat.isDirectory()) {
      await mkdir(join(contents, 'application', path), { recursive: true });
      for (const name of (await readdir(source)).sort()) await copy(`${path}/${name}`);
    } else if (stat.isFile()) {
      total += stat.size;
      if (++count > 10000 || total > 100 * 1024 * 1024) throw new Error('APPLICATION_SOURCE_TOO_LARGE');
      await mkdir(dirname(join(contents, 'application', path)), { recursive: true });
      await copyFile(source, join(contents, 'application', path), constants.COPYFILE_EXCL);
      sourceFiles.push({ path, size: (await lstat(join(contents, 'application', path))).size, sha256: await hashTransferFile(join(contents, 'application', path)) });
    } else throw new Error(`SOURCE_FILE_TYPE_INVALID:${path}`);
  };
  try {
    for (const path of files) {
      try { await copy(path); } catch (error) { if (path !== 'LICENSE' || error.code !== 'ENOENT') throw error; }
    }
    await copy('src');
    await copy('tests');
    await copy(manifest.migrations);
    if (includeData) {
      for (const item of manifest.resources ?? []) if (item.location === 'project') {
        try { await copy(item.path); } catch (error) { if (item.required || error.code !== 'ENOENT') throw error; }
      }
      for (const item of manifest.dependencies ?? []) if (item.source.type === 'bundle') await copy(item.source.path);
    }
    // 检查固定下来的源文件，防止创作期间的修改绕过刚完成的构建。
    const frozenRoot = join(contents, 'application');
    const checkedManifest = await checkApplication(frozenRoot);
    if (includeData) {
      const { acquireWorkbenchDataLock } = await import('../.generated/sdk/data-lock.mjs');
      const { snapshotWorkbenchData } = await import('../.generated/data-snapshot.mjs');
      release = await acquireWorkbenchDataLock(dataDirectory, manifest.appId);
      const heldLock = JSON.parse(await readFile(join(dataDirectory, '.runtime-lock.json'), 'utf8'));
      const migrations = {};
      for (const name of (await readdir(join(frozenRoot, manifest.migrations))).sort())
        if (name.endsWith('.sql')) migrations[name] = await hashTransferFile(join(frozenRoot, manifest.migrations, name));
      const database = await snapshotWorkbenchData(dataDirectory, join(contents, 'data'), manifest.appId, migrations, heldLock);
      await writeFile(join(contents, 'snapshot.json'), JSON.stringify({ version: 1, database,
        sourceHash: createHash('sha256').update(JSON.stringify({ algorithm: 'workbench-source-tree-v1', files: sourceFiles.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path))) })).digest('hex'),
        createdAt: new Date().toISOString(), migrations }));
      await writeFile(join(contents, 'operation-history.json'), JSON.stringify({ version: 1, coverage: 'unknown', entries: [] }));
    }
    await packDeclaredAssets(checkedManifest, root, staging, contents, { bindings, includeData, dataDirectory: includeData ? join(contents, 'data') : dataDirectory });
    for (const generated of ['sdk', 'dist', '.workbench-vite'])
      await rm(join(frozenRoot, generated), { recursive: true, force: true });
    await mkdir(dirname(destination), { recursive: true });
    const reservation = await open(destination, 'wx', 0o600);
    await reservation.close();
    try {
      return await packWorkbench(contents, destination, {
        kind: includeData ? 'migration' : 'application', sourceAppId: checkedManifest.appId, name: checkedManifest.name, version: checkedManifest.version,
      });
    } catch (error) { await rm(destination, { force: true }); throw error; }
  } finally { try { await release?.(); } finally { await rm(staging, { recursive: true, force: true }); } }
}
