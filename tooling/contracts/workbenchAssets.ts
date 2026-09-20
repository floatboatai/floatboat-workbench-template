// ABOUTME: 工作台逻辑依赖、资源和可分发锁清单；本机绑定独立于 manifest 与归档。
import { z } from 'zod';
const key = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/u);
export const workbenchRelativeResourcePath = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (value) =>
      !/[\\:]/u.test(value) &&
      ![...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) &&
      !value.startsWith('/') &&
      !value.split('/').some((part) => !part || part === '.' || part === '..'),
    '必须使用安全相对路径',
  );
export const workbenchDependencySchema = z
  .object({
    id: key,
    label: z.string().trim().min(1).max(120).optional(),
    kind: z.enum(['workflow', 'combo']),
    required: z.boolean().default(true),
    source: z.discriminatedUnion('type', [
      z.object({ type: z.literal('binding') }).strict(),
      z.object({ type: z.literal('bundle'), path: workbenchRelativeResourcePath }).strict(),
      z
        .object({
          type: z.literal('registry'),
          name: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,127}$/u),
          version: z
            .string()
            .max(100)
            .regex(/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/u, '依赖需要精确版本'),
        })
        .strict(),
    ]),
    requires: z.array(key).max(64).default([]),
  })
  .strict();
export const workbenchResourceSchema = z
  .object({
    id: key,
    label: z.string().trim().min(1).max(120).optional(),
    kind: z.enum(['file', 'directory']),
    role: z.enum(['asset', 'data']),
    location: z.enum(['project', 'data', 'external']),
    path: workbenchRelativeResourcePath.optional(),
    access: z.enum(['read', 'read-write']).default('read'),
    transfer: z.enum(['snapshot', 'rebind']).default('snapshot'),
    required: z.boolean().default(true),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.location === 'external') === Boolean(value.path))
      context.addIssue({
        code: 'custom',
        path: ['path'],
        message: '本机目录只在绑定中登记；工程和数据资源需要相对路径',
      });
    if (value.role === 'asset' && value.access !== 'read')
      context.addIssue({ code: 'custom', path: ['access'], message: '应用固定资源为只读' });
    if (value.location === 'project' && value.role !== 'asset')
      context.addIssue({ code: 'custom', path: ['role'], message: '业务数据应保存在数据目录或显式外部绑定中' });
    if (value.location === 'data' && value.role !== 'data')
      context.addIssue({ code: 'custom', path: ['role'], message: '固定资源应放在工程目录或显式外部绑定中' });
    if (value.location !== 'external' && value.transfer === 'rebind')
      context.addIssue({ code: 'custom', path: ['transfer'], message: '只有外部资源需要重新绑定' });
  });
export type WorkbenchDependency = z.infer<typeof workbenchDependencySchema>;
export type WorkbenchResource = z.infer<typeof workbenchResourceSchema>;
export function validateWorkbenchAssetDeclarations(
  value: { dependencies?: WorkbenchDependency[]; resources?: WorkbenchResource[] },
  context: z.RefinementCtx,
): void {
  const dependencies = value.dependencies ?? [];
  for (const section of ['dependencies', 'resources'] as const) {
    const ids = new Set<string>();
    for (const [index, entry] of (value[section] ?? []).entries()) {
      if (ids.has(entry.id))
        context.addIssue({ code: 'custom', path: [section, index, 'id'], message: '逻辑标识不能重复' });
      ids.add(entry.id);
    }
  }
  const byId = new Map(dependencies.map((item) => [item.id, item]));
  const visited = new Set<string>();
  const active = new Set<string>();
  const visit = (id: string): boolean => {
    if (active.has(id) || !byId.has(id)) return false;
    if (visited.has(id)) return true;
    active.add(id);
    for (const next of byId.get(id)!.requires) if (!visit(next)) return false;
    active.delete(id);
    visited.add(id);
    return true;
  };
  if (dependencies.some((item) => !visit(item.id)))
    context.addIssue({ code: 'custom', path: ['dependencies'], message: '依赖图包含缺失引用或循环' });
}
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
export const workbenchAssetLockSchema = z
  .object({
    version: z.literal(1),
    dependencies: z
      .array(
        z
          .object({
            id: key,
            kind: z.enum(['workflow', 'combo']),
            version: z.string().max(100).optional(),
            status: z.enum(['bundled', 'reference', 'missing']),
            sha256: digest.optional(),
            contentHash: digest.optional(),
            file: workbenchRelativeResourcePath.optional(),
          })
          .strict(),
      )
      .max(64),
    resources: z
      .array(
        z
          .object({
            id: key,
            status: z.enum(['bundled', 'rebind', 'excluded', 'missing']),
            directory: workbenchRelativeResourcePath.optional(),
            sha256: digest.optional(),
            bytes: z.number().int().nonnegative().default(0),
            files: z.number().int().nonnegative().default(0),
          })
          .strict(),
      )
      .max(64),
  })
  .strict();
export type WorkbenchAssetLock = z.infer<typeof workbenchAssetLockSchema>;
export interface WorkbenchLocalBindings {
  resources?: Record<string, { path: string; ownership: 'external' | 'managed' }>;
  dependencies?: Record<
    string,
    {
      kind: 'workflow' | 'combo';
      localId: string;
      sha256: string;
      sourceHash?: string;
      version?: string;
      owned: boolean;
    }
  >;
}
export interface WorkbenchAssetStatus {
  id: string;
  label: string;
  type: 'resource' | 'workflow' | 'combo';
  required: boolean;
  status: 'ready' | 'missing' | 'changed' | 'needs-trust' | 'unavailable';
  path?: string;
  localId?: string;
  version?: string;
  transfer?: 'snapshot' | 'rebind';
}
export interface WorkbenchDependencyCandidate {
  id: string;
  kind: 'workflow' | 'combo';
  name: string;
  version?: string;
  registryName?: string;
  portable: boolean;
  trusted: boolean;
  available?: boolean;
}
