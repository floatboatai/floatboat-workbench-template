// ABOUTME: 为已登记资源建立普通文件快照并核对复制前后内容，目录外链接不进入交付物。
import { createHash } from 'node:crypto';
import { cp, lstat, mkdir, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { excludedTransferEntry, hashTransferFile, validateTransferPath } from './WorkbenchTransferArchive';
export interface WorkbenchResourceInventory {
  sha256: string;
  bytes: number;
  files: number;
  entries: { path: string; size: number; sha256: string }[];
}
export async function inspectWorkbenchResource(
  source: string,
  kind: 'file' | 'directory',
): Promise<WorkbenchResourceInventory> {
  const root = await lstat(source);
  if (root.isSymbolicLink() || (kind === 'file' ? !root.isFile() : !root.isDirectory()))
    throw new Error('WORKBENCH_RESOURCE_TYPE_INVALID');
  const entries: WorkbenchResourceInventory['entries'] = [];
  let bytes = 0;
  async function visit(relative: string, path: string) {
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) throw new Error('WORKBENCH_RESOURCE_LINK_UNSUPPORTED');
    if (relative) validateTransferPath(`data/${relative}`);
    if (stat.isDirectory()) {
      for (const name of (await readdir(path)).sort())
        if (!excludedTransferEntry(name)) await visit(relative ? `${relative}/${name}` : name, join(path, name));
    } else if (stat.isFile()) {
      bytes += stat.size;
      if (entries.length >= 100_000 || bytes > 2 * 1024 ** 3) throw new Error('WORKBENCH_TRANSFER_DATA_TOO_LARGE');
      entries.push({ path: relative || 'file', size: stat.size, sha256: await hashTransferFile(path) });
    } else throw new Error('WORKBENCH_RESOURCE_TYPE_INVALID');
  }
  await visit('', source);
  return {
    sha256: createHash('sha256').update(JSON.stringify(entries)).digest('hex'),
    bytes,
    files: entries.length,
    entries,
  };
}
export async function snapshotWorkbenchResource(source: string, destination: string, kind: 'file' | 'directory') {
  const before = await inspectWorkbenchResource(source, kind);
  await mkdir(destination, { recursive: true });
  for (const file of before.entries) {
    const path = join(destination, file.path);
    await mkdir(dirname(path), { recursive: true });
    await cp(kind === 'file' ? source : join(source, file.path), path, { errorOnExist: true, force: false });
    if ((await hashTransferFile(path)) !== file.sha256) throw new Error('WORKBENCH_RESOURCE_CHANGED');
  }
  const after = await inspectWorkbenchResource(source, kind);
  if (before.sha256 !== after.sha256) throw new Error('WORKBENCH_RESOURCE_CHANGED');
  return before;
}
