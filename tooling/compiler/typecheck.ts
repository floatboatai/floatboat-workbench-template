// ABOUTME: 在明确的源码和工具链范围内检查 TS，并识别跨端导入及维护问题。

import ts from 'typescript';
import { builtinModules } from 'node:module';
import { join, relative, resolve } from 'node:path';
import type { WorkbenchManifest } from '../contracts/workbenchManifest';
import type { WorkbenchCompilationDiagnostic } from '../contracts/workbenchCompilation';
import { diagnostic, inside, typeDiagnostic } from './diagnostics';
import { checkModuleCycles } from './module-structure';

const nodeModules = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));

export function checkTypes(
  root: string,
  toolchain: string,
  manifest: WorkbenchManifest,
): WorkbenchCompilationDiagnostic[] {
  const configPath = join(root, 'tsconfig.json');
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) return [typeDiagnostic(ts, config.error, root)];
  const supplied = config.config as { compilerOptions?: Record<string, unknown>; include?: unknown };
  const fixed: Record<string, unknown> = {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'Bundler',
    strict: true,
    noEmit: true,
    jsx: 'react-jsx',
    skipLibCheck: true,
    allowImportingTsExtensions: true,
  };
  if (
    Object.keys(supplied).some((key) => !['compilerOptions', 'include'].includes(key)) ||
    JSON.stringify(supplied.include ?? ['src']) !== JSON.stringify(['src']) ||
    Object.entries(supplied.compilerOptions ?? {}).some(([key, value]) => value !== fixed[key])
  )
    return [
      diagnostic(
        'WORKBENCH_TSCONFIG_UNSUPPORTED',
        '构建配置由 Host 管理；请保留 strict，并使用受支持的声明式选项。',
        'prepare',
        'tsconfig.json',
      ),
    ];
  const base: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    jsx: ts.JsxEmit.ReactJSX,
    allowImportingTsExtensions: true,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts', 'lib.dom.asynciterable.d.ts'],
    typeRoots: [join(root, 'node_modules/@types'), join(toolchain, 'node_modules/@types')],
  };
  const files = ts.sys.readDirectory(join(root, 'src'), ['.ts', '.tsx', '.mts']);
  if (!manifest.build) return [];
  const serverDirectory = join(root, 'src/server');
  const results: WorkbenchCompilationDiagnostic[] = [];
  for (const kind of ['server', 'browser'] as const) {
    const entryFiles =
      kind === 'server'
        ? [
            ...new Set([
              resolve(root, manifest.build.server),
              ...files.filter((file) => !inside(join(root, 'src/ui'), file)),
            ]),
          ]
        : files.filter((file) => inside(join(root, 'src/ui'), file));
    const options = { ...base, types: kind === 'server' ? ['node'] : ['react', 'react-dom'] };
    const host = ts.createCompilerHost(options);
    const readFile = host.readFile;
    host.readFile = (file) =>
      inside(root, resolve(file)) || inside(toolchain, resolve(file)) ? readFile(file) : undefined;
    const program = ts.createProgram(entryFiles, options, host);
    results.push(...ts.getPreEmitDiagnostics(program).map((issue) => typeDiagnostic(ts, issue, root)));
    results.push(...checkModuleCycles(program, root, options, host));
    for (const file of program.getSourceFiles()) {
      if (!inside(root, file.fileName) || file.isDeclarationFile || file.fileName.includes('/node_modules/')) continue;
      const path = relative(root, file.fileName).replaceAll('\\', '/');
      if (
        kind === 'browser' &&
        (inside(serverDirectory, file.fileName) || /\/sdk\/(?:runtime|host|database)\./.test(file.fileName))
      )
        results.push(
          diagnostic(
            'WORKBENCH_BROWSER_SERVER_IMPORT',
            '浏览器页面不得导入服务端、数据库或 Host SDK 实现。',
            'typecheck',
            path,
          ),
        );
      const visit = (node: ts.Node) => {
        if (
          ts.isCallExpression(node) &&
          (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
            (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
        ) {
          const argument = node.arguments[0];
          if (!argument || !ts.isStringLiteral(argument))
            results.push(
              diagnostic(
                'WORKBENCH_DYNAMIC_IMPORT_UNSUPPORTED',
                '动态导入使用固定字符串路径，使构建能检查依赖边界。',
                'typecheck',
                path,
              ),
            );
          else if (kind === 'browser' && (nodeModules.has(argument.text) || argument.text.startsWith('node:')))
            results.push(
              diagnostic('WORKBENCH_BROWSER_SERVER_IMPORT', `浏览器不能使用 ${argument.text}`, 'typecheck', path),
            );
        }
        if (
          kind === 'browser' &&
          ((ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) ||
            (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)))
        ) {
          const specifier = (node.moduleSpecifier as ts.StringLiteral).text;
          if (nodeModules.has(specifier) || /(?:^|\/)sdk\/(?:runtime|host|database)\.mjs$/.test(specifier)) {
            const location = file.getLineAndCharacterOfPosition(node.getStart(file));
            results.push({
              ...diagnostic('WORKBENCH_BROWSER_SERVER_IMPORT', `浏览器不能使用 ${specifier}`, 'typecheck', path),
              line: location.line + 1,
              column: location.character + 1,
            });
          }
        }
        if (node.kind === ts.SyntaxKind.AnyKeyword) {
          const location = file.getLineAndCharacterOfPosition(node.getStart(file));
          results.push({
            ...diagnostic('WORKBENCH_EXPLICIT_ANY', '请使用明确类型或 unknown 并完成运行时校验。', 'typecheck', path),
            line: location.line + 1,
            column: location.character + 1,
          });
        }
        ts.forEachChild(node, visit);
      };
      if (!path.startsWith('sdk/')) {
        visit(file);
        const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, file.languageVariant, file.text);
        let suppressed = false;
        for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
          if (
            [ts.SyntaxKind.SingleLineCommentTrivia, ts.SyntaxKind.MultiLineCommentTrivia].includes(token) &&
            /@ts-(?:ignore|nocheck|expect-error)\b/.test(scanner.getTokenText())
          )
            suppressed = true;
        }
        if (suppressed)
          results.push(
            diagnostic('WORKBENCH_TYPECHECK_SUPPRESSION', '不得通过关闭类型检查掩盖问题。', 'typecheck', path),
          );
        if (file.getLineAndCharacterOfPosition(file.end).line > 450)
          results.push({
            ...diagnostic('WORKBENCH_LARGE_MODULE', '该文件较大，请检查是否混合了多个业务职责。', 'structure', path),
            severity: 'warning',
          });
      }
    }
  }
  return [...new Map(results.map((result) => [JSON.stringify(result), result])).values()]
    .sort((a, b) => Number(a.severity === 'warning') - Number(b.severity === 'warning'))
    .slice(0, 100);
}
