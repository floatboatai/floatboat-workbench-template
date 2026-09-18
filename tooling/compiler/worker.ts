// ABOUTME: 工作台受管构建入口，不加载 App 构建配置、插件或业务代码。

import { readFile, writeFile } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as buildServer } from 'esbuild';
import { build as buildPage } from 'vite';
import type { WorkbenchCompilationInput, WorkbenchCompilationResult } from '../contracts/workbenchCompilation';
import { checkTypes } from './typecheck';
import { diagnostic, inside } from './diagnostics';
import { checkPageEntry } from './page-entry';

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
try {
  const issues = [...checkPageEntry(root), ...checkTypes(root, toolchain, input.manifest)].slice(0, 100);
  result = { ...result, diagnostics: issues };
  if (!issues.some((issue) => issue.severity === 'error')) {
    result.typecheck = 'passed';
    result.compilation = 'failed';
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
    const nodeNames = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));
    await buildPage({
      root,
      configFile: false,
      envFile: false,
      publicDir: false,
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
        rollupOptions: { input: join(root, input.manifest.build.ui) },
      },
      plugins: [
        {
          name: 'workbench-browser-boundary',
          enforce: 'pre',
          load(id) {
            const file = id.split('?')[0];
            if (
              isAbsolute(file) &&
              ((!inside(root, file) && !inside(toolchain, file)) || /\.(?:scss|sass|less|styl)$/u.test(file))
            )
              throw new Error('WORKBENCH_PAGE_RESOURCE_UNSUPPORTED');
            return null;
          },
          resolveId(source, importer) {
            if (nodeNames.has(source) || source.startsWith('node:'))
              throw new Error(`WORKBENCH_BROWSER_SERVER_IMPORT:${source}`);
            if (importer && source.startsWith('.')) {
              const target = resolve(dirname(importer), source);
              // 独立工程的依赖装在仓库根，只允许依赖之间在该目录内解析。
              const dependencyImport =
                inside(join(toolchain, 'node_modules'), importer.split('?')[0]) &&
                inside(join(toolchain, 'node_modules'), target);
              if (
                (!inside(root, target) && !dependencyImport) ||
                inside(join(root, 'src/server'), target) ||
                /\/sdk\/(?:runtime|host|database)\./.test(target.replaceAll('\\', '/'))
              )
                throw new Error(`WORKBENCH_BROWSER_SERVER_IMPORT:${source}`);
            }
            return null;
          },
        },
      ],
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
await writeFile(input.reportPath, JSON.stringify(result));
