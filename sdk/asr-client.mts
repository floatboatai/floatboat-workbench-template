// ABOUTME: 在稳定 ASR 会话内串行发送并有限重试音频，临时断开的事件订阅按游标持续恢复。

import type { AsrEvent, CallOptions, HostClient } from './host-contracts.mjs';
import { WorkbenchHostError } from './host-error.mjs';

type AsrClient = HostClient['asr'];
type FrameInput = Parameters<AsrClient['sendFrame']>[0];
type FrameReceipt = Awaited<ReturnType<AsrClient['sendFrame']>>;
const MAX_RETRIES = 8;
const MAX_PENDING_FRAMES = 128;
const MAX_PENDING_BYTES = 8 * 1024 * 1024;

interface QueuedFrame {
  input: FrameInput;
  options: CallOptions;
  signal: AbortSignal;
  settled: boolean;
  finish(error?: unknown, receipt?: FrameReceipt): void;
}

interface FrameQueue {
  frames: QueuedFrame[];
  pending: Set<QueuedFrame>;
  bytes: number;
  controller: AbortController;
  stopping: boolean;
  terminal?: Awaited<ReturnType<AsrClient['get']>>;
  draining?: Promise<void>;
  stop?: ReturnType<AsrClient['stop']>;
}

function transient(error: unknown): boolean {
  return (
    error instanceof WorkbenchHostError &&
    (['HOST_TRANSPORT_FAILED', 'HOST_STREAM_INTERRUPTED'].includes(error.code) ||
      (error.code === 'HOST_REQUEST_FAILED' && [502, 503, 504].includes(error.status ?? 0)))
  );
}

function scope(options: CallOptions, lifetime?: AbortSignal, defaultTimeoutMs?: number) {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  const timer =
    timeoutMs === undefined
      ? undefined
      : setTimeout(() => controller.abort(new DOMException('ASR 调用超时', 'TimeoutError')), timeoutMs);
  const sources = [options.signal, lifetime].filter((value): value is AbortSignal => value !== undefined);
  const listeners = sources.map((signal) => {
    const abort = () => controller.abort(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    return () => signal.removeEventListener('abort', abort);
  });
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      for (const remove of listeners) remove();
    },
  };
}

function backoff(retry: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      reject(signal.reason);
    };
    const timer = setTimeout(
      () => {
        signal.removeEventListener('abort', abort);
        resolve();
      },
      Math.min(400 * 2 ** (retry - 1), 6000),
    );
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

function untilAborted<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener('abort', abort);
      reject(signal.reason);
    };
    signal.addEventListener('abort', abort, { once: true });
    pending.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    if (signal.aborted) abort();
  });
}

export function createResumableAsrClient(transport: AsrClient): AsrClient {
  const queues = new Map<string, FrameQueue>();
  const closedStreams = new Set<string>();
  function queueFor(streamId: string): FrameQueue {
    let queue = queues.get(streamId);
    if (!queue) {
      queue = { frames: [], pending: new Set(), bytes: 0, controller: new AbortController(), stopping: false };
      queues.set(streamId, queue);
    }
    return queue;
  }
  function close(
    streamId: string,
    error: unknown = new WorkbenchHostError({ code: 'ASR_SESSION_NOT_RUNNING' }),
    terminal?: FrameQueue['terminal'],
  ) {
    closedStreams.add(streamId);
    if (closedStreams.size > 100) closedStreams.delete(closedStreams.values().next().value!);
    const queue = queues.get(streamId);
    if (!queue) return;
    queues.delete(streamId);
    queue.terminal = terminal;
    queue.controller.abort(error);
    queue.frames.length = 0;
  }

  async function send(task: QueuedFrame): Promise<FrameReceipt> {
    for (let failures = 0; ; ) {
      task.signal.throwIfAborted();
      try {
        return await untilAborted(
          transport.sendFrame(task.input, { ...task.options, signal: task.signal }),
          task.signal,
        );
      } catch (error) {
        task.signal.throwIfAborted();
        if (!transient(error) || ++failures > MAX_RETRIES) throw error;
        await backoff(failures, task.signal);
      }
    }
  }

  function drain(streamId: string, queue: FrameQueue): void {
    if (queue.draining) return;
    queue.draining = (async () => {
      while (queue.frames.length && !queue.controller.signal.aborted) {
        const task = queue.frames.shift()!;
        if (task.settled) continue;
        try {
          task.finish(undefined, await send(task));
        } catch (error) {
          task.finish(error);
          // 前帧结果未知时不能继续发送后续序号；由调用方明确恢复该帧或结束会话。
          if (queues.get(streamId) === queue) {
            queues.delete(streamId);
            queue.controller.abort(error);
          }
          queue.frames.length = 0;
        }
      }
    })().finally(() => {
      queue.draining = undefined;
      // 写回执先唤醒调用方；它可能在本轮 drain 的 finally 前提交下一帧。
      if (queue.frames.length && !queue.controller.signal.aborted) drain(streamId, queue);
    });
  }

  function sendFrame(input: FrameInput, options: CallOptions = {}): Promise<FrameReceipt> {
    if (closedStreams.has(input.streamId))
      return Promise.reject(new WorkbenchHostError({ code: 'ASR_SESSION_NOT_RUNNING' }));
    const queue = queueFor(input.streamId);
    if (queue.stopping) return Promise.reject(new WorkbenchHostError({ code: 'ASR_SESSION_NOT_RUNNING' }));
    const padding = input.pcmBase64.endsWith('==') ? 2 : input.pcmBase64.endsWith('=') ? 1 : 0;
    const bytes = Math.max(0, Math.floor((input.pcmBase64.length * 3) / 4) - padding);
    if (queue.pending.size >= MAX_PENDING_FRAMES || queue.bytes + bytes > MAX_PENDING_BYTES)
      return Promise.reject(new WorkbenchHostError({ code: 'ASR_FRAME_QUEUE_FULL' }));
    const lifetime = scope(options, queue.controller.signal, 120_000);
    return new Promise((resolve, reject) => {
      const abort = () => task.finish(lifetime.signal.reason);
      const task: QueuedFrame = {
        // 调用方复用参数对象时，网络重试仍必须发送原序号与原音频。
        input: { ...input },
        options,
        signal: lifetime.signal,
        settled: false,
        finish(error, receipt) {
          if (task.settled) return;
          task.settled = true;
          lifetime.signal.removeEventListener('abort', abort);
          lifetime.dispose();
          queue.pending.delete(task);
          queue.bytes -= bytes;
          const index = queue.frames.indexOf(task);
          if (index >= 0) queue.frames.splice(index, 1);
          if (error !== undefined) reject(error);
          else resolve(receipt!);
        },
      };
      queue.bytes += bytes;
      queue.pending.add(task);
      queue.frames.push(task);
      lifetime.signal.addEventListener('abort', abort, { once: true });
      if (lifetime.signal.aborted) abort();
      drain(input.streamId, queue);
    });
  }

  async function* events(
    input: Parameters<AsrClient['events']>[0],
    options: CallOptions = {},
  ): AsyncIterable<AsrEvent> {
    const lifetime = scope(options);
    let cursor = input.afterSequence ?? 0;
    let failures = 0;
    let resultReceived = false;
    try {
      while (true) {
        lifetime.signal.throwIfAborted();
        try {
          for await (const event of transport.events(
            { ...input, afterSequence: cursor },
            { ...options, signal: lifetime.signal },
          )) {
            lifetime.signal.throwIfAborted();
            if (event.type === 'event') {
              if (event.cursor <= cursor) continue;
              cursor = event.cursor;
              failures = 0;
            }
            if (event.type === 'result') {
              resultReceived = !['running', 'stopping'].includes(event.session.status);
              if (resultReceived) close(input.streamId, undefined, event.session);
            }
            // done 只结束本次订阅；没有业务终态时仍需从原游标恢复。
            if (event.type === 'done' && !resultReceived)
              throw new WorkbenchHostError({ code: 'HOST_STREAM_INTERRUPTED', execution: 'unknown' });
            yield event;
            if (event.type === 'done') return;
          }
          if (resultReceived) return;
          throw new WorkbenchHostError({ code: 'HOST_STREAM_INTERRUPTED', execution: 'unknown' });
        } catch (error) {
          lifetime.signal.throwIfAborted();
          if (resultReceived) return;
          if (!transient(error)) throw error;
          // 字幕连接暂不可用不代表本机收音失败；持续恢复直到真正终态或调用方取消。
          failures = Math.min(failures + 1, 5);
          await backoff(failures, lifetime.signal);
        }
      }
    } finally {
      lifetime.dispose();
    }
  }

  return {
    async start(input, options) {
      const result = await transport.start(input, options);
      closedStreams.delete(result.streamId);
      return result;
    },
    async get(input, options) {
      const session = await transport.get(input, options);
      if (!['running', 'stopping'].includes(session.status)) close(input.streamId, undefined, session);
      return session;
    },
    sendFrame,
    events,
    stop(input, options = {}) {
      const queue = queueFor(input.streamId);
      queue.stopping = true;
      queue.stop ??= (async () => {
        const lifetime = scope(options, undefined, 120_000);
        try {
          await untilAborted(queue.draining ?? Promise.resolve(), lifetime.signal);
          if (queue.terminal) return queue.terminal;
          queue.controller.signal.throwIfAborted();
          const session = await untilAborted(
            transport.stop(input, { ...options, signal: lifetime.signal }),
            lifetime.signal,
          );
          if (!['running', 'stopping'].includes(session.status)) close(input.streamId, undefined, session);
          return session;
        } catch (error) {
          if (queues.get(input.streamId) === queue) close(input.streamId);
          throw error;
        } finally {
          lifetime.dispose();
        }
      })();
      return queue.stop;
    },
    cancel(input, options) {
      close(input.streamId);
      return transport.cancel(input, options);
    },
  };
}
