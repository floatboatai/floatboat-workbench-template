// ABOUTME: 工作台构建进程的有界诊断和输入输出契约。

import { z } from 'zod';
import type { WorkbenchManifest } from './workbenchManifest';

export const workbenchCompilationDiagnosticSchema = z
  .object({
    code: z.string().max(120),
    message: z.string().max(4000),
    path: z.string().max(4096).optional(),
    line: z.number().int().positive().optional(),
    column: z.number().int().positive().optional(),
    severity: z.enum(['error', 'warning']),
    stage: z.enum(['prepare', 'typecheck', 'compile', 'structure']),
    retryable: z.boolean(),
  })
  .strict();

export const workbenchCompilationResultSchema = z
  .object({
    passed: z.boolean(),
    typecheck: z.enum(['passed', 'failed', 'not-applicable']),
    compilation: z.enum(['passed', 'failed', 'not-run']),
    diagnostics: z.array(workbenchCompilationDiagnosticSchema).max(100),
  })
  .strict();

export type WorkbenchCompilationDiagnostic = z.infer<typeof workbenchCompilationDiagnosticSchema>;
export type WorkbenchCompilationResult = z.infer<typeof workbenchCompilationResultSchema>;
export interface WorkbenchCompilationInput {
  readonly sourceDirectory: string;
  readonly reportPath: string;
  readonly manifest: WorkbenchManifest;
}
