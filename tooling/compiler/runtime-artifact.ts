// ABOUTME: 运行包只物化白名单产物，逐文件校验摘要和源映射，供安装与平台构建共用。
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { z } from 'zod';
import { workbenchManifestSchema, type WorkbenchManifest } from '../contracts/workbenchManifest';
import {
  workbenchRuntimeIdentitySchema,
  type WorkbenchRuntimeIdentity,
} from '../contracts/workbenchDistribution';

export const WORKBENCH_RUNTIME_DESCRIPTOR = 'workbench.runtime.json';
const digest = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const descriptorSchema = z
  .object({
    identity: workbenchRuntimeIdentitySchema,
    files: z
      .array(
        z
          .object({
            path: z.string().min(1).max(512),
            size: z.number().int().nonnegative(),
            sha256: z.string().regex(/^[a-f0-9]{64}$/u),
          })
          .strict(),
      )
      .max(10000),
  })
  .strict();
const assetExtensions = new Set([
  '.js',
  '.mjs',
  '.css',
  '.html',
  '.json',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.svg',
  '.ico',
  '.gif',
  '.avif',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.wasm',
  '.txt',
  '.bin',
  '.data',
  '.mp3',
  '.wav',
  '.ogg',
  '.mp4',
  '.webm',
  '.pdf',
]);
function allowed(path: string, manifest?: WorkbenchManifest): boolean {
  if (path.includes('\\') || path.split('/').some((part) => !part || part === '..' || part.startsWith('.')))
    return false;
  if (
    path === 'manifest.json' ||
    path === 'workbench.lock.json' ||
    /^LICENSE(?:\.txt)?$/iu.test(path) ||
    path === 'THIRD_PARTY_NOTICES.txt'
  )
    return true;
  if (path.startsWith('dist/ui/')) return assetExtensions.has(extname(path).toLowerCase());
  if (path.startsWith('dist/server/')) return ['.mjs', '.js', '.json'].includes(extname(path));
  if (path.startsWith('sdk/')) return path.endsWith('.mjs');
  if (path.startsWith('migrations/')) return /^migrations\/\d{4,}_[a-zA-Z0-9_.-]+\.sql$/u.test(path);
  // 声明的固定资源只能带非代码文件；依赖包沿用显式的工作流/技能包契约。
  if (
    manifest?.dependencies?.some((dependency) => dependency.source.type === 'bundle' && dependency.source.path === path)
  )
    return /(?:\.workflow\.js|\.(?:json|zip|aoe|fbworkflow|fbcombo))$/iu.test(path);
  const declared = manifest?.resources?.some(
    (resource) =>
      resource.location === 'project' &&
      resource.role === 'asset' &&
      (resource.kind === 'file' ? path === resource.path : path.startsWith(`${resource.path}/`)),
  );
  return Boolean(
    declared &&
    [
      '',
      '.json',
      '.csv',
      '.txt',
      '.md',
      '.pdf',
      '.png',
      '.jpg',
      '.jpeg',
      '.webp',
      '.svg',
      '.ico',
      '.gif',
      '.avif',
      '.woff',
      '.woff2',
      '.ttf',
      '.otf',
      '.wasm',
      '.bin',
      '.data',
      '.mp3',
      '.wav',
      '.ogg',
      '.mp4',
      '.webm',
    ].includes(extname(path).toLowerCase()),
  );
}
async function filesIn(root: string): Promise<string[]> {
  const paths: string[] = [];
  const visit = async (relative: string) => {
    const stat = await lstat(join(root, relative));
    if (stat.isSymbolicLink()) throw new Error('WORKBENCH_RUNTIME_LINK_FORBIDDEN');
    if (stat.isDirectory())
      for (const name of (await readdir(join(root, relative))).sort())
        await visit(relative ? `${relative}/${name}` : name);
    else if (stat.isFile()) {
      if (paths.length >= 10001) throw new Error('WORKBENCH_RUNTIME_TOO_LARGE');
      paths.push(relative);
    } else throw new Error('WORKBENCH_RUNTIME_FILE_INVALID');
  };
  await visit('');
  return paths;
}
function rejectSourceMap(path: string, bytes: Buffer): void {
  if (/\.(?:[cm]?js|css)$/u.test(path) && /(?:\/\/[@#]|\/\*[@#])\s*sourceMappingURL\s*=/u.test(bytes.toString('utf8')))
    throw new Error('WORKBENCH_RUNTIME_SOURCE_MAP_FORBIDDEN');
}
export async function stageWorkbenchRuntimeArtifact(
  source: string,
  destination: string,
  identity: WorkbenchRuntimeIdentity,
) {
  workbenchRuntimeIdentitySchema.parse(identity);
  const original = workbenchManifestSchema.parse(JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8')));
  if (original.server !== 'dist/server/index.mjs' || original.ui !== 'dist/ui' || original.migrations !== 'migrations')
    throw new Error('WORKBENCH_RUNTIME_PROFILE_UNSUPPORTED');
  const { build: _build, ...manifest } = original;
  await mkdir(destination, { recursive: true, mode: 0o700 });
  await writeFile(join(destination, 'manifest.json'), JSON.stringify(manifest));
  const entries = [
    ...new Set([
      'dist/ui',
      'dist/server',
      'sdk',
      'migrations',
      'LICENSE',
      'LICENSE.txt',
      'THIRD_PARTY_NOTICES.txt',
      'workbench.lock.json',
      ...(original.resources ?? [])
        .filter((resource) => resource.location === 'project')
        .map((resource) => resource.path!),
      ...(original.dependencies ?? []).flatMap((dependency) =>
        dependency.source.type === 'bundle' ? [dependency.source.path] : [],
      ),
    ]),
  ];
  let bytes = 0;
  for (const entry of entries) {
    const stat = await lstat(join(source, entry)).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (!stat) continue;
    if (stat.isSymbolicLink()) throw new Error('WORKBENCH_RUNTIME_LINK_FORBIDDEN');
    const paths = stat.isDirectory() ? (await filesIn(join(source, entry))).map((path) => `${entry}/${path}`) : [entry];
    for (const path of paths) {
      if (path === 'sdk/package.json') continue;
      if (!allowed(path, original)) {
        if (!['dist/ui', 'dist/server', 'sdk'].includes(entry))
          throw new Error('WORKBENCH_RUNTIME_RESOURCE_UNSUPPORTED');
        if (!path.endsWith('.map') && !path.endsWith('.d.mts') && !path.endsWith('.d.ts') && !path.endsWith('.md'))
          throw new Error('WORKBENCH_RUNTIME_RESOURCE_UNSUPPORTED');
        continue;
      }
      if ((await lstat(join(source, path))).size > 100 * 1024 ** 2 - bytes)
        throw new Error('WORKBENCH_RUNTIME_TOO_LARGE');
      const content = await readFile(join(source, path));
      bytes += content.length;
      if (bytes > 100 * 1024 ** 2) throw new Error('WORKBENCH_RUNTIME_TOO_LARGE');
      rejectSourceMap(path, content);
      await mkdir(dirname(join(destination, path)), { recursive: true });
      await writeFile(join(destination, path), content, { mode: 0o600 });
    }
  }
  const files = [];
  for (const path of await filesIn(destination)) {
    const content = await readFile(join(destination, path));
    files.push({ path, size: content.length, sha256: digest(content) });
  }
  await writeFile(join(destination, WORKBENCH_RUNTIME_DESCRIPTOR), JSON.stringify({ identity, files }), {
    mode: 0o600,
  });
  return readWorkbenchRuntimeArtifact(destination);
}
export async function readWorkbenchRuntimeArtifact(root: string, expectedDescriptorHash?: string) {
  if ((await lstat(join(root, WORKBENCH_RUNTIME_DESCRIPTOR))).size > 4 * 1024 ** 2)
    throw new Error('WORKBENCH_RUNTIME_TOO_LARGE');
  const raw = await readFile(join(root, WORKBENCH_RUNTIME_DESCRIPTOR));
  const manifest = workbenchManifestSchema.parse(JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8')));
  if (raw.length > 4 * 1024 ** 2 || (expectedDescriptorHash && digest(raw) !== expectedDescriptorHash))
    throw new Error('WORKBENCH_RUNTIME_INTEGRITY_FAILED');
  const descriptor = descriptorSchema.parse(JSON.parse(raw.toString('utf8')));
  const listed = new Map(descriptor.files.map((file) => [file.path, file]));
  if (listed.size !== descriptor.files.length) throw new Error('WORKBENCH_RUNTIME_INTEGRITY_FAILED');
  let total = 0;
  for (const path of await filesIn(root)) {
    if (path === WORKBENCH_RUNTIME_DESCRIPTOR) continue;
    if (!allowed(path, manifest)) throw new Error('WORKBENCH_RUNTIME_FILE_FORBIDDEN');
    if ((await lstat(join(root, path))).size > 100 * 1024 ** 2 - total) throw new Error('WORKBENCH_RUNTIME_TOO_LARGE');
    const content = await readFile(join(root, path));
    total += content.length;
    rejectSourceMap(path, content);
    const file = listed.get(path);
    if (total > 100 * 1024 ** 2 || !file || file.size !== content.length || file.sha256 !== digest(content))
      throw new Error('WORKBENCH_RUNTIME_INTEGRITY_FAILED');
    listed.delete(path);
  }
  if (listed.size) throw new Error('WORKBENCH_RUNTIME_INTEGRITY_FAILED');
  if (
    manifest.build ||
    manifest.server !== 'dist/server/index.mjs' ||
    manifest.ui !== 'dist/ui' ||
    manifest.migrations !== 'migrations'
  )
    throw new Error('WORKBENCH_RUNTIME_PROFILE_UNSUPPORTED');
  await readFile(join(root, manifest.server));
  await readFile(join(root, manifest.ui, 'index.html'));
  return { identity: descriptor.identity, manifest, descriptorHash: digest(raw), files: descriptor.files };
}

