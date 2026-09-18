// ABOUTME: 工作台直接 Agent 任务的输入、运行事实与公开进度。

export interface AgentTaskInput {
  prompt: string;
  workingDirectory: string;
  idempotencyKey: string;
  model?: string;
  timeoutMs?: number;
}

export interface AgentTaskRun {
  runId: string;
  sessionId: string;
  workspaceId: string;
  status: 'running' | 'cancelling' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
  createdAt: number;
  completedAt: number | null;
  text: string;
  errorCode: string | null;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
}

export type AgentTaskProgress =
  | { type: 'text'; text: string }
  | { type: 'tool-started'; toolId: string; toolName: string }
  | { type: 'tool-finished'; toolId: string; failed: boolean }
  | { type: 'status'; status: string };

export type AgentTaskEvent =
  | { type: 'event'; cursor: number; event: AgentTaskProgress }
  | { type: 'result'; cursor: number; run: AgentTaskRun }
  | { type: 'done'; requestId: string };
