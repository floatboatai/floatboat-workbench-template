// ABOUTME: 工作台 manifest、安装记录与本地运行状态的跨进程契约。

import { z } from 'zod';
import { workbenchBrowserPolicySchema, workbenchStaticAssetSchema } from './workbenchBrowserPolicy';
import { workbenchServiceDeclarationSchema } from './workbenchConnections';
import { workbenchDependencySchema, workbenchResourceSchema, validateWorkbenchAssetDeclarations } from './workbenchAssets';
export const WORKBENCH_REGISTRY_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{0,126}[a-z0-9])?$/u;
export const WORKBENCH_STORE_SEMVER_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u;

export const workbenchRegistryNameSchema = z
  .string()
  .regex(WORKBENCH_REGISTRY_NAME_PATTERN, 'registryName 只能含小写字母、数字、连字符和下划线');
export const workbenchStoreSemverSchema = z
  .string()
  .max(64)
  .regex(WORKBENCH_STORE_SEMVER_PATTERN, '必须使用严格 SemVer');



export const WORKBENCH_SDK_VERSION = '1.0.0';
export const WORKBENCH_RUNTIME_PROFILE = 'node22-sqlite-v1';
export const WORKBENCH_BUILD_PROFILE = 'typescript-react-v1';
export const WORKBENCH_MAX_SOURCE_BYTES = 100 * 1024 * 1024;

const relativePath = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (value) =>
      !value.startsWith('/') &&
      !value.includes('\\') &&
      !value.includes(':') &&
      !value.split('/').some((part) => part === '..' || part === '.' || !part),
    '必须使用工程内的相对路径',
  );
const contributionId = z.string().regex(/^[a-z][a-z0-9.-]{0,79}$/u);
export const workbenchBuildConfigurationSchema = z
  .object({
    profile: z.literal(WORKBENCH_BUILD_PROFILE),
    server: relativePath
      .refine((value) => /^src\/server\/.+\.(?:ts|mts)$/.test(value), '服务端源码必须为 src/server/ 下的 TypeScript')
      .default('src/server/index.ts'),
    ui: z.literal('index.html').default('index.html'),
    staticAssets: z.array(workbenchStaticAssetSchema).max(16).optional(),
  })
  .strict();
const contributionTarget = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('page'), path: z.string().startsWith('/').default('/') }).strict(),
  z.object({ kind: z.literal('action'), action: contributionId }).strict(),
]);

export const workbenchContributionSchema = z
  .object({
    id: contributionId,
    title: z.string().trim().min(1).max(100),
    titleEn: z.string().trim().min(1).max(100).optional(),
    placement: z.enum(['command', 'sidebar', 'toolbar', 'panel']),
    icon: z.enum(['layout', 'table', 'chart', 'calendar', 'play', 'file', 'activity']).default('layout'),
    target: contributionTarget,
  })
  .strict();

export const workbenchManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    appId: z.string().regex(/^[a-z0-9][a-z0-9.-]{2,127}$/u),
    minDesktopVersion: workbenchStoreSemverSchema.optional(),
    registryName: workbenchRegistryNameSchema.optional(),
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2000).optional(),
    changelog: z.string().trim().max(10000).optional(),
    version: z.string().regex(/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/u),
    sdkVersion: z.literal(WORKBENCH_SDK_VERSION),
    runtime: z.literal(WORKBENCH_RUNTIME_PROFILE),
    build: workbenchBuildConfigurationSchema.optional(),
    browser: workbenchBrowserPolicySchema.optional(),
    server: relativePath,
    ui: relativePath,
    migrations: relativePath,
    capabilities: z
      .array(z.enum(['llm', 'agent', 'asr', 'workflows', 'connected-services', 'calendar', 'automation', 'workspaces']))
      .max(8)
      .refine((values) => new Set(values).size === values.length, '能力声明不能重复')
      .default([]),
    dependencies: z.array(workbenchDependencySchema).max(64).optional(),
    resources: z.array(workbenchResourceSchema).max(64).optional(),
    connectedServices: z.array(workbenchServiceDeclarationSchema).max(32).optional(),
    contributions: z.array(workbenchContributionSchema).max(30).default([]),
    license: z.string().max(100).optional(),
  })
  .strict()
  .superRefine((manifest, context) => {
    validateWorkbenchAssetDeclarations(manifest, context);
    if (manifest.connectedServices?.length && !manifest.capabilities.includes('connected-services'))
      context.addIssue({ code: 'custom', path: ['connectedServices'], message: '服务声明需要 connected-services 能力' });
    const services = manifest.connectedServices?.map(item => item.id) ?? [];
    if (new Set(services).size !== services.length)
      context.addIssue({ code: 'custom', path: ['connectedServices'], message: '服务逻辑标识不能重复' });
    if (manifest.build && (manifest.server !== 'dist/server/index.mjs' || manifest.ui !== 'dist/ui'))
      context.addIssue({
        code: 'custom',
        path: ['build'],
        message: '受管构建的运行入口必须为 dist/server/index.mjs 和 dist/ui',
      });
    const ids = new Set<string>();
    manifest.contributions.forEach((contribution, index) => {
      if (ids.has(contribution.id))
        context.addIssue({ code: 'custom', path: ['contributions', index, 'id'], message: '贡献标识重复' });
      ids.add(contribution.id);
      if (
        contribution.target.kind === 'page' &&
        (contribution.target.path.startsWith('//') || contribution.target.path.includes('\\'))
      ) {
        context.addIssue({
          code: 'custom',
          path: ['contributions', index, 'target'],
          message: '页面必须归属于当前 App',
        });
      }
    });
  });

export type WorkbenchManifest = z.infer<typeof workbenchManifestSchema>;
export type WorkbenchContribution = z.infer<typeof workbenchContributionSchema>;
