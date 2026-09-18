// ABOUTME: 将编译器错误映射为有界的工作台源码诊断。

import { isAbsolute, relative, sep } from 'node:path';
import type ts from 'typescript';
import type { WorkbenchCompilationDiagnostic } from '../contracts/workbenchCompilation';

export function diagnostic(
  code: string,
  message: string,
  stage: WorkbenchCompilationDiagnostic['stage'],
  path?: string,
): WorkbenchCompilationDiagnostic {
  return {
    code,
    message: message.slice(0, 4000),
    stage,
    severity: 'error',
    retryable: true,
    ...(path ? { path } : {}),
  };
}

export function inside(root: string, file: string): boolean {
  const path = relative(root, file);
  return !isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`);
}

export function typeDiagnostic(
  typescript: typeof ts,
  issue: ts.Diagnostic,
  root: string,
): WorkbenchCompilationDiagnostic {
  const file = issue.file;
  const position = file?.getLineAndCharacterOfPosition(issue.start ?? 0);
  return {
    ...diagnostic(`TS${issue.code}`, typescript.flattenDiagnosticMessageText(issue.messageText, '\n'), 'typecheck'),
    ...(file && inside(root, file.fileName)
      ? {
          path: relative(root, file.fileName).replaceAll('\\', '/'),
          line: (position?.line ?? 0) + 1,
          column: (position?.character ?? 0) + 1,
        }
      : {}),
  };
}
