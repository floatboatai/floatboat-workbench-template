// ABOUTME: 外部 Agent 与开发者共用的工作台创作命令入口。
import { parseArgs } from 'node:util';
import { readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { application, repository, prepareTools, checkApplication, readManifest, runNode } from './build.mjs';
import { startPreview } from './preview.mjs';
import { exportApplication } from './package.mjs';

export async function initializeApplication({ registry, name, description }, root = application) {
  const current = await readManifest(root);
  if (current.appId !== 'workbench.starter') throw new Error('ALREADY_INITIALIZED: Edit app/manifest.json directly; existing identity is preserved.');
  if (!registry || !name || !description) throw new Error('INIT_FIELDS_REQUIRED: --registry, --name and --description');
  const { workbenchManifestSchema } = await import('../.generated/manifest.mjs');
  const manifest = workbenchManifestSchema.parse({ ...current, appId: `workbench.${randomUUID()}`, registryName: registry, name, description });
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(registry)) throw new Error('READABLE_REGISTRY_NAME_REQUIRED');
  await writeFile(join(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export async function main(args) {
  const [command = 'help', ...rest] = args;
  const { values } = parseArgs({ args: rest.filter((arg) => arg !== '--'), options: {
    registry: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' }, output: { type: 'string' },
  }, strict: true });
  if (!['init', 'check', 'preview', 'pack', 'test'].includes(command)) {
    console.log('Commands: init --registry my-app --name "My App" --description "Purpose" | check | preview | pack [--output /absolute/app.fbworkbench] | test');
    if (command !== 'help') process.exitCode = 1;
    return;
  }
  await prepareTools();
  if (command === 'init') {
    const manifest = await initializeApplication(values);
    console.log(`Initialized ${manifest.registryName}. Edit app/REQUIREMENTS.md before implementing the business flow.`);
  } else if (command === 'check') {
    await checkApplication();
    console.log('Manifest, dependencies, types and build passed.');
  } else if (command === 'test') {
    await checkApplication();
    const files = (await readdir(join(application, 'tests'))).filter((name) => name.endsWith('.test.ts'));
    await runNode(['--experimental-strip-types', '--disable-warning=ExperimentalWarning', '--test', ...files.map((name) => join(application, 'tests', name))]);
  } else if (command === 'pack') {
    const manifest = await readManifest();
    const destination = values.output ?? join(repository, 'artifacts', `${manifest.registryName ?? 'workbench'}-${manifest.version}.fbworkbench`);
    const result = await exportApplication(destination);
    console.log(`Application package: ${destination}\n${result.files.length} source files; no preview data included.`);
  } else {
    await checkApplication();
    const preview = await startPreview();
    let stopRequested = false;
    const shutdown = () => { if (!stopRequested) { stopRequested = true; void preview.stop(); } };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    console.log(`Local preview: ${preview.browserUrl}\nPlatform: not connected. Ctrl+C stops the service. Restart this command after source changes.`);
    const result = await preview.closed;
    process.removeListener('SIGINT', shutdown);
    process.removeListener('SIGTERM', shutdown);
    if (result.code !== 0 && !stopRequested) throw new Error(`PREVIEW_STOPPED_UNEXPECTEDLY: ${result.signal ?? result.code}\n${preview.logs()}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
