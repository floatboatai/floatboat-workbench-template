// ABOUTME: 核对交付锁清单与声明一一对应；资源快照摘要和包内固定位置共同约束恢复路径。
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { workbenchManifestSchema, type WorkbenchManifest } from '../contracts/workbenchManifest';
interface WorkbenchAssetExport { lock: WorkbenchAssetLock; dependencyDirectory: string; resources: { id: string; source: string; kind: 'file' | 'directory'; destination: string }[] }
import { workbenchAssetLockSchema, type WorkbenchAssetLock } from '../contracts/workbenchAssets';
import { hashTransferFile } from './WorkbenchTransferArchive';
import { inspectWorkbenchResource, snapshotWorkbenchResource } from './WorkbenchResourceSnapshot';
export async function validateWorkbenchAssetTransfer(
  root: string,
  manifest: WorkbenchManifest,
): Promise<WorkbenchAssetLock | null> {
  let lock: WorkbenchAssetLock;
  let prefix = '';
  try {
    let content: string;
    try {
      content = await readFile(join(root, 'workbench.lock.json'), 'utf8');
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error;
      content = await readFile(join(root, 'application/workbench.lock.json'), 'utf8');
      prefix = 'application/workbench-assets/';
    }
    lock = workbenchAssetLockSchema.parse(JSON.parse(content));
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT' &&
      !manifest.dependencies?.length &&
      !manifest.resources?.length
    )
      return null;
    throw error;
  }
  if (
    new Set(lock.resources.map((entry) => entry.id)).size !== lock.resources.length ||
    new Set(lock.dependencies.map((entry) => entry.id)).size !== lock.dependencies.length ||
    lock.resources.length !== (manifest.resources?.length ?? 0) ||
    lock.dependencies.length !== (manifest.dependencies?.length ?? 0)
  )
    throw new Error('WORKBENCH_ASSET_LOCK_INVALID');
  const required = new Set<string>();
  const requireDependency = (id: string) => { if (required.has(id)) return; required.add(id); for (const child of manifest.dependencies?.find((item) => item.id === id)?.requires ?? []) requireDependency(child); };
  for (const item of manifest.dependencies ?? []) if (item.required) requireDependency(item.id);
  for (const item of lock.dependencies) {
    const declaration = manifest.dependencies?.find((entry) => entry.id === item.id);
    if (!declaration || declaration.kind !== item.kind) throw new Error('WORKBENCH_ASSET_LOCK_INVALID');
    if (item.status === 'bundled') {
      if (declaration.source.type === 'registry') throw new Error('WORKBENCH_ASSET_LOCK_INVALID');
      if (
        item.file !== `${prefix}dependencies/${item.id}.${item.kind === 'workflow' ? 'workflow.js' : 'aoe'}` ||
        !item.sha256
      )
        throw new Error('WORKBENCH_ASSET_LOCK_INVALID');
      if ((await hashTransferFile(join(root, item.file))) !== item.sha256)
        throw new Error('WORKBENCH_OBJECT_HASH_MISMATCH');
      if (declaration.source.type === 'bundle' && (await hashTransferFile(join(root, 'application', declaration.source.path))) !== item.sha256)
        throw new Error('WORKBENCH_OBJECT_HASH_MISMATCH');
    } else if (item.status === 'reference') {
      if (declaration.source.type !== 'registry' || item.version !== declaration.source.version || item.file)
        throw new Error('WORKBENCH_ASSET_LOCK_INVALID');
    } else if (required.has(item.id)) throw new Error('WORKBENCH_DEPENDENCY_UNBOUND');
  }
  for (const item of lock.resources) {
    const declaration = manifest.resources?.find((entry) => entry.id === item.id);
    if (!declaration) throw new Error('WORKBENCH_ASSET_LOCK_INVALID');
    if (item.status === 'bundled') {
      const expected = `${prefix}${declaration.role === 'data' ? 'resource-data' : 'assets'}/${item.id}`;
      if (item.directory !== expected || !item.sha256) throw new Error('WORKBENCH_ASSET_LOCK_INVALID');
      const path = join(root, expected, declaration.kind === 'file' ? 'file' : '');
      if (!item.files && declaration.kind === 'directory') await mkdir(path, { recursive: true });
      const actual = await inspectWorkbenchResource(path, declaration.kind);
      if (actual.sha256 !== item.sha256 || actual.bytes !== item.bytes || actual.files !== item.files)
        throw new Error('WORKBENCH_OBJECT_HASH_MISMATCH');
      if (declaration.location === 'project' && (await inspectWorkbenchResource(join(root, 'application', declaration.path!), declaration.kind)).sha256 !== item.sha256)
        throw new Error('WORKBENCH_OBJECT_HASH_MISMATCH');
    } else if (item.status === 'rebind') {
      if (declaration.transfer !== 'rebind' || item.directory) throw new Error('WORKBENCH_ASSET_LOCK_INVALID');
    } else if (item.status === 'excluded') {
      if (declaration.role !== 'data' || item.directory) throw new Error('WORKBENCH_ASSET_LOCK_INVALID');
    } else if (declaration.required) throw new Error('WORKBENCH_RESOURCE_UNBOUND');
  }
  return lock;
}

export async function writeWorkbenchAssetTransfer(root: string, assets: WorkbenchAssetExport, embedded = false) {
  const manifestPath = join(root, 'application/manifest.json');
  let manifest = workbenchManifestSchema.parse(JSON.parse(await readFile(manifestPath, 'utf8')));
  const lock = workbenchAssetLockSchema.parse(assets.lock);
  const prefix = embedded ? 'application/workbench-assets/' : '';
  await cp(assets.dependencyDirectory, join(root, prefix, 'dependencies'), { recursive: true });
  for (const resource of assets.resources) {
    const snapshot = await snapshotWorkbenchResource(
      resource.source,
      join(root, prefix, resource.destination),
      resource.kind,
    );
    const entry = lock.resources.find((item) => item.id === resource.id);
    if (!entry) throw new Error('WORKBENCH_ASSET_LOCK_INVALID');
    Object.assign(entry, {
      directory: prefix + resource.destination,
      sha256: snapshot.sha256,
      bytes: snapshot.bytes,
      files: snapshot.files,
    });
  }
  if (embedded) {
    for (const entry of lock.dependencies) if (entry.file) entry.file = prefix + entry.file;
    manifest = {
      ...manifest,
      ...(manifest.dependencies
        ? {
            dependencies: manifest.dependencies.map((item) => {
              const entry = lock.dependencies.find((entry) => entry.id === item.id);
              return entry?.status === 'bundled'
                ? { ...item, source: { type: 'bundle' as const, path: entry.file!.slice('application/'.length) } }
                : item;
            }),
          }
        : {}),
      ...(manifest.resources
        ? {
            resources: manifest.resources.map((item) => {
              const entry = lock.resources.find((entry) => entry.id === item.id);
              return entry?.status === 'bundled'
                ? {
                    ...item,
                    location: 'project' as const,
                    path: entry.directory!.slice('application/'.length) + (item.kind === 'file' ? '/file' : ''),
                  }
                : item;
            }),
          }
        : {}),
    };
    await writeFile(manifestPath, JSON.stringify(workbenchManifestSchema.parse(manifest), null, 2) + '\n');
  }
  await writeFile(
    join(root, embedded ? 'application/workbench.lock.json' : 'workbench.lock.json'),
    JSON.stringify(lock),
  );
  await validateWorkbenchAssetTransfer(root, manifest);
}
