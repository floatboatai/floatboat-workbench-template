// ABOUTME: 对自有业务模块执行发布转换，保留模块与数据协议，避免混淆第三方依赖。
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { extname, join } from 'node:path';
import { transformSync, type Loader } from 'esbuild';
import type { Plugin } from 'vite';
import type { WorkbenchSourceAccess } from '../contracts/workbenchDistribution';
import { inside } from './diagnostics';

interface Obfuscator {
  obfuscate(code: string, options: Record<string, unknown>): { getObfuscatedCode(): string };
}
export function transformWorkbenchPublicationCode(
  code: string,
  id: string,
  toolchain: string,
  sourceAccess: WorkbenchSourceAccess,
): string {
  const extension = extname(id).slice(1);
  const loader: Loader =
    extension === 'tsx' ? 'tsx' : ['ts', 'mts'].includes(extension) ? 'ts' : extension === 'jsx' ? 'jsx' : 'js';
  const transformed = transformSync(code, {
    loader,
    target: 'es2022',
    format: 'esm',
    jsx: 'automatic',
    sourcemap: false,
    minify: sourceAccess === 'available',
    legalComments: 'inline',
  }).code;
  if (sourceAccess === 'available') return transformed;
  const require = createRequire(join(toolchain, 'package.json'));
  const obfuscator = require('javascript-obfuscator') as Obfuscator;
  return obfuscator
    .obfuscate(transformed, {
      target: 'browser-no-eval',
      compact: true,
      identifierNamesGenerator: 'hexadecimal',
      seed: createHash('sha256').update(transformed).digest().readUInt32BE(0) || 1,
      ignoreImports: true,
      reservedStrings: ['^__VITE_.*__$'],
      renameGlobals: false,
      renameProperties: false,
      stringArray: true,
      stringArrayEncoding: ['base64'],
      stringArrayThreshold: 0.5,
      controlFlowFlattening: false,
      deadCodeInjection: false,
      debugProtection: false,
      selfDefending: false,
      disableConsoleOutput: false,
      sourceMap: false,
      numbersToExpressions: false,
      splitStrings: false,
      unicodeEscapeSequence: false,
    })
    .getObfuscatedCode();
}

export function workbenchPublicationPlugin(
  root: string,
  toolchain: string,
  sourceAccess: WorkbenchSourceAccess,
): Plugin {
  return {
    name: 'workbench-publication-code',
    enforce: 'post',
    transform(code, id) {
      const file = id.split('?')[0];
      if (!inside(join(root, 'src'), file) || !/\.[cm]?[jt]sx?$/u.test(file)) return null;
      return { code: transformWorkbenchPublicationCode(code, file, toolchain, sourceAccess), map: null };
    },
  };
}
