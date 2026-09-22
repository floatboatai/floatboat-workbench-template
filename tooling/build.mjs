// ABOUTME: 从仓库内源码准备工具链，检查业务 manifest、依赖锁与受管构建。
import { spawn } from 'node:child_process';
import { cp, mkdir, readFile, readdir, lstat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { parse } from 'yaml';

export const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const application = join(repository, 'app');
export const generated = join(repository, '.generated');

export function runNode(args, cwd = repository) {
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, args, { cwd, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? accept() : reject(new Error(`COMMAND_FAILED:${code ?? signal}`)));
  });
}

export async function prepareTools() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major !== 22 || minor < 16) throw new Error('NODE_VERSION_REQUIRED: Use Node 22.16 or newer in the Node 22 series.');
  await mkdir(generated, { recursive: true });
  const tsc = join(repository, 'node_modules/typescript/bin/tsc');
  await runNode([tsc, '-p', 'tooling/tsconfig.sdk.json']);
  await runNode([tsc, '-p', 'tooling/tsconfig.json']);
  for (const [entry, output] of [
    ['compiler/worker.ts', 'compiler.mjs'],
    ['contracts/workbenchManifest.ts', 'manifest.mjs'],
    ['transfer/WorkbenchTransferArchive.ts', 'archive.mjs'],
    ['transfer/WorkbenchAssetTransfer.ts', 'assets.mjs'],
    ['transfer/WorkbenchDataSnapshot.ts', 'data-snapshot.mjs'],
  ]) {
    await build({ entryPoints: [join(repository, 'tooling', entry)], outfile: join(generated, output),
      bundle: true, packages: 'external', platform: 'node', format: 'esm', target: 'node22', logLevel: 'silent' });
  }
}

export async function readManifest(root = application) {
  const { workbenchManifestSchema } = await import('../.generated/manifest.mjs');
  const manifest = workbenchManifestSchema.parse(JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8')));
  if (!manifest.build) throw new Error('BUILD_PROFILE_REQUIRED: This template uses TypeScript source builds.');
  return manifest;
}

async function checkDependencies(root) {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const lock = parse(await readFile(join(root, 'pnpm-lock.yaml'), 'utf8'));
  if (lock.lockfileVersion !== '9.0' || !lock.importers?.['.']) throw new Error('APP_LOCKFILE_INVALID');
  for (const section of ['dependencies', 'devDependencies']) {
    const entries = pkg[section] ?? {};
    const locked = lock.importers['.'][section] ?? {};
    if (Object.keys(entries).length !== Object.keys(locked).length) throw new Error('APP_LOCKFILE_STALE');
    for (const [name, version] of Object.entries(entries)) {
      if (!/^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/i.test(name)) throw new Error('APP_DEPENDENCY_NAME_INVALID');
      if (locked[name]?.specifier !== version) throw new Error(`APP_LOCKFILE_STALE:${name}`);
      const installed = JSON.parse(await readFile(join(repository, 'node_modules', name, 'package.json'), 'utf8'));
      if (installed.version !== locked[name].version.split('(')[0]) throw new Error(`APP_DEPENDENCY_VERSION_MISMATCH:${name}`);
    }
  }
}

async function checkSourceTree(root, path = '') {
  for (const item of await readdir(join(root, path), { withFileTypes: true })) {
    const relative = path ? `${path}/${item.name}` : item.name;
    const stat = await lstat(join(root, relative));
    if (stat.isSymbolicLink()) throw new Error(`SOURCE_SYMLINK_UNSUPPORTED:${relative}`);
    if (!path && ['node_modules', 'dist', 'sdk', '.workbench-vite'].includes(item.name)) continue;
    if (stat.isDirectory()) await checkSourceTree(root, relative);
    else if (!stat.isFile()) throw new Error(`SOURCE_FILE_TYPE_INVALID:${relative}`);
  }
}

export async function checkApplication(root = application, onDiagnostic = (issue) =>
  console.error(`${issue.severity}: ${issue.path ?? ''}:${issue.line ?? ''} ${issue.code} ${issue.message}`)) {
  const manifest = await readManifest(root);
  await checkSourceTree(root);
  await checkDependencies(root);
  await readFile(join(root, 'REQUIREMENTS.md'), 'utf8');
  if (!(await lstat(join(root, manifest.migrations))).isDirectory()) throw new Error('MIGRATIONS_DIRECTORY_REQUIRED');
  await cp(join(generated, 'sdk'), join(root, 'sdk'), { recursive: true });
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const operation = await mkdtemp(join(generated, 'check-'));
  try {
    const reportPath = join(operation, 'report.json');
    const inputPath = join(operation, 'input.json');
    await writeFile(inputPath, JSON.stringify({ sourceDirectory: root, reportPath, manifest }));
    await runNode([join(generated, 'compiler.mjs'), inputPath]);
    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    for (const issue of report.diagnostics) onDiagnostic(issue);
    if (!report.passed) throw new Error('WORKBENCH_CHECK_FAILED');
    return manifest;
  } finally { await rm(operation, { recursive: true, force: true }); }
}
