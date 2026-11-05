// ABOUTME: 工作台受管构建入口，不加载 App 构建配置、插件或业务代码。

import { readFile, writeFile, rm, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { isBuiltin } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build as buildServer } from 'esbuild';
import { build as buildPage } from 'vite';
import type { WorkbenchCompilationInput, WorkbenchCompilationResult } from '../contracts/workbenchCompilation';
import { checkTypes } from './typecheck';
import { diagnostic, inside } from './diagnostics';
import { checkPageEntry } from './page-entry';
import { prepareWorkbenchStaticAssets } from './static-assets';
import { transformWorkbenchPublicationCode, workbenchPublicationPlugin } from './publication-code';
import { workbenchSourceAccessSchema } from '../contracts/workbenchDistribution';
import { workbenchBrowserBoundary } from './browser-boundary';

const toolchain = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dependencyRoot = await realpath(join(toolchain, 'node_modules'));
const input = JSON.parse(await readFile(process.argv[2], 'utf8')) as WorkbenchCompilationInput;
const root = await realpath(input.sourceDirectory);
const publication = input.publication ? workbenchSourceAccessSchema.parse(input.publication.sourceAccess) : undefined;
if (!isAbsolute(root) || !isAbsolute(input.reportPath) || !input.manifest.build)
  throw new Error('WORKBENCH_COMPILER_INPUT_INVALID');
let result: WorkbenchCompilationResult = {
  passed: false,
  typecheck: 'failed',
  compilation: 'not-run',
  diagnostics: [],
};
let staticDirectory: string | false = false;
const operations = new Set<string>();
try {
  const issues = [
    ...checkPageEntry(root, input.manifest.build.staticAssets),
    ...checkTypes(root, toolchain, input.manifest, operations),
  ].slice(0, 100);
  result = { ...result, diagnostics: issues };
  if (!issues.some((issue) => issue.severity === 'error')) {
    result.typecheck = 'passed';
    result.compilation = 'failed';
    staticDirectory = await prepareWorkbenchStaticAssets(root, input.manifest.build.staticAssets);
    const serverResult = await buildServer({
      absWorkingDir: root,
      nodePaths: [join(toolchain, 'node_modules')],
      entryPoints: [input.manifest.build.server],
      outfile: join(root, input.manifest.server),
      bundle: true,
      ...(publication ? {} : { packages: 'external' as const }),
      ...(publication
        ? {
            banner: {
              js: 'import {createRequire as __workbenchCreateRequire} from "node:module"; const require = __workbenchCreateRequire(import.meta.url);',
            },
          }
        : {}),
      minify: Boolean(publication),
      metafile: Boolean(publication),
      platform: 'node',
      format: 'esm',
      target: 'node22',
      sourcemap: !publication,
      logLevel: 'silent',
      tsconfigRaw: { compilerOptions: { target: 'ES2022', useDefineForClassFields: true } },
      plugins: [
        {
          name: 'workbench-sdk',
          setup(build) {
            if (publication)
              build.onLoad({ filter: /.*/ }, async (args) => {
                const canonical = await realpath(args.path);
                if (!inside(root, canonical) && !inside(dependencyRoot, canonical))
                  throw new Error('WORKBENCH_RUNTIME_IMPORT_OUTSIDE_PROJECT');
                if (!inside(join(root, 'src'), canonical) || !/\.[cm]?[jt]sx?$/u.test(canonical)) return;
                return {
                  contents: transformWorkbenchPublicationCode(
                    await readFile(canonical, 'utf8'),
                    canonical,
                    toolchain,
                    publication,
                  ),
                  loader: 'js',
                  resolveDir: dirname(canonical),
                };
              });
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
    if (publication) {
      await rm(`${join(root, input.manifest.server)}.map`, { force: true });
      for (const output of Object.values(serverResult.metafile?.outputs ?? {}))
        for (const dependency of output.imports)
          if (
            dependency.external &&
            !isBuiltin(dependency.path) &&
            !/^\.\.\/\.\.\/sdk\/(?:runtime|host|database)\.mjs$/u.test(dependency.path)
          )
            throw new Error('WORKBENCH_RUNTIME_EXTERNAL_DEPENDENCY_UNSUPPORTED');
      if (
        serverResult.warnings.some((warning) =>
          ['unsupported-dynamic-import', 'unsupported-require-call'].includes(warning.id),
        )
      )
        throw new Error('WORKBENCH_RUNTIME_DYNAMIC_IMPORT_UNSUPPORTED');
    }
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
        sourcemap: !publication,
        minify: 'esbuild',
        // WASM 必须经同源 URL 加载；内联 data URL 会被 connect-src 拦截。
        assetsInlineLimit: (filePath) => (filePath.endsWith('.wasm') ? false : undefined),
        rollupOptions: { input: join(root, input.manifest.build.ui) },
      },
      plugins: [
        workbenchBrowserBoundary(root, toolchain),
        ...(publication ? [workbenchPublicationPlugin(root, toolchain, publication)] : []),
      ],
      worker: {
        format: 'es',
        plugins: () => [
          workbenchBrowserBoundary(root, toolchain),
          ...(publication ? [workbenchPublicationPlugin(root, toolchain, publication)] : []),
        ],
      },
    });
    result.passed = true;
    result.compilation = 'passed';
    result.operations = [...operations].sort().slice(0, 256);
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
