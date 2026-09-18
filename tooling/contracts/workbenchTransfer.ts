// ABOUTME: 工作台离线交付协议；迁移历史只有限制作用，不携带 Host 授权。
import { z } from 'zod';
import { WORKBENCH_RUNTIME_PROFILE, WORKBENCH_SDK_VERSION } from './workbenchManifest';

const digest = z.string().regex(/^[a-f0-9]{64}$/u);
export const transferHistorySchema = z
  .object({
    version: z.literal(1),
    coverage: z.enum(['complete', 'unknown']),
    entries: z
      .array(
        z
          .object({
            operation: z.string().max(100),
            keyHash: digest,
            fingerprint: digest,
            idempotent: z.boolean().default(true),
            resultRefs: z.array(z.string().max(200)).max(1000).optional(),
          })
          .strict(),
      )
      .max(100_000),
  })
  .strict();
export type WorkbenchTransferHistory = z.infer<typeof transferHistorySchema>;
export const transferManifestSchema = z
  .object({
    formatVersion: z.literal(1),
    packageId: digest,
    kind: z.enum(['application', 'migration']),
    sourceAppId: z.string().regex(/^[a-z0-9][a-z0-9.-]{2,127}$/u),
    name: z.string().min(1).max(120),
    version: z.string().max(100),
    runtime: z.literal(WORKBENCH_RUNTIME_PROFILE),
    sdkVersion: z.literal(WORKBENCH_SDK_VERSION),
    exportedAt: z.string().datetime(),
    files: z
      .array(
        z.object({ path: z.string().min(1).max(512), size: z.number().int().nonnegative(), sha256: digest }).strict(),
      )
      .max(110_002),
  })
  .strict();
export type WorkbenchTransferManifest = z.infer<typeof transferManifestSchema>;
