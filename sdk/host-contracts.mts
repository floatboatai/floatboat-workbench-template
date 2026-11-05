// ABOUTME: 独立工作台服务端可消费的 Host SDK 公开类型。

import type {
  AgentTaskInput,
  AgentTaskRun,
  AgentTaskEvent,
  AgentConversation,
  AgentConversationCreate,
  AgentConversationSend,
  AgentConversationMessage,
} from './agent-contracts.mjs';
import type { AsrStartInput, AsrSession, AsrEvent } from './asr-contracts.mjs';
export type * from './agent-contracts.mjs';
export type * from './asr-contracts.mjs';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export interface HostConnection {
  url: string;
}

export interface CallOptions {
  requestId?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** manifest 声明的目录资源中的相对路径；Host 不向工作台暴露本机绝对路径。 */
export interface ResourceReference {
  resourceId: string;
  relativePath: string;
}

/** 图片输入三选一：声明资源文件、https 地址（由 Host 下载）或图片 data URL；单张不超过 10 MiB。 */
export type ImageInput = { resource: ResourceReference } | { url: string } | { dataUrl: string };

export type ChatContentPart = { type: 'text'; text: string } | { type: 'image'; image: ImageInput };

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** assistant 消息直接使用上一轮结果的 `assistant` 字段原样追加，hostState 不可修改。 */
export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | ChatContentPart[] }
  | { role: 'assistant'; content?: string; toolCalls?: ToolCall[]; hostState?: string }
  | { role: 'tool'; toolCallId: string; content: string };

export interface ToolDefinition {
  /** ^[a-zA-Z][a-zA-Z0-9_-]{0,63}$ */
  name: string;
  description?: string;
  /** JSON Schema，顶层必须是 type: 'object'。 */
  parameters: Record<string, unknown>;
}

export type ToolChoice = 'auto' | 'none' | 'required' | { name: string };
export type ReasoningEffort = 'off' | 'low' | 'medium' | 'high';

/** prompt 与 messages 二选一；图片在 prompt 模式用 images，在 messages 模式放进 user 消息。 */
export type ModelConversation =
  | {
      prompt: string;
      messages?: never;
      /** 最多 8 张；模型或其协议不支持图片时返回 LLM_IMAGE_INPUT_UNSUPPORTED 且不计费。 */
      images?: ImageInput[];
    }
  | { messages: ChatMessage[]; prompt?: never; images?: never };

export type ModelInput = ModelConversation & {
  model?: string;
  system?: string;
  maxOutputTokens?: number;
  temperature?: number;
  /** 默认 off；模型不支持时按 off 处理。 */
  reasoning?: ReasoningEffort;
};

/** 工具由工作台自己执行：结果含 toolCalls 时执行后把 assistant 与 tool 消息追加到 messages 再调用。 */
export type TextModelInput = ModelInput & {
  tools?: ToolDefinition[];
  toolChoice?: ToolChoice;
};

export type ModelKind = 'text' | 'speech' | 'image' | 'decision' | 'embedding' | 'rerank';

export interface ModelCatalogEntry {
  id: string;
  kinds: ModelKind[];
  inputs: Array<'text' | 'image'>;
  source: 'platform' | 'local';
}

export interface ModelCatalog {
  models: ModelCatalogEntry[];
  /** 各种类在未指定 model 时使用的模型。 */
  defaults: Partial<Record<ModelKind, string>>;
  /** 平台媒体目录状态；unavailable 时语音、图片、决策、向量与重排列表可能不完整。 */
  media: 'available' | 'unavailable';
}

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface StoredMedia extends ResourceReference {
  byteLength: number;
}

export type SpeechFormat = 'mp3' | 'wav' | 'opus' | 'aac' | 'flac' | 'pcm';

export interface SpeechInput {
  text: string;
  model?: string;
  voice?: string;
  format?: SpeechFormat;
  speed?: number;
  instructions?: string;
  /** 必须是 access 为 read-write 的目录资源。 */
  output: ResourceReference;
}

export interface SpeechResult {
  model: string;
  output: StoredMedia & { format: SpeechFormat };
  requestId: string;
}

export interface ImageGenerationInput {
  prompt: string;
  model?: string;
  /** 如 1024x1024，或 auto。 */
  size?: string;
  quality?: 'auto' | 'low' | 'medium' | 'high' | 'standard' | 'hd';
  /** 1–4 张；多张时在 output 文件名后追加 -1、-2。 */
  count?: number;
  /** 参考图；提供时使用图片编辑接口。 */
  images?: ImageInput[];
  /** 必须是 access 为 read-write 的目录资源。 */
  output: ResourceReference;
}

export interface ImageGenerationResult {
  model: string;
  images: Array<StoredMedia & { mimeType: string }>;
  revisedPrompt?: string;
  usage?: ModelUsage;
  requestId: string;
}

type DecisionInstructions = string | Json[] | { [key: string]: Json };

export type DecisionQuestion =
  | { type: 'noul'; instructions: DecisionInstructions; criteria?: Json }
  | { type: 'choice'; instructions: DecisionInstructions; criteria: Json }
  | { type: 'score'; instructions: DecisionInstructions; criteria: Json };

export interface DecisionInput {
  /** 默认 jev-latest。 */
  model?: string;
  state: string | Json[] | { [key: string]: Json };
  /** 1–32 个问题，键为 [A-Za-z0-9_-]{1,64}。 */
  questions: Record<string, DecisionQuestion>;
}

export interface EmbedInput {
  /** 必填：不同模型的向量不可混用，请连同向量一起保存模型 ID。 */
  model: string;
  /** 最多 256 条，单条不超过 32000 字符。 */
  input: string | string[];
  dimensions?: number;
}

export interface EmbedResult {
  model: string;
  /** 与 input 顺序一致。 */
  embeddings: number[][];
  usage?: ModelUsage;
  requestId: string;
}

export interface RerankInput {
  model?: string;
  query: string;
  /** 最多 1000 篇，单篇不超过 32000 字符。 */
  documents: string[];
  topN?: number;
}

export interface RerankResult {
  model: string;
  /** 按 relevanceScore 降序；index 指向 documents 中的位置。 */
  results: Array<{ index: number; relevanceScore: number }>;
  usage?: ModelUsage;
  requestId: string;
}

export interface DecisionResult {
  model: string;
  /** Jev 原样返回的回答，键与 questions 对应。 */
  answers: Record<string, Json>;
  usage?: ModelUsage;
  requestId: string;
}

export interface ModelResult {
  type: 'result';
  text: string;
  model: string;
  finishReason: string;
  requestId: string;
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
  /** finishReason 为 TOOL_CALLS 时出现；inputError 表示参数不符合工具 schema。 */
  toolCalls?: Array<ToolCall & { inputError?: string }>;
  /** 可原样追加到 messages 的 assistant 消息，含推理续聊所需的加密 hostState。 */
  assistant: { role: 'assistant'; content: string; toolCalls?: ToolCall[]; hostState?: string };
}

export type ModelEvent =
  | { type: 'delta'; text: string; model: string; requestId: string }
  | { type: 'tool-call'; toolCall: ToolCall & { inputError?: string }; model: string; requestId: string }
  | ModelResult
  | { type: 'done'; requestId: string };

export type WorkflowRunStatus =
  | 'queued'
  | 'running'
  | 'waiting_for_user'
  | 'succeeded'
  | 'failed'
  | 'skipped'
  | 'rejected'
  | 'timed_out'
  | 'emergency_stopped'
  | 'cancelled';

export interface WorkflowRun {
  workspaceId: string;
  source: { kind: string; workspaceId: string | null; appId: string | null } | null;
  id: string;
  workflowId: string;
  status: WorkflowRunStatus;
  triggerType: string;
  startedAt: number;
  completedAt: number | null;
  durationMs: number | null;
  output: Record<string, Json> | null;
  safeError: { category: string; userAction: Record<string, Json> | null } | null;
}

export interface WorkflowStart {
  workspaceId?: string;
  name?: string;
  dependency?: string;
  input?: Record<string, Json>;
  idempotencyKey: string;
  timeoutMs?: number;
}

export interface WorkflowEvent {
  type: 'event' | 'result' | 'done';
  cursor?: number;
  event?: { id: string; workflowRunId: string; sequence: number; eventType: 'output' | 'error'; status: string | null };
  run?: WorkflowRun;
}

export interface ConnectionReference {
  provider: string;
  accountId: string;
  displayName: string;
  connectionId: string;
}

export interface ConnectionResult {
  requestId: string;
  status: 'requested' | 'connected' | 'cancelled' | 'failed' | 'expired';
  connection?: ConnectionReference;
  error?: string;
}
export type ConnectionRequest = { service: string; provider?: never } | { provider: string; service?: never };

export type CalendarProvider = 'floatboat_calendar' | 'system_calendar';

export interface CalendarFields {
  title?: string;
  note?: string | null;
  location?: string | null;
  scheduledAt?: number;
  endAt?: number | null;
  timezone?: string;
  isAllDay?: boolean;
  recurrenceType?: 'once' | 'rrule';
  rrule?: string | null;
}

export interface AutomationDraft {
  bindingId?: string;
  title: string;
  objective: string;
  scheduledAt: number;
  endAt?: number | null;
  timezone: string;
  note?: string | null;
  status?: 'draft' | 'active' | 'paused';
  isAllDay?: boolean;
  executionMode?: 'readonly' | 'standard';
  trustLevel: 'basic_autonomy' | 'enhanced_autonomy' | 'trusted_execution';
  recurrenceType?: 'once' | 'rrule';
  rrule?: string | null;
}

export interface WorkspaceSummary {
  id: string;
  name: string | null;
  status: string;
}
export interface HostClient {
  workspaces: {
    list(input?: {
      limit?: number;
      cursor?: string;
    }): Promise<{ workspaces: WorkspaceSummary[]; nextCursor: string | null }>;
    create(
      input: { name: string; absolutePath?: string; browserIdentity?: 'isolated' | 'default'; idempotencyKey: string },
      options?: CallOptions,
    ): Promise<{ workspace: WorkspaceSummary; created: boolean }>;
    activate(input: { workspaceId: string }, options?: CallOptions): Promise<{ workspaceId: string; displayed: true }>;
    openUrl(
      input: { workspaceId: string; url: string; idempotencyKey: string },
      options?: CallOptions,
    ): Promise<{ workspaceId: string; tabId: string; displayed: true }>;
  };
  agent: {
    conversations: {
      create(input: AgentConversationCreate): Promise<AgentConversation>;
      list(input?: {
        offset?: number;
        limit?: number;
      }): Promise<{ conversations: AgentConversation[]; nextOffset: number | null }>;
      get(input: { conversationId: string }): Promise<AgentConversation>;
      messages(input: {
        conversationId: string;
        offset?: number;
        limit?: number;
      }): Promise<{ messages: AgentConversationMessage[]; nextOffset: number | null }>;
      send(input: AgentConversationSend, options?: CallOptions): Promise<{ runId: string }>;
    };
    start(input: AgentTaskInput, options?: CallOptions): Promise<{ runId: string }>;
    get(input: { runId: string }): Promise<AgentTaskRun>;
    list(input?: { limit?: number }): Promise<{ runs: AgentTaskRun[] }>;
    findByIdempotencyKey(input: { idempotencyKey: string }): Promise<AgentTaskRun | null>;
    /** 只读订阅自动按游标恢复短暂断线；timeoutMs 限制整个订阅，不会取消任务。 */
    events(input: { runId: string; afterSequence?: number }, options?: CallOptions): AsyncIterable<AgentTaskEvent>;
    cancel(input: { runId: string }): Promise<{ accepted: boolean; run: AgentTaskRun }>;
  };
  asr: {
    start(input: AsrStartInput, options?: CallOptions): Promise<{ streamId: string }>;
    sendFrame(input: { streamId: string; sequence: number; pcmBase64: string }): Promise<{ nextSequence: number }>;
    get(input: { streamId: string }): Promise<AsrSession>;
    events(input: { streamId: string; afterSequence?: number }, options?: CallOptions): AsyncIterable<AsrEvent>;
    stop(input: { streamId: string }): Promise<AsrSession>;
    cancel(input: { streamId: string }): Promise<AsrSession>;
  };
  capabilities: {
    list(input?: { domain?: string; operation?: string }): Promise<{
      sdkVersion: string;
      capabilities: Array<{
        domain: string;
        operation: string;
        readOnly: boolean;
        requiresAccount: boolean;
        declared: boolean;
        status: 'available' | 'not-declared' | 'account-required';
        authorization: 'checked-on-call';
        inputSchema: Record<string, unknown> | null;
        outputSchema: Record<string, unknown> | null;
      }>;
    }>;
  };
  llm: {
    generateText(input: TextModelInput, options?: CallOptions): Promise<ModelResult>;
    generateObject(
      input: ModelInput & { schema: Record<string, unknown> },
      options?: CallOptions,
    ): Promise<ModelResult & { object: unknown }>;
    streamText(input: TextModelInput, options?: CallOptions): AsyncIterable<ModelEvent>;
    listModels(input?: { kind?: ModelKind }): Promise<ModelCatalog>;
    generateSpeech(input: SpeechInput, options?: CallOptions): Promise<SpeechResult>;
    /** 生成较慢，默认请求期限 330 秒。 */
    generateImage(input: ImageGenerationInput, options?: CallOptions): Promise<ImageGenerationResult>;
    decide(input: DecisionInput, options?: CallOptions): Promise<DecisionResult>;
    embed(input: EmbedInput, options?: CallOptions): Promise<EmbedResult>;
    rerank(input: RerankInput, options?: CallOptions): Promise<RerankResult>;
  };
  workflows: {
    start(input: WorkflowStart, options?: CallOptions): Promise<{ runId: string; idempotencyKey: string }>;
    get(input: { runId: string }): Promise<WorkflowRun>;
    list(input?: {
      workspaceId?: string;
      workflowId?: string;
      status?: WorkflowRunStatus;
      cursor?: string;
      limit?: number;
    }): Promise<{ runs: WorkflowRun[]; nextCursor: string | null }>;
    cancel(input: { runId: string }): Promise<{ accepted: boolean; run: WorkflowRun }>;
    findByIdempotencyKey(input: {
      idempotencyKey: string;
    }): Promise<{ runId: string | null; idempotencyKey: string; execution: 'executed' | 'unknown' } | null>;
    events(input: { runId: string; afterSequence?: number }, options?: CallOptions): AsyncIterable<WorkflowEvent>;
  };
  connectedServices: {
    searchProviders(input?: { query?: string; pageSize?: number; pageToken?: string }): Promise<{
      providers: Array<{
        provider: string;
        service: string;
        displayName: string;
        description: string;
        authTypes: string[];
        source: string;
        authorization: string;
      }>;
      nextPageToken: string | null;
    }>;
    getConnection(input: { service: string }): Promise<ConnectionReference | null>;
    getConnectionRequest(input: { requestId: string }): Promise<ConnectionResult>;
    cancelConnectionRequest(input: { requestId: string }): Promise<ConnectionResult>;
    connect(input: { service: string }, options?: CallOptions): Promise<ConnectionResult>;
    search(
      input: { provider?: string; query?: string; domain?: string; pageSize?: number; pageToken?: string },
      options?: CallOptions,
    ): Promise<unknown>;
    describe(input: { capability: string }, options?: CallOptions): Promise<unknown>;
    listConnections(input: { provider: string }): Promise<{ connections: ConnectionReference[] }>;
    requestConnection(input: ConnectionRequest): Promise<{ status: 'requested'; requestId: string }>;
    call(
      input: { capability: string; params?: Record<string, unknown> } & (
        | { connectionId: string; service?: never }
        | { service: string; connectionId?: never }
      ),
      options?: CallOptions,
    ): Promise<unknown>;
  };
  calendar: {
    search(input?: {
      providerKind?: CalendarProvider;
      textQuery?: string;
      rangeStart?: number;
      rangeEnd?: number;
      limit?: number;
    }): Promise<unknown>;
    get(input: {
      providerKind?: CalendarProvider;
      eventId: string;
      rangeStart?: number;
      rangeEnd?: number;
    }): Promise<unknown>;
    create(
      input: CalendarFields & { providerKind?: CalendarProvider; title: string; scheduledAt: number; timezone: string },
    ): Promise<unknown>;
    update(input: CalendarFields & { providerKind: CalendarProvider; eventId: string }): Promise<unknown>;
    delete(input: {
      providerKind: CalendarProvider;
      eventId: string;
      deletionScope?: 'single_event' | 'this_and_future_events' | 'entire_owned_series';
    }): Promise<unknown>;
  };
  automation: {
    preview(
      input: AutomationDraft,
    ): Promise<{ previewToken: string; expiresAt: number; confirmationRequired: true; preview: unknown }>;
    create(input: AutomationDraft & { previewToken: string }): Promise<{ bindingId: string; detail: unknown }>;
    update(
      input: AutomationDraft & { bindingId: string; previewToken: string },
    ): Promise<{ bindingId: string; detail: unknown }>;
    archive(input: { bindingId: string }): Promise<{ archived: boolean }>;
    list(): Promise<{ tasks: unknown[] }>;
    get(input: { bindingId: string }): Promise<unknown>;
    runs(input: { bindingId: string; from?: number; to?: number }): Promise<unknown>;
  };
}
