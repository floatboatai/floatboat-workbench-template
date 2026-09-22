// ABOUTME: 持有 SDK 数据锁直到 SQLite 和受管附件全部复制，校验库而不运行应用迁移。
import { DatabaseSync, backup } from 'node:sqlite';
import { cp, lstat, mkdir, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { acquireWorkbenchDataLock } from '../../sdk/data-lock.mjs';
import { excludedTransferEntry, hashTransferFile, validateTransferPath } from './WorkbenchTransferArchive';

export const workbenchSnapshotSchema = z
  .object({
    version: z.literal(1),
    database: z.boolean().optional(),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/u),
    createdAt: z.string().datetime(),
    migrations: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/u)),
  })
  .strict();
export async function validateWorkbenchDatabase(
  file: string,
  migrations?: Readonly<Record<string, string>>,
): Promise<void> {
  const db = new DatabaseSync(file, { readOnly: true, enableDoubleQuotedStringLiterals: false, allowExtension: false });
  try {
    db.exec('PRAGMA trusted_schema=OFF;');
    const check = db.prepare('PRAGMA integrity_check').all();
    if (check.length !== 1 || Object.values(check[0])[0] !== 'ok')
      throw new Error('WORKBENCH_TRANSFER_DATABASE_INVALID');
    if (migrations)
      for (const row of db.prepare('SELECT name, hash FROM _workbench_migrations').all()) {
        if (migrations[String(row.name)] !== row.hash)
          throw new Error(`WORKBENCH_MIGRATION_CHANGED:${String(row.name)}`);
      }
  } finally {
    db.close();
  }
}
export async function snapshotWorkbenchData(
  source: string,
  destination: string,
  appId: string,
  migrations?: Readonly<Record<string, string>>,
  heldLock?: { pid: number; lockId: string },
): Promise<boolean> {
  let release: () => Promise<void>;
  if (heldLock) {
    const owner = JSON.parse(await readFile(join(source, '.runtime-lock.json'), 'utf8')) as {
      pid: number;
      lockId: string;
    };
    if (owner.pid !== heldLock.pid || owner.lockId !== heldLock.lockId) throw new Error('WORKBENCH_DATA_IN_USE');
    process.kill(owner.pid, 0);
    release = async () => undefined;
  } else release = await acquireWorkbenchDataLock(source, appId);
  try {
    await mkdir(destination, { recursive: true, mode: 0o700 });
    let exists = true;
    try {
      await lstat(join(source, 'data.sqlite'));
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') exists = false;
      else throw error;
    }
    if (exists) {
      if ((await lstat(join(source, 'data.sqlite'))).isSymbolicLink())
        throw new Error('WORKBENCH_TRANSFER_LINK_UNSUPPORTED');
      const db = new DatabaseSync(join(source, 'data.sqlite'), { readOnly: true });
      try {
        await backup(db, join(destination, 'data.sqlite'));
      } finally {
        db.close();
      }
      const snapshot = new DatabaseSync(join(destination, 'data.sqlite'));
      try {
        snapshot.exec('PRAGMA journal_mode=DELETE;');
      } finally {
        snapshot.close();
      }
      await validateWorkbenchDatabase(join(destination, 'data.sqlite'), migrations);
    }
    let bytes = exists ? (await lstat(join(destination, 'data.sqlite'))).size : 0;
    let files = 1;
    const visit = async (path: string): Promise<void> => {
      const stat = await lstat(join(source, path));
      validateTransferPath(`data/${path}`);
      if (stat.isSymbolicLink()) throw new Error('WORKBENCH_TRANSFER_LINK_UNSUPPORTED');
      if (stat.isDirectory()) {
        await mkdir(join(destination, path), { recursive: true });
        for (const name of (await readdir(join(source, path))).sort()) {
          if (!excludedTransferEntry(name)) await visit(`${path}/${name}`);
        }
      } else if (stat.isFile()) {
        bytes += stat.size;
        if (++files > 100_000 || bytes > 2 * 1024 ** 3) throw new Error('WORKBENCH_TRANSFER_DATA_TOO_LARGE');
        await cp(join(source, path), join(destination, path), { errorOnExist: true, force: false });
      } else throw new Error('WORKBENCH_TRANSFER_FILE_TYPE_INVALID');
    };
    for (const name of (await readdir(source)).sort())
      if (name !== 'data.sqlite' && !excludedTransferEntry(name)) await visit(name);
    return exists;
  } finally {
    await release();
  }
}
export async function validateSnapshot(root: string): Promise<void> {
  const snapshot = workbenchSnapshotSchema.parse(JSON.parse(await readFile(join(root, 'snapshot.json'), 'utf8')));
  const manifest = JSON.parse(await readFile(join(root, 'application/manifest.json'), 'utf8')) as {
    migrations: string;
  };
  // manifest 的路径先由归档检查中的完整 schema 验证。
  const migrations: Record<string, string> = {};
  for (const name of await readdir(join(root, 'application', manifest.migrations)))
    if (name.endsWith('.sql'))
      migrations[name] = await hashTransferFile(join(root, 'application', manifest.migrations, name));
  if (JSON.stringify(Object.entries(migrations).sort()) !== JSON.stringify(Object.entries(snapshot.migrations).sort()))
    throw new Error('WORKBENCH_TRANSFER_MIGRATIONS_MISMATCH');
  if (snapshot.database !== false) await validateWorkbenchDatabase(join(root, 'data/data.sqlite'), migrations);
  else await mkdir(join(root, 'data'), { recursive: true });
}
