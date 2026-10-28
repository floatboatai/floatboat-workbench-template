// ABOUTME: 工作台受管构建入口，不加载 App 构建配置、插件或业务代码。

import { readFile, writeFile, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as buildServer } from 'esbuild';
import { build as buildPage } from 'vite';
import type { WorkbenchCompilationInput, WorkbenchCompilationResult } from '../contracts/workbenchCompilation';
import { checkTypes } from './typecheck';
import { diagnostic, inside } from './diagnostics';
import { checkPageEntry } from './page-entry';
import { prepareWorkbenchStaticAssets } from './static-assets';
import { workbenchBrowserBoundary } from './browser-boundary';

const toolchain = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const input = JSON.parse(await readFile(process.argv[2], 'utf8')) as WorkbenchCompilationInput;
const root = input.sourceDirectory;
if (!isAbsolute(root) || !isAbsolute(input.reportPath) || !input.manifest.build)
  throw new Error('WORKBENCH_COMPILER_INPUT_INVALID');
let result: WorkbenchCompilationResult = {
  passed: false,
  typecheck: 'failed',
  compilation: 'not-run',
  diagnostics: [],
};
let staticDirectory: string | false = false;
try {
  const issues = [
    ...checkPageEntry(root, input.manifest.build.staticAssets),
    ...checkTypes(root, toolchain, input.manifest),
  ].slice(0, 100);
  result = { ...result, diagnostics: issues };
  if (!issues.some((issue) => issue.severity === 'error')) {
    result.typecheck = 'passed';
    result.compilation = 'failed';
    staticDirectory = await prepareWorkbenchStaticAssets(root, input.manifest.build.staticAssets);
    await buildServer({
      absWorkingDir: root,
      entryPoints: [input.manifest.build.server],
      outfile: join(root, input.manifest.server),
      bundle: true,
      packages: 'external',
      platform: 'node',
      format: 'esm',
      target: 'node22',
      sourcemap: true,
      logLevel: 'silent',
      tsconfigRaw: { compilerOptions: { target: 'ES2022', useDefineForClassFields: true } },
      plugins: [
        {
          name: 'workbench-sdk',
          setup(build) {
            build.onResolve({ filter: /sdk\/(?:runtime|host|database)\.mjs$/ }, (args) => {
              const target = resolve(args.resolveDir, args.path);
              if (!inside(join(root, 'sdk'), target)) throw new Error('WORKBENCH_SDK_IMPORT_INVALID');
              return {
                path: relative(dirname(join(root, input.manifest.server)), target).replaceAll('\\', '/'),
                external: true,
              };
            });
          },
        },
      ],
    });
    await buildPage({
      root,
      configFile: false,
      envFile: false,
      publicDir: staticDirectory,
      logLevel: 'silent',
      cacheDir: join(root, '.workbench-vite'),
      css: { postcss: { plugins: [] } },
      esbuild: {
        tsconfigRaw: { compilerOptions: { jsx: 'react-jsx', target: 'ES2022', useDefineForClassFields: true } },
      },
      build: {
        outDir: join(root, input.manifest.ui),
        emptyOutDir: true,
        sourcemap: true,
        minify: 'esbuild',
        // WASM 必须经同源 URL 加载；内联 data URL 会被 connect-src 拦截。
        assetsInlineLimit: (filePath) => (filePath.endsWith('.wasm') ? false : undefined),
        rollupOptions: { input: join(root, input.manifest.build.ui) },
      },
      plugins: [workbenchBrowserBoundary(root, toolchain)],
      worker: { format: 'es', plugins: () => [workbenchBrowserBoundary(root, toolchain)] },
    });
    result.passed = true;
    result.compilation = 'passed';
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const details = error as {
    errors?: { location?: { file?: string; line?: number; column?: number } }[];
    id?: string;
  } | null;
  const location =
    error && typeof error === 'object' && 'loc' in error
      ? (error.loc as { file?: string; line?: number; column?: number })
      : details?.errors?.[0]?.location;
  const file = location?.file ?? details?.id;
  const path = file ? resolve(root, file) : undefined;
  result.diagnostics = [
    {
      ...diagnostic(
        'WORKBENCH_COMPILATION_FAILED',
        message.replaceAll(root, '.'),
        result.typecheck === 'passed' ? 'compile' : 'typecheck',
        path && inside(root, path) ? relative(root, path) : undefined,
      ),
      ...(location?.line ? { line: location.line, column: (location.column ?? 0) + 1 } : {}),
    },
    ...result.diagnostics,
  ].slice(0, 100);
}
if (staticDirectory) await rm(staticDirectory, { recursive: true, force: true });
await writeFile(input.reportPath, JSON.stringify(result));
