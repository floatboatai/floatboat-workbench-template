// ABOUTME: App 自有 HTTP、SQLite 与在途任务的公开契约。

import type { WorkbenchBrowserPolicy } from './browser-policy.mjs';
import type { IncomingMessage } from 'node:http';
import type { WorkbenchResources, WorkbenchResourceDeclaration } from './resources.mjs';

import type { DatabaseSync } from 'node:sqlite';

import type { HostClient } from './host.mjs';
import type { AgentToolCall, AgentToolDefinition } from './agent-contracts.mjs';

export interface WorkbenchManifest {
  appId: string;
  name: string;
  version: string;
  server: string;
  ui: string;
  migrations: string;
  capabilities: string[];
  browser?: WorkbenchBrowserPolicy;
  resources?: WorkbenchResourceDeclaration[];
}

export interface RouteContext {
  request: IncomingMessage;
  url: URL;
  params: Record<string, string>;
  body: unknown;
  database: DatabaseSync;
  host: HostClient;
}

export interface WorkbenchServer {
  manifest: WorkbenchManifest;
  resources: WorkbenchResources;
  database: DatabaseSync;
  host: HostClient;
  route(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    handler: (context: RouteContext) => unknown | Promise<unknown>,
  ): void;
  action(name: string, handler: (input: unknown) => unknown | Promise<unknown>): void;
  /**
   * 注册本工作台 Agent 运行可调用的工具；需要 manifest 声明 agent。
   * 返回值交给模型：字符串原样传递，其他值序列化为 JSON。抛错时模型收到错误码与消息。
   */
  agentTool(definition: AgentToolDefinition, handler: (call: AgentToolCall) => unknown | Promise<unknown>): void;
  trackTask<T>(operation: () => Promise<T>, kind?: string): Promise<T>;
  tasks(): Array<{ id: string; kind: string; state: string; updated_at: string; error_code: string | null }>;
  close(): Promise<void>;
  listen(): Promise<{ url: string; close(): Promise<void> }>;
}
