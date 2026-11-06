// ABOUTME: 工作台直接 Agent 任务的输入、运行事实、公开进度与工作台自有 Agent 工具。

export interface AgentTaskInput {
  prompt: string;
  workingDirectory: string;
  idempotencyKey: string;
  model?: string;
  timeoutMs?: number;
  /** 追加到 Agent 系统提示的工作台说明，最长 30000 字符；不进入会话消息，也不在 Host 聊天中显示。 */
  instructions?: string;
}

export interface AgentTokenUsage {
  /** 含缓存命中与缓存写入部分的全部输入 token。 */
  promptTokens?: number;
  cachedPromptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

/** 一次模型调用（工具循环中的一步）的用量。 */
export interface AgentUsageStep {
  model?: string;
  promptTokens: number;
  cachedPromptTokens: number;
  completionTokens: number;
}

export interface AgentTaskRun {
  runId: string;
  sessionId: string;
  conversationId?: string;
  workspaceId: string;
  status: 'running' | 'cancelling' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
  createdAt: number;
  completedAt: number | null;
  /** 运行中为已接收文本快照，终态为最终结果或保留的部分输出。 */
  text: string;
  errorCode: string | null;
  usage?: AgentTokenUsage;
}

/**
 * input/output/error 只在 manifest.capabilities 声明 agent-tool-details 时出现，均为截断后的文本；
 * 被截断时对应的 *Truncated 为 true。
 */
export type AgentTaskProgress =
  | { type: 'text'; text: string }
  | {
      type: 'tool-started';
      toolId: string;
      toolName: string;
      /** 调用的是本工作台 server.agentTool 注册的工具时为其名称。 */
      appTool?: string;
      input?: string;
      inputTruncated?: boolean;
    }
  | {
      type: 'tool-finished';
      toolId: string;
      failed: boolean;
      output?: string;
      outputTruncated?: boolean;
      error?: string;
    }
  | { type: 'status'; status: string }
  /** 每轮结束时一条：本轮每次模型调用的用量及合计。 */
  | { type: 'usage'; steps: AgentUsageStep[]; total: AgentTokenUsage };

export type AgentTaskEvent =
  | { type: 'event'; cursor: number; event: AgentTaskProgress }
  | { type: 'result'; cursor: number; run: AgentTaskRun }
  | { type: 'done'; requestId: string };

export interface AgentConversation {
  conversationId: string;
  title: string;
  workingDirectory: string;
  model?: string;
  createdAt: number;
  activeRunId: string | null;
}
export interface AgentConversationCreate {
  title?: string;
  workingDirectory: string;
  model?: string;
  idempotencyKey: string;
  /** 本会话每一轮都追加到系统提示的说明，创建后不可修改；不出现在 messages 中。 */
  instructions?: string;
}
export interface AgentConversationSend {
  conversationId: string;
  prompt: string;
  idempotencyKey: string;
  model?: string;
  timeoutMs?: number;
}
export interface AgentConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

/** 工作台服务端提供给本工作台 Agent 运行的工具。 */
export interface AgentToolDefinition {
  /** 小写字母开头，只含小写字母、数字和单个下划线（不连续、不结尾），最长 40 字符。 */
  name: string;
  /** 告诉模型何时、如何使用该工具，最长 4000 字符。 */
  description: string;
  /** JSON Schema，顶层必须是 type: 'object'；Host 先按它校验模型参数再转交处理函数。 */
  parameters: Record<string, unknown>;
}

export interface AgentToolCall {
  /** 已按 parameters 校验的模型参数。 */
  input: Record<string, unknown>;
  runId: string;
  conversationId?: string;
  /** Host 取消运行或放弃等待时中止。 */
  signal: AbortSignal;
}
