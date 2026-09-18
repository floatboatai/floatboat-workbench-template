// ABOUTME: 检查本地运行时模块循环；类型引用不计入运行依赖图。

import ts from 'typescript';
import { join, relative } from 'node:path';
import type { WorkbenchCompilationDiagnostic } from '../contracts/workbenchCompilation';
import { diagnostic, inside } from './diagnostics';

export function checkModuleCycles(
  program: ts.Program,
  root: string,
  options: ts.CompilerOptions,
  host: ts.ModuleResolutionHost,
): WorkbenchCompilationDiagnostic[] {
  const graph = new Map<string, string[]>();
  for (const file of program.getSourceFiles()) {
    if (file.isDeclarationFile || !inside(join(root, 'src'), file.fileName)) continue;
    const imports: string[] = [];
    for (const node of file.statements) {
      if (
        ((ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly) ||
          (ts.isExportDeclaration(node) && !node.isTypeOnly)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const resolved = ts.resolveModuleName(node.moduleSpecifier.text, file.fileName, options, host).resolvedModule
          ?.resolvedFileName;
        if (resolved && inside(join(root, 'src'), resolved)) imports.push(resolved);
      }
    }
    graph.set(file.fileName, imports);
  }
  const visited = new Set<string>();
  const stack = new Set<string>();
  const issues: WorkbenchCompilationDiagnostic[] = [];
  const visit = (path: string): void => {
    if (stack.has(path)) {
      issues.push({
        ...diagnostic(
          'WORKBENCH_CIRCULAR_DEPENDENCY',
          `运行时模块存在循环引用：${relative(root, path)}；检查业务职责或提取共享契约。`,
          'structure',
          relative(root, path),
        ),
        severity: 'warning',
      });
      return;
    }
    if (visited.has(path)) return;
    visited.add(path);
    stack.add(path);
    for (const next of graph.get(path) ?? []) visit(next);
    stack.delete(path);
  };
  for (const path of graph.keys()) visit(path);
  return issues.slice(0, 100);
}
