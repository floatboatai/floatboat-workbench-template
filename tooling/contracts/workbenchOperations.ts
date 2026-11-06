// ABOUTME: 工作台依赖的 Host SDK 操作与能力特性清单，用于构建时生成 requires.operations 和安装前兼容校验。
// ABOUTME: 清单与 SDK HostClient 接口由单测保持一致；基线是本机制上线前已发布客户端支持的全部操作。

import { z } from 'zod';

/** 已发布客户端（0.6.x）支持的 HostClient 方法；只用到这些的工作台不写 requires，保证旧客户端可安装。 */
export const WORKBENCH_BASELINE_OPERATIONS = [
  'workspaces.list',
  'workspaces.create',
  'workspaces.activate',
  'workspaces.openUrl',
  'agent.conversations.create',
  'agent.conversations.list',
  'agent.conversations.get',
  'agent.conversations.messages',
  'agent.conversations.send',
  'agent.start',
  'agent.get',
  'agent.list',
  'agent.findByIdempotencyKey',
  'agent.events',
  'agent.cancel',
  'asr.start',
  'asr.sendFrame',
  'asr.get',
  'asr.events',
  'asr.stop',
  'asr.cancel',
  'audio.probe',
  'audio.denoise',
  'audio.transcribeFile',
  'audio.get',
  'audio.events',
  'audio.cancel',
  'capabilities.list',
  'llm.generateText',
  'llm.generateObject',
  'llm.streamText',
  'workflows.start',
  'workflows.get',
  'workflows.list',
  'workflows.cancel',
  'workflows.findByIdempotencyKey',
  'workflows.events',
  'connectedServices.searchProviders',
  'connectedServices.getConnection',
  'connectedServices.getConnectionRequest',
  'connectedServices.cancelConnectionRequest',
  'connectedServices.connect',
  'connectedServices.search',
  'connectedServices.describe',
  'connectedServices.listConnections',
  'connectedServices.requestConnection',
  'connectedServices.call',
  'calendar.search',
  'calendar.get',
  'calendar.create',
  'calendar.update',
  'calendar.delete',
  'automation.preview',
  'automation.create',
  'automation.update',
  'automation.archive',
  'automation.list',
  'automation.get',
  'automation.runs',
] as const;

/** 本客户端随包 SDK 的 HostClient 方法。 */
export const WORKBENCH_SDK_OPERATIONS = [
  ...WORKBENCH_BASELINE_OPERATIONS,
  'llm.listModels',
  'llm.generateSpeech',
  'llm.generateImage',
  'llm.decide',
  'llm.embed',
  'llm.rerank',
] as const;

/**
 * 不新增方法、但旧客户端会因严格入参校验拒绝的能力特性。
 * 构建扫描在 llm 文本调用的参数中发现对应字段时记录。
 */
export const WORKBENCH_SDK_FEATURES = ['llm.images', 'llm.messages', 'llm.tools', 'llm.reasoning'] as const;

export const workbenchRequirementNameSchema = z
  .string()
  .regex(/^[a-z][a-zA-Z]{0,63}(?:\.[a-z][a-zA-Z0-9]{0,63}){1,3}$/u);

const baseline = new Set<string>(WORKBENCH_BASELINE_OPERATIONS);
const supported = new Set<string>([...WORKBENCH_SDK_OPERATIONS, ...WORKBENCH_SDK_FEATURES]);

export function isSupportedWorkbenchRequirement(name: string): boolean {
  return supported.has(name);
}

/**
 * 合并已声明与本次扫描到的依赖：保留作者手写的项（只增不减，删除需作者手动改 manifest），
 * 去掉基线内的操作；返回 undefined 表示 manifest 不应出现 requires 字段。
 */
export function mergeWorkbenchRequirements(
  declared: readonly string[] | undefined,
  detected: readonly string[],
): string[] | undefined {
  const operations = [...new Set([...(declared ?? []), ...detected])].filter((name) => !baseline.has(name)).sort();
  return operations.length > 0 ? operations : undefined;
}

export function missingWorkbenchRequirements(manifest: { requires?: { operations: readonly string[] } }): string[] {
  return (manifest.requires?.operations ?? []).filter((name) => !supported.has(name));
}

/** 导入、商店安装、更新、构建与启动前调用：缺少声明的操作时要求升级客户端，错误信息附带缺失项。 */
export function assertWorkbenchRequirementsSupported(manifest: { requires?: { operations: readonly string[] } }): void {
  const missing = missingWorkbenchRequirements(manifest);
  if (missing.length > 0) throw new Error(`WORKBENCH_HOST_UPGRADE_REQUIRED:${missing.join(',')}`);
}
