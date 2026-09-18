// ABOUTME: 在独立 Node 中流式读写归档；解压仅接受可跨平台表达的普通文件。
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { lstat, mkdir, readFile, readdir, rename, rm, statfs } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import * as yauzl from 'yauzl';
import * as yazl from 'yazl';
import { transferManifestSchema, type WorkbenchTransferManifest } from '../contracts/workbenchTransfer';
import { WORKBENCH_RUNTIME_PROFILE, WORKBENCH_SDK_VERSION } from '../contracts/workbenchManifest';

const APPLICATION_BYTES = 100 * 1024 * 1024;
const DATA_BYTES = 2 * 1024 * 1024 * 1024;
const METADATA_BYTES = 32 * 1024 * 1024;
const forbidden =
  /^(?:\.git|\.env(?:\..*)?|\.npmrc|\.pnpmfile\.cjs|\.runtime-lock\.json|.*(?:-wal|-shm)|.*\.log|\.workbench-build\.json)$/iu;
export function validateTransferPath(path: string): void {
  const parts = path.split('/');
  if (
    path.length > 512 ||
    !path ||
    /[\\:]/u.test(path) ||
    [...path].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ||
    parts.some(
      (part) =>
        !part ||
        part === '.' ||
        part === '..' ||
        /[. ]$/u.test(part) ||
        /[<>"|?*]/u.test(part) ||
        /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part) ||
        forbidden.test(part),
    )
  )
    throw new Error(`WORKBENCH_TRANSFER_PATH_INVALID:${path}`);
  if (
    !['transfer.json', 'snapshot.json', 'operation-history.json'].includes(path) &&
    !path.startsWith('application/') &&
    !path.startsWith('data/')
  )
    throw new Error('WORKBENCH_TRANSFER_ENTRY_INVALID');
  if (path.startsWith('application/') && /\.(?:node|exe|dll|dylib|so|dmg|app|sqlite|db)$/iu.test(path))
    throw new Error('WORKBENCH_NATIVE_DEPENDENCY_UNSUPPORTED');
}
export function excludedTransferEntry(name: string): boolean {
  return forbidden.test(name);
}
function packageId(manifest: Omit<WorkbenchTransferManifest, 'packageId'>): string {
  return createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
}
class Budget {
  private application = 0;
  private data = 0;
  private files = 0;
  private dataFiles = 0;
  add(path: string, size: number): void {
    if (!Number.isSafeInteger(size) || size < 0) throw new Error('WORKBENCH_TRANSFER_SIZE_INVALID');
    if (path.startsWith('data/')) {
      this.data += size;
      if (++this.dataFiles > 100_000 || this.data > DATA_BYTES) throw new Error('WORKBENCH_TRANSFER_DATA_TOO_LARGE');
    } else if (path.startsWith('application/')) {
      this.application += size;
      if (++this.files > 10_000 || this.application > APPLICATION_BYTES)
        throw new Error('WORKBENCH_TRANSFER_APP_TOO_LARGE');
    } else if (size > METADATA_BYTES) throw new Error('WORKBENCH_TRANSFER_METADATA_TOO_LARGE');
  }
}
export async function hashTransferFile(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  return hash.digest('hex');
}
export async function packWorkbench(
  root: string,
  destination: string,
  info: Pick<WorkbenchTransferManifest, 'kind' | 'sourceAppId' | 'name' | 'version'>,
): Promise<WorkbenchTransferManifest> {
  const files: WorkbenchTransferManifest['files'] = [];
  const budget = new Budget();
  const prefixes = new Map<string, string>();
  const visit = async (path: string) => {
    const stat = await lstat(join(root, path));
    if (stat.isSymbolicLink()) throw new Error('WORKBENCH_TRANSFER_LINK_UNSUPPORTED');
    if (stat.isDirectory()) {
      for (const name of (await readdir(join(root, path))).sort()) await visit(path ? `${path}/${name}` : name);
    } else if (stat.isFile()) {
      validateTransferPath(path);
      const parts = path.split('/');
      for (let count = 1; count <= parts.length; count++) {
        const prefix = parts.slice(0, count).join('/');
        const key = prefix.normalize('NFC').toLowerCase();
        if (prefixes.has(key) && prefixes.get(key) !== prefix) throw new Error('WORKBENCH_TRANSFER_DUPLICATE_PATH');
        prefixes.set(key, prefix);
      }
      budget.add(path, stat.size);
      files.push({ path, size: stat.size, sha256: await hashTransferFile(join(root, path)) });
    } else throw new Error('WORKBENCH_TRANSFER_FILE_TYPE_INVALID');
  };
  await visit('');
  const body: Omit<WorkbenchTransferManifest, 'packageId'> = {
    formatVersion: 1 as const,
    ...info,
    runtime: WORKBENCH_RUNTIME_PROFILE,
    sdkVersion: WORKBENCH_SDK_VERSION,
    exportedAt: new Date().toISOString(),
    files,
  };
  const manifest = transferManifestSchema.parse({ ...body, packageId: packageId(body) });
  const temporary = `${destination}.${randomUUID()}.partial`;
  const zip = new yazl.ZipFile();
  const pending = pipeline(zip.outputStream, createWriteStream(temporary, { flags: 'wx', mode: 0o600 }));
  try {
    zip.addBuffer(Buffer.from(JSON.stringify(manifest)), 'transfer.json');
    for (const file of files) zip.addFile(join(root, file.path), file.path, { mode: 0o100600 });
    zip.end();
    await pending;
    await rename(temporary, destination);
  } catch (error) {
    if (zip.outputStream instanceof Readable) zip.outputStream.destroy();
    await pending.catch(() => undefined);
    throw error;
  } finally {
    await rm(temporary, { force: true });
  }
  return manifest;
}
export async function unpackWorkbench(archive: string, destination: string): Promise<WorkbenchTransferManifest> {
  if ((await lstat(archive)).size > APPLICATION_BYTES + DATA_BYTES + METADATA_BYTES * 3)
    throw new Error('WORKBENCH_TRANSFER_TOO_LARGE');
  await mkdir(destination, { recursive: true, mode: 0o700 });
  const budget = new Budget();
  const names = new Set<string>();
  const prefixes = new Map<string, string>();
  const actual = new Map<string, { size: number; sha256: string }>();
  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) =>
    yauzl.open(archive, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true }, (error, file) =>
      error ? reject(error) : resolve(file!),
    ),
  );
  try {
    await new Promise<void>((resolve, reject) => {
      zip.on('error', reject);
      zip.on('end', resolve);
      zip.on('entry', (entry: yauzl.Entry) => {
        void (async () => {
          const path = entry.fileName;
          validateTransferPath(path);
          const folded = path.normalize('NFC').toLowerCase();
          if (names.has(folded)) throw new Error('WORKBENCH_TRANSFER_DUPLICATE_PATH');
          names.add(folded);
          const parts = path.split('/');
          for (let count = 1; count <= parts.length; count++) {
            const prefix = parts.slice(0, count).join('/');
            const key = prefix.normalize('NFC').toLowerCase();
            if (prefixes.has(key) && prefixes.get(key) !== prefix) throw new Error('WORKBENCH_TRANSFER_DUPLICATE_PATH');
            prefixes.set(key, prefix);
          }
          const type = (entry.externalFileAttributes >>> 16) & 0o170000;
          if (type !== 0 && type !== 0o100000) throw new Error('WORKBENCH_TRANSFER_LINK_UNSUPPORTED');
          if (entry.generalPurposeBitFlag & 1) throw new Error('WORKBENCH_TRANSFER_ENCRYPTED_UNSUPPORTED');
          budget.add(path, entry.uncompressedSize);
          const disk = await statfs(destination);
          if (disk.bavail * disk.bsize < entry.uncompressedSize + 16 * 1024 * 1024)
            throw new Error('WORKBENCH_TRANSFER_DISK_FULL');
          await mkdir(dirname(join(destination, path)), { recursive: true, mode: 0o700 });
          const input = await new Promise<NodeJS.ReadableStream>((accept, fail) =>
            zip.openReadStream(entry, (error, stream) => (error ? fail(error) : accept(stream!))),
          );
          let size = 0;
          const hash = createHash('sha256');
          const check = new Transform({
            transform(chunk: Buffer, _encoding, callback) {
              size += chunk.length;
              if (size > entry.uncompressedSize) return callback(new Error('WORKBENCH_TRANSFER_SIZE_MISMATCH'));
              hash.update(chunk);
              callback(null, chunk);
            },
          });
          await pipeline(input, check, createWriteStream(join(destination, path), { flags: 'wx', mode: 0o600 }));
          if (size !== entry.uncompressedSize) throw new Error('WORKBENCH_TRANSFER_SIZE_MISMATCH');
          actual.set(path, { size, sha256: hash.digest('hex') });
          zip.readEntry();
        })().catch(reject);
      });
      zip.readEntry();
    });
    const manifest = transferManifestSchema.parse(
      JSON.parse(await readFile(join(destination, 'transfer.json'), 'utf8')),
    );
    const { packageId: id, ...body } = manifest;
    if (packageId(body) !== id || actual.size !== manifest.files.length + 1)
      throw new Error('WORKBENCH_TRANSFER_MANIFEST_MISMATCH');
    const declared = new Set<string>();
    for (const file of manifest.files) {
      validateTransferPath(file.path);
      if (file.path === 'transfer.json' || declared.has(file.path))
        throw new Error('WORKBENCH_TRANSFER_MANIFEST_MISMATCH');
      declared.add(file.path);
      const found = actual.get(file.path);
      if (!found || found.size !== file.size || found.sha256 !== file.sha256)
        throw new Error('WORKBENCH_TRANSFER_DIGEST_MISMATCH');
      if (manifest.kind === 'application' && !file.path.startsWith('application/'))
        throw new Error('WORKBENCH_TRANSFER_KIND_MISMATCH');
    }
    if (
      manifest.kind === 'migration' &&
      !['data/data.sqlite', 'snapshot.json', 'operation-history.json'].every((path) => declared.has(path))
    )
      throw new Error('WORKBENCH_TRANSFER_SNAPSHOT_REQUIRED');
    return manifest;
  } finally {
    zip.close();
  }
}
