// ABOUTME: 浏览器通过同源工作台路由消费 ASR，复用公共 SDK 的帧重试与游标续订。

import { createResumableAsrClient } from './asr-client.mjs';
import { WorkbenchHostError } from './host-error.mjs';
import type { WorkbenchPage } from './browser.mjs';
import type { AsrEvent, CallOptions, HostClient } from './host-contracts.mjs';

export function createWorkbenchAsrClient(
  page: Pick<WorkbenchPage, 'fetch'>,
  options: { basePath?: string } = {},
): HostClient['asr'] {
  const basePath = options.basePath ?? '/api/asr';
  if (!/^\/api\/[a-zA-Z0-9/_-]+$/u.test(basePath)) throw new WorkbenchHostError({ code: 'ASR_ROUTE_INVALID' });

  async function response(path: string, init: RequestInit, call: CallOptions = {}): Promise<Response> {
    const signal =
      call.timeoutMs === undefined
        ? call.signal
        : call.signal
          ? AbortSignal.any([call.signal, AbortSignal.timeout(call.timeoutMs)])
          : AbortSignal.timeout(call.timeoutMs);
    let result: Response;
    try {
      result = await page.fetch(`${basePath}${path}`, { ...init, signal });
    } catch {
      // 单次请求超时可重发原帧；调用者取消和整个操作超时必须立即终止。
      call.signal?.throwIfAborted();
      throw new WorkbenchHostError({ code: 'HOST_TRANSPORT_FAILED', execution: 'unknown' });
    }
    if (!result.ok) {
      const body = (await result.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
      throw new WorkbenchHostError(
        {
          code: body?.error?.code ?? 'HOST_REQUEST_FAILED',
          message: body?.error?.message,
          execution: 'unknown',
        },
        result.status,
      );
    }
    return result;
  }

  async function json<T>(path: string, body?: unknown, call: CallOptions = {}): Promise<T> {
    const result = await response(
      path,
      body === undefined
        ? {}
        : {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          },
      { timeoutMs: 30_000, ...call },
    );
    try {
      return (await result.json()) as T;
    } catch (error) {
      call.signal?.throwIfAborted();
      if (error instanceof SyntaxError) throw new WorkbenchHostError({ code: 'HOST_RESPONSE_INVALID' });
      throw new WorkbenchHostError({ code: 'HOST_TRANSPORT_FAILED', execution: 'unknown' });
    }
  }

  async function* events(
    input: { streamId: string; afterSequence?: number },
    call: CallOptions = {},
  ): AsyncIterable<AsrEvent> {
    const controller = new AbortController();
    const signal = call.signal ? AbortSignal.any([call.signal, controller.signal]) : controller.signal;
    let idle: ReturnType<typeof setTimeout> | undefined;
    const resetIdle = () => {
      clearTimeout(idle);
      idle = setTimeout(() => controller.abort(), 120_000);
    };
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    resetIdle();
    try {
      const result = await response(
        `/${encodeURIComponent(input.streamId)}/events?after=${input.afterSequence ?? 0}`,
        { headers: { accept: 'text/event-stream' } },
        { ...call, signal },
      );
      if (!result.body) throw new WorkbenchHostError({ code: 'HOST_STREAM_INTERRUPTED' });
      reader = result.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const chunk = await reader.read();
        resetIdle();
        buffer += decoder.decode(chunk.value, { stream: !chunk.done });
        if (buffer.length > 2_000_000) throw new WorkbenchHostError({ code: 'HOST_STREAM_TOO_LARGE' });
        let boundary: RegExpExecArray | null;
        while ((boundary = /\r?\n\r?\n/u.exec(buffer))) {
          const frame = buffer.slice(0, boundary.index);
          buffer = buffer.slice(boundary.index + boundary[0].length);
          const data = frame
            .split(/\r?\n/u)
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart())
            .join('\n');
          if (!data) continue;
          let event: AsrEvent | { type: 'error'; error?: { code?: string; message?: string } };
          try {
            event = JSON.parse(data);
          } catch {
            throw new WorkbenchHostError({ code: 'HOST_STREAM_INVALID' });
          }
          if (!event || typeof event !== 'object') throw new WorkbenchHostError({ code: 'HOST_STREAM_INVALID' });
          if (event.type === 'error')
            throw new WorkbenchHostError({
              code: event.error?.code ?? 'HOST_STREAM_FAILED',
              message: event.error?.message,
            });
          if (event.type !== 'event' && event.type !== 'result' && event.type !== 'done')
            throw new WorkbenchHostError({ code: 'HOST_STREAM_INVALID' });
          if (event.type !== 'done' && (!Number.isSafeInteger(event.cursor) || event.cursor < 0))
            throw new WorkbenchHostError({ code: 'HOST_STREAM_INVALID' });
          yield event;
          if (event.type === 'done') return;
        }
        if (chunk.done) throw new WorkbenchHostError({ code: 'HOST_STREAM_INTERRUPTED', execution: 'unknown' });
      }
    } catch (error) {
      call.signal?.throwIfAborted();
      if (error instanceof WorkbenchHostError) throw error;
      throw new WorkbenchHostError({ code: 'HOST_STREAM_INTERRUPTED', execution: 'unknown' });
    } finally {
      clearTimeout(idle);
      controller.abort();
      await reader?.cancel().catch(() => undefined);
      reader?.releaseLock();
    }
  }

  return createResumableAsrClient({
    start: (input, call) => json('/start', input, call),
    sendFrame: ({ streamId, sequence, pcmBase64 }, call) =>
      json(`/${encodeURIComponent(streamId)}/frames`, { sequence, pcmBase64 }, call),
    get: ({ streamId }, call) => json(`/${encodeURIComponent(streamId)}`, undefined, call),
    events,
    stop: ({ streamId }, call) => json(`/${encodeURIComponent(streamId)}/stop`, {}, call),
    cancel: ({ streamId }, call) => json(`/${encodeURIComponent(streamId)}/cancel`, {}, call),
  });
}
