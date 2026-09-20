// ABOUTME: 独立创作仅打包工程内可分发依赖和固定资源，本机绑定交由接收端 Host 完成。
import { mkdir, copyFile, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import * as yauzl from 'yauzl';

async function assertSource(root, relative) {
  const parts = relative.split('/');
  for (let n = 0; n <= parts.length; n++) {
    if ((await lstat(join(root, ...parts.slice(0, n)))).isSymbolicLink()) throw new Error('SOURCE_SYMLINK_UNSUPPORTED');
  }
  return join(root, relative);
}
async function assertPortableCombo(file) {
  return new Promise((resolve, reject) => yauzl.open(file, { lazyEntries: true }, (error, zip) => {
    if (error || !zip) return reject(error ?? new Error('COMBO_PACKAGE_INVALID'));
    let manifest, plain = false, encrypted = false;
    const fail = (error) => { zip.close(); reject(error); };
    zip.on('error', fail);
    zip.on('entry', (entry) => {
      if (entry.fileName === 'runtime.bin') plain = true;
      if (entry.fileName === 'runtime.enc') encrypted = true;
      if (entry.fileName !== 'manifest.json') { zip.readEntry(); return; }
      if (entry.uncompressedSize > 1024 * 1024) { fail(new Error('COMBO_MANIFEST_TOO_LARGE')); return; }
      zip.openReadStream(entry, (error, stream) => {
        if (error || !stream) { fail(error ?? new Error('COMBO_PACKAGE_INVALID')); return; }
        const chunks = []; stream.on('data', (chunk) => chunks.push(chunk)); stream.on('error', fail);
        stream.on('end', () => { try { manifest = JSON.parse(Buffer.concat(chunks).toString('utf8')); zip.readEntry(); } catch (error) { fail(error); } });
      });
    });
    zip.on('end', () => { zip.close(); if (!plain || encrypted || manifest?.policy?.accessMode !== 'owned' || manifest.policy.editable === false) reject(new Error('WORKBENCH_DEPENDENCY_NOT_PORTABLE')); else resolve(); });
    zip.readEntry();
  }));
}

export async function packDeclaredAssets(manifest, root, staging, contents) {
  if (!manifest.dependencies?.length && !manifest.resources?.length) return;
  const { hashTransferFile } = await import('../.generated/archive.mjs');
  const { writeWorkbenchAssetTransfer } = await import('../.generated/assets.mjs');
  const dependencyDirectory = join(staging, 'dependencies'); await mkdir(dependencyDirectory);
  const lock = { version: 1, dependencies: [], resources: [] }, resources = [];
  for (const item of manifest.dependencies ?? []) {
    if (item.source.type === 'registry') { lock.dependencies.push({ id: item.id, kind: item.kind, status: 'reference', version: item.source.version }); continue; }
    if (item.source.type === 'binding') {
      if (item.required) throw new Error(`WORKBENCH_DEPENDENCY_UNBOUND:${item.id}`);
      lock.dependencies.push({ id: item.id, kind: item.kind, status: 'missing' }); continue;
    }
    const source = await assertSource(root, item.source.path);
    if (item.kind === 'combo') await assertPortableCombo(source);
    const file = `${item.id}.${item.kind === 'workflow' ? 'workflow.js' : 'aoe'}`;
    await copyFile(source, join(dependencyDirectory, file));
    lock.dependencies.push({ id: item.id, kind: item.kind, status: 'bundled', file: `dependencies/${file}`, sha256: await hashTransferFile(join(dependencyDirectory, file)) });
  }
  for (const item of manifest.resources ?? []) {
    if (item.transfer === 'rebind' || item.role === 'data') { lock.resources.push({ id: item.id, status: item.transfer === 'rebind' ? 'rebind' : 'excluded', bytes: 0, files: 0 }); continue; }
    if (item.location === 'external') {
      if (item.required) throw new Error(`WORKBENCH_RESOURCE_UNBOUND:${item.id}`);
      lock.resources.push({ id: item.id, status: 'missing', bytes: 0, files: 0 }); continue;
    }
    resources.push({ id: item.id, kind: item.kind, source: await assertSource(root, item.path), destination: `assets/${item.id}` });
    lock.resources.push({ id: item.id, status: 'bundled', bytes: 0, files: 0 });
  }
  await writeWorkbenchAssetTransfer(contents, { lock, resources, dependencyDirectory }, true);
}
