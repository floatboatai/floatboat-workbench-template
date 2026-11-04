// ABOUTME: 源码开放策略与安装选择独立；运行包身份绑定审核源码、工具链与兼容范围。
import { z } from 'zod';
import { WORKBENCH_RUNTIME_PROFILE, WORKBENCH_SDK_VERSION } from './workbenchManifest';

export const workbenchSourceAccessSchema = z.enum(['available', 'restricted']);
export type WorkbenchSourceAccess = z.infer<typeof workbenchSourceAccessSchema>;
export const workbenchInstallModeSchema = z.enum(['runtime', 'editable']);
export type WorkbenchInstallMode = z.infer<typeof workbenchInstallModeSchema>;
export const WORKBENCH_RUNTIME_PACKAGE_VERSION = 1;
export const WORKBENCH_OBFUSCATION_PROFILE = 'business-compatible-v1';
export const workbenchRuntimeIdentitySchema = z
  .object({
    formatVersion: z.literal(WORKBENCH_RUNTIME_PACKAGE_VERSION),
    runtime: z.literal(WORKBENCH_RUNTIME_PROFILE),
    sdkVersion: z.literal(WORKBENCH_SDK_VERSION),
    sourceTreeHash: z.string().regex(/^[a-f0-9]{64}$/u),
    toolchainId: z.string().regex(/^[a-f0-9]{64}$/u),
    sourceAccess: workbenchSourceAccessSchema,
    protection: z.enum(['minified', WORKBENCH_OBFUSCATION_PROFILE]),
    platform: z.literal('portable-js'),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.sourceAccess === 'restricted' && value.protection !== WORKBENCH_OBFUSCATION_PROFILE)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['protection'],
        message: 'WORKBENCH_RUNTIME_PROTECTION_REQUIRED',
      });
  });
export type WorkbenchRuntimeIdentity = z.infer<typeof workbenchRuntimeIdentitySchema>;

export function requireWorkbenchSourceAccess(access: WorkbenchSourceAccess, isOwner = false): void {
  if (access === 'restricted' && !isOwner) throw new Error('WORKBENCH_SOURCE_ACCESS_DENIED');
}
