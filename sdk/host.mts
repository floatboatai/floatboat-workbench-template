// ABOUTME: 工作台服务端使用的 HTTP/JSON/SSE 客户端，Host 凭据不进入页面或应用源码。

import type {
  CallOptions,
  HostClient,
  HostConnection,
  ModelEvent,
  ModelResult,
  WorkflowEvent,
  WorkflowRun,
  AgentTaskEvent,
  AsrEvent,
} from './host-contracts.mjs';
export type * from './host-contracts.mjs';

interface HostFailure {
  code: string;
  message?: string;
  requestId?: string;
  execution?: 'not-executed' | 'executed' | 'unknown';
}
interface HostResponse<T> {
  error?: HostFailure;
  data: T;
}
type TrackTask = <T>(operation: () => Promise<T>, kind?: string) => Promise<T>;

export class WorkbenchHostError extends Error {
  readonly code: string;
  readonly requestId?: string;
  readonly execution: 'not-executed' | 'executed' | 'unknown';
  constructor(error: HostFailure) {
    super(error.message ?? error.code ?? 'WORKBENCH_HOST_ERROR');
    this.name = 'WorkbenchHostError';
    this.code = error.code ?? 'WORKBENCH_HOST_ERROR';
    this.requestId = error.requestId;
    this.execution = error.execution ?? 'not-executed';
  }
}

export function createHostClient(
  connection: HostConnection | null | (() => HostConnection | null | undefined),
  track: TrackTask = (operation) => operation(),
): HostClient {
  const getConnection = typeof connection === 'function' ? connection : () => connection;
  let refreshedFrom: string | undefined;
  let refreshedConnection: HostConnection | undefined;
  let refreshing: Promise<void> | null = null;
  function currentConnection() {
    const supplied = getConnection();
    const current = supplied?.token === refreshedFrom ? refreshedConnection : supplied;
    if (!current) throw new WorkbenchHostError({ code: 'HOST_NOT_CONNECTED' });
    const endpoint = new URL(current.url);
    if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || endpoint.username || endpoint.password)
      throw new WorkbenchHostError({ code: 'HOST_ENDPOINT_INVALID' });
    return current;
  }
  async function refresh(current: HostConnection) {
    if (currentConnection().token !== current.token) return;
    if (refreshing) return refreshing;
    const suppliedToken = getConnection()?.token;
    refreshing = (async () => {
      const response = await fetch(new URL('/v1/refresh', current.url), {
        method: 'POST',
        headers: { authorization: `Bearer ${current.token}` },
        signal: AbortSignal.timeout(10_000),
      });
      const result = (await response.json()) as HostResponse<HostConnection>;
      if (!response.ok || result.error) throw new WorkbenchHostError(result.error ?? { code: 'HOST_REFRESH_FAILED' });
      if (result.data?.url !== current.url || typeof result.data?.token !== 'string')
        throw new WorkbenchHostError({ code: 'HOST_REFRESH_INVALID' });
      if (getConnection()?.token === suppliedToken) {
        refreshedFrom = suppliedToken;
        refreshedConnection = result.data;
      }
    })().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }
  async function transmit(route: string, body: unknown, options: CallOptions) {
    const signal = options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(options.timeoutMs ?? 120_000)])
      : AbortSignal.timeout(options.timeoutMs ?? 120_000);
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const current = currentConnection();
        const response = await fetch(new URL(route, current.url), {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${current.token}` },
          body: JSON.stringify(body),
          signal,
        });
        if (response.status !== 401 || attempt > 0) return response;
        const failure = (await response
          .clone()
          .json()
          .catch(() => null)) as HostResponse<unknown> | null;
        if (failure?.error?.code !== 'HOST_CONNECTION_EXPIRED' || failure.error.execution !== 'not-executed')
          return response;
        await response.body?.cancel();
        await refresh(current);
      }
      throw new WorkbenchHostError({ code: 'HOST_REFRESH_FAILED' });
    } catch (error) {
      if (error instanceof WorkbenchHostError) throw error;
      throw new WorkbenchHostError({ code: 'HOST_TRANSPORT_FAILED', execution: 'unknown' });
    }
  }
  async function request<T = unknown>(
    domain: string,
    operation: string,
    input: unknown = {},
    options: CallOptions = {},
  ): Promise<T> {
    return track(async () => {
      const response = await transmit('/v1/call', { domain, operation, input, requestId: options.requestId }, options);
      const result = (await response.json()) as HostResponse<T>;
      if (!response.ok || result.error) throw new WorkbenchHostError(result.error ?? { code: 'HOST_REQUEST_FAILED' });
      return result.data;
    }, `${domain}.${operation}`);
  }

  async function* events<T extends { type: string }>(
    domain: string,
    operation: string,
    input: unknown = {},
    options: CallOptions = {},
  ): AsyncIterable<T> {
    const response = await transmit('/v1/events', { domain, operation, input, requestId: options.requestId }, options);
    if (!response.ok)
      throw new WorkbenchHostError(
        ((await response.json()) as HostResponse<unknown>).error ?? { code: 'HOST_REQUEST_FAILED' },
      );
    if (!response.body) throw new WorkbenchHostError({ code: 'HOST_STREAM_EMPTY', execution: 'unknown' });
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let terminal = false;
    try {
      while (true) {
        const { value, done } = await reader.read();
        buffer = (buffer + decoder.decode(value, { stream: !done })).replaceAll('\r\n', '\n');
        if (buffer.length > 2_000_000)
          throw new WorkbenchHostError({ code: 'HOST_STREAM_TOO_LARGE', execution: 'unknown' });
        let end;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const data = frame
            .split('\n')
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart())
            .join('\n');
          if (!data) continue;
          const event = JSON.parse(data) as T & { error?: HostFailure };
          if (event.type === 'error')
            throw new WorkbenchHostError(event.error ?? { code: 'HOST_STREAM_FAILED', execution: 'unknown' });
          if (event.type === 'done') terminal = true;
          yield event;
        }
        if (done) break;
      }
      if (!terminal) throw new WorkbenchHostError({ code: 'HOST_STREAM_INTERRUPTED', execution: 'unknown' });
    } catch (error) {
      if (error instanceof WorkbenchHostError) throw error;
      throw new WorkbenchHostError({ code: 'HOST_STREAM_INTERRUPTED', execution: 'unknown' });
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  }

  return {
    agent: {
      start: (input, options) => request('agent', 'start', input, options),
      get: (input) => request('agent', 'get', input),
      list: (input) => request('agent', 'list', input),
      findByIdempotencyKey: (input) => request('agent', 'findByIdempotencyKey', input),
      events: (input, options) => events<AgentTaskEvent>('agent', 'events', input, options),
      cancel: (input) => request('agent', 'cancel', input),
    },
    asr: {
      start: (input, options) => request('asr', 'start', input, options),
      sendFrame: (input) => request('asr', 'sendFrame', input),
      get: (input) => request('asr', 'get', input),
      events: (input, options) => events<AsrEvent>('asr', 'events', input, options),
      stop: (input) => request('asr', 'stop', input),
      cancel: (input) => request('asr', 'cancel', input),
    },
    capabilities: { list: (input = {}) => request('capabilities', 'list', input) },
    llm: {
      generateText: (input, options) => request<ModelResult>('llm', 'generateText', input, options),
      generateObject: (input, options) =>
        request<ModelResult & { object: unknown }>('llm', 'generateObject', input, options),
      streamText: (input, options) => events<ModelEvent>('llm', 'streamText', input, options),
    },
    workflows: {
      start: (input, options) => request('workflows', 'start', input, options),
      get: (input) => request<WorkflowRun>('workflows', 'get', input),
      list: (input) => request('workflows', 'list', input),
      cancel: (input) => request('workflows', 'cancel', input),
      findByIdempotencyKey: (input) => request('workflows', 'findByIdempotencyKey', input),
      events: (input, options) => events<WorkflowEvent>('workflows', 'events', input, options),
    },
    connectedServices: {
      search: (input, options) => request('connected-services', 'search', input, options),
      describe: (input, options) => request('connected-services', 'describe', input, options),
      listConnections: (input) => request('connected-services', 'listConnections', input),
      requestConnection: (input) => request('connected-services', 'requestConnection', input),
      call: (input, options) => request('connected-services', 'call', input, options),
    },
    calendar: {
      search: (input) => request('calendar', 'search', input),
      get: (input) => request('calendar', 'get', input),
      create: (input) => request('calendar', 'create', input),
      update: (input) => request('calendar', 'update', input),
      delete: (input) => request('calendar', 'delete', input),
    },
    automation: {
      preview: (input) => request('automation', 'preview', input),
      create: (input) => request('automation', 'create', input),
      update: (input) => request('automation', 'update', input),
      archive: (input) => request('automation', 'archive', input),
      list: () => request('automation', 'list'),
      get: (input) => request('automation', 'get', input),
      runs: (input) => request('automation', 'runs', input),
    },
  };
}
