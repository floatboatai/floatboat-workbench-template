// ABOUTME: 把经过发布编译的固定源码快照转换为客户端免编译运行包。
import { createHash } from 'node:crypto';
import { readFile, readdir, lstat, rm, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { repository } from './build.mjs';

async function treeIdentity(root, excluded = new Set(), excludedAtRoot = new Set()) {
  const files = [];
  const visit = async (path = '') => {
    for (const name of (await readdir(join(root, path))).sort()) {
      if (excluded.has(name) || (!path && excludedAtRoot.has(name)) || name.startsWith('.workbench-'))
        continue;
      const entry = path ? `${path}/${name}` : name;
      const info = await lstat(join(root, entry));
      if (info.isSymbolicLink()) throw new Error('RUNTIME_SOURCE_LINK_FORBIDDEN');
      if (info.isDirectory()) await visit(entry);
      else if (info.isFile()) {
        const bytes = await readFile(join(root, entry));
        files.push({
          path: entry,
          size: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        });
      } else throw new Error('RUNTIME_SOURCE_FILE_INVALID');
    }
  };
  await visit();
  files.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
  return createHash('sha256')
    .update(JSON.stringify({ algorithm: 'workbench-source-tree-v1', files }))
    .digest('hex');
}

export async function stageRuntimePackage(source, contents, staging) {
  const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'));
  const sourceTreeHash = await treeIdentity(source, new Set(['dist', 'node_modules']), new Set(['sdk']));
  const toolchainId = createHash('sha256')
    .update(await treeIdentity(join(repository, 'tooling')))
    .update(await treeIdentity(join(repository, 'sdk')))
    .update(await readFile(join(repository, 'pnpm-lock.yaml')))
    .digest('hex');
  const { writeWorkbenchPublicationNotices } = await import('../.generated/publication-notices.mjs');
  await writeWorkbenchPublicationNotices(source, join(repository, 'node_modules'));
  const { stageWorkbenchRuntimeArtifact } = await import('../.generated/runtime-artifact.mjs');
  const destination = join(staging, 'runtime');
  const { identity } = await stageWorkbenchRuntimeArtifact(source, destination, {
    formatVersion: 1,
    runtime: manifest.runtime,
    sdkVersion: manifest.sdkVersion,
    sourceTreeHash,
    toolchainId,
    sourceAccess: 'restricted',
    protection: 'business-compatible-v1',
    platform: 'portable-js',
  });
  await rm(join(contents, 'application'), { recursive: true, force: true });
  await rename(destination, join(contents, 'application'));
  return identity;
}
