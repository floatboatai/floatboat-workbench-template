// ABOUTME: 独立 Node App 的受控启动、HTTP 业务路由、任务跟踪和停止协议。

import { createServer } from 'node:http';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openWorkbenchDatabase } from './database.mjs';
import { createHostClient } from './host.mjs';
import {
  createWorkbenchResources,
  prepareWorkbenchResourceDirectories,
  type WorkbenchResourceBinding,
} from './resources.mjs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { HostConnection } from './host.mjs';
import type { RouteContext, WorkbenchManifest, WorkbenchServer } from './runtime-contracts.mjs';
import { errorFields } from './errors.mjs';
export type * from './runtime-contracts.mjs';

interface StartConfiguration {
  appId: string;
  generation: string;
  nonce: string;
  pageToken: string;
  sourceDirectory: string;
  dataDirectory: string;
  resources?: Record<string, WorkbenchResourceBinding>;
  hostConnection?: HostConnection | null;
  port?: number;
  development?: boolean;
}
interface Route {
  method: string;
  path: string;
  parameters: string[];
  expression: RegExp;
  handler: (context: RouteContext) => unknown | Promise<unknown>;
}

export async function createWorkbenchServer(
  entryUrl: string,
  options: { configPath?: string } = {},
): Promise<WorkbenchServer> {
  const configurationPath = options.configPath ?? process.env.FLOATBOAT_WORKBENCH_CONFIG;
  if (!configurationPath || !isAbsolute(configurationPath)) throw new Error('WORKBENCH_START_CONFIGURATION_REQUIRED');
  const config = JSON.parse(await readFile(configurationPath, 'utf8')) as StartConfiguration;
  for (const key of ['appId', 'generation', 'nonce', 'pageToken', 'sourceDirectory', 'dataDirectory'] as const) {
    if (typeof config[key] !== 'string' || !config[key])
      throw new Error(`WORKBENCH_START_CONFIGURATION_INVALID:${key}`);
  }
  if (!isAbsolute(config.sourceDirectory) || !isAbsolute(config.dataDirectory))
    throw new Error('WORKBENCH_ABSOLUTE_PATH_REQUIRED');
  const manifest = JSON.parse(
    await readFile(join(config.sourceDirectory, 'manifest.json'), 'utf8'),
  ) as WorkbenchManifest;
  if (manifest.appId !== config.appId) throw new Error('WORKBENCH_IDENTITY_MISMATCH');
  const expectedEntry = resolve(config.sourceDirectory, manifest.server);
  if ((await realpath(fileURLToPath(entryUrl))) !== (await realpath(expectedEntry)))
    throw new Error('WORKBENCH_SERVER_ENTRY_MISMATCH');
  const connection = await openWorkbenchDatabase({
    ...config,
    migrationsDirectory: join(config.sourceDirectory, manifest.migrations),
  });
  const database = connection.database;
  try {
    await prepareWorkbenchResourceDirectories(manifest.resources ?? [], config.dataDirectory);
  } catch (error) {
    await connection.close();
    throw error;
  }
  const routes: Route[] = [];
  const actions = new Map<string, (input: unknown) => unknown | Promise<unknown>>();
  let url: string | undefined;
  let closing = false;
  let closed = false;
  let activeTasks = 0;
  let hostConnection = config.hostConnection;
  const notify = (message: Record<string, unknown>) => {
    if (process.connected) process.send?.({ ...message, generation: config.generation, nonce: config.nonce });
  };
  const updateTask = database.prepare('UPDATE _workbench_tasks SET state=?, updated_at=?, error_code=? WHERE id=?');
  async function trackTask<T>(operation: () => Promise<T>, kind = 'business'): Promise<T> {
    if (closing) throw new Error('WORKBENCH_STOPPING');
    const id = randomUUID();
    database
      .prepare('INSERT INTO _workbench_tasks(id,kind,state,updated_at) VALUES (?,?,?,?)')
      .run(id, kind, 'running', new Date().toISOString());
    activeTasks++;
    notify({ type: 'activity', activeTasks });
    try {
      const result = await operation();
      if (!closed) updateTask.run('completed', new Date().toISOString(), null, id);
      return result;
    } catch (error) {
      const failure = errorFields(error);
      if (!closed)
        updateTask.run(
          failure.execution === 'unknown' ? 'unknown' : 'failed',
          new Date().toISOString(),
          failure.code ?? 'APP_OPERATION_FAILED',
          id,
        );
      throw error;
    } finally {
      activeTasks--;
      notify({ type: 'activity', activeTasks });
    }
  }
  const host = createHostClient(() => hostConnection, trackTask);
  const server = createServer((request, response) => {
    void handle(request, response).catch((error: unknown) =>
      send(
        response,
        { error: { code: errorFields(error).code ?? 'APP_REQUEST_FAILED', message: errorFields(error).message } },
        500,
      ),
    );
  });
  server.requestTimeout = 120_000;
  server.headersTimeout = 15_000;

  async function handle(request: IncomingMessage, response: ServerResponse) {
    if (!url || request.headers.host !== new URL(url).host)
      return send(response, { error: { code: 'APP_HOST_INVALID' } }, 403);
    const requestUrl = new URL(request.url ?? '/', url);
    if (requestUrl.pathname === '/__workbench/health') {
      if (!equalToken(request.headers.authorization?.replace(/^Bearer /, ''), config.nonce))
        return send(response, {}, 401);
      return send(response, {
        appId: config.appId,
        generation: config.generation,
        pid: process.pid,
        activeTasks,
        closing,
      });
    }
    if (closing) return send(response, { error: { code: 'APP_STOPPING' } }, 503);
    if (requestUrl.pathname === '/__workbench/action' && request.method === 'POST') {
      if (!equalToken(request.headers.authorization?.replace(/^Bearer /, ''), config.nonce))
        return send(response, {}, 401);
      const body = await readBody(request);
      const action = typeof body.action === 'string' ? actions.get(body.action) : undefined;
      if (!action) return send(response, { error: { code: 'APP_ACTION_NOT_FOUND' } }, 404);
      return send(response, await trackTask(async () => action(body.input), `action:${body.action}`));
    }
    if (requestUrl.pathname.startsWith('/api/')) {
      if (!equalToken(request.headers['x-workbench-page-token'], config.pageToken))
        return send(response, { error: { code: 'APP_PAGE_UNAUTHORIZED' } }, 401);
      if (request.headers.origin && request.headers.origin !== url)
        return send(response, { error: { code: 'APP_ORIGIN_INVALID' } }, 403);
      for (const route of routes) {
        const match = route.expression.exec(requestUrl.pathname);
        if (route.method !== request.method || !match) continue;
        const body = request.method === 'GET' ? undefined : await readBody(request);
        const params = Object.fromEntries(
          route.parameters.map((name, index) => [name, decodeURIComponent(match[index + 1])]),
        );
        return trackTask(
          async () => send(response, await route.handler({ request, url: requestUrl, params, body, database, host })),
          `${request.method}:${route.path}`,
        );
      }
      return send(response, { error: { code: 'APP_ROUTE_NOT_FOUND' } }, 404);
    }
    if (request.method !== 'GET') return send(response, {}, 405);
    const uiRoot = resolve(config.sourceDirectory, manifest.ui);
    const target =
      requestUrl.pathname === '/__workbench/browser.mjs'
        ? join(dirname(fileURLToPath(import.meta.url)), 'browser.mjs')
        : resolve(uiRoot, `.${decodeURIComponent(requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname)}`);
    if (requestUrl.pathname !== '/__workbench/browser.mjs' && !inside(uiRoot, target)) return send(response, {}, 403);
    try {
      const actual = await realpath(target);
      if (requestUrl.pathname !== '/__workbench/browser.mjs' && !inside(await realpath(uiRoot), actual))
        return send(response, {}, 403);
      const content = await readFile(actual);
      response.writeHead(200, {
        'content-type': MIME_TYPES[extname(target)] ?? 'application/octet-stream',
        'x-content-type-options': 'nosniff',
        'cache-control': 'no-store',
        'content-security-policy':
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'",
      });
      response.end(content);
    } catch (error) {
      if (['ENOENT', 'EISDIR'].includes(errorFields(error).code ?? '')) return send(response, {}, 404);
      throw error;
    }
  }

  async function close() {
    if (closing) return;
    closing = true;
    notify({ type: 'stopping', activeTasks });
    server.close();
    const deadline = Date.now() + 3000;
    while (activeTasks > 0 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
    server.closeAllConnections();
    if (activeTasks > 0)
      database
        .prepare("UPDATE _workbench_tasks SET state='interrupted', updated_at=? WHERE state='running'")
        .run(new Date().toISOString());
    closed = true;
    await connection.close();
    notify({ type: 'stopped', activeTasks });
    if (process.connected) process.disconnect?.();
  }
  let resources = createWorkbenchResources(manifest.resources ?? [], config);
  process.on('message', (value: unknown) => {
    const message = value as {
      generation?: string;
      nonce?: string;
      type?: string;
      connection?: HostConnection | null;
      resources?: Record<string, WorkbenchResourceBinding>;
    } | null;
    if (!message || message.generation !== config.generation || message.nonce !== config.nonce) return;
    if (message.type === 'shutdown') void close();
    if (message.type === 'host-connection') {
      hostConnection = message.connection;
      if (message.resources)
        resources = createWorkbenchResources(manifest.resources ?? [], { ...config, resources: message.resources });
    }
  });
  process.once('SIGTERM', () => {
    void close();
  });
  process.once('SIGINT', () => {
    void close();
  });
  process.once('disconnect', () => {
    void close();
  });

  return {
    manifest,
    resources: {
      path: (...args) => resources.path(...args),
      configured: (id) => resources.configured(id),
    },
    database,
    host,
    trackTask,
    close,
    route(method, path, handler) {
      if (!path.startsWith('/api/')) throw new Error('APP_ROUTE_MUST_USE_API_PREFIX');
      const parameters: string[] = [];
      const pattern = path
        .split('/')
        .map((part) => {
          if (part.startsWith(':')) {
            parameters.push(part.slice(1));
            return '([^/]+)';
          }
          return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        })
        .join('/');
      routes.push({ method: method.toUpperCase(), path, parameters, expression: new RegExp(`^${pattern}$`), handler });
    },
    action(name, handler) {
      if (actions.has(name)) throw new Error('APP_ACTION_DUPLICATE');
      actions.set(name, handler);
    },
    tasks() {
      return database
        .prepare('SELECT id,kind,state,updated_at,error_code FROM _workbench_tasks ORDER BY updated_at DESC LIMIT 100')
        .all()
        .map((row) => ({
          id: String(row.id),
          kind: String(row.kind),
          state: String(row.state),
          updated_at: String(row.updated_at),
          error_code: row.error_code === null ? null : String(row.error_code),
        }));
    },
    async listen() {
      await new Promise<void>((accept, reject) => {
        server.once('error', reject);
        server.listen(config.port ?? 0, '127.0.0.1', accept);
      });
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('WORKBENCH_LISTEN_FAILED');
      url = `http://127.0.0.1:${address.port}`;
      notify({ type: 'ready', appId: config.appId, url, pid: process.pid, activeTasks });
      if (!process.connected)
        process.stdout.write(
          `${JSON.stringify({ type: 'ready', url, pid: process.pid, ...(config.development ? { browserUrl: `${url}/#workbench-page=${encodeURIComponent(config.pageToken)}` } : {}) })}\n`,
        );
      return { url, close };
    },
  };
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
};

function equalToken(provided: unknown, expected: unknown) {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function inside(root: string, candidate: string) {
  const path = relative(root, candidate);
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path));
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  let bytes = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 2_000_000) throw Object.assign(new Error('APP_REQUEST_TOO_LARGE'), { code: 'APP_REQUEST_TOO_LARGE' });
    chunks.push(chunk);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
}

async function send(response: ServerResponse, value: unknown, status = 200) {
  if (response.destroyed || response.writableEnded) return;
  if (value instanceof Response) {
    response.writeHead(value.status, Object.fromEntries(value.headers));
    const reader = value.body?.getReader();
    if (reader)
      try {
        while (!response.destroyed) {
          const next = await reader.read();
          if (next.done) break;
          if (!response.write(next.value))
            await new Promise<void>((resolve) => {
              const finish = () => {
                response.off('drain', finish);
                response.off('close', finish);
                response.off('error', finish);
                resolve();
              };
              response.once('drain', finish);
              response.once('close', finish);
              response.once('error', finish);
            });
        }
      } finally {
        await reader.cancel();
        reader.releaseLock();
      }
    response.end();
    return;
  }
  response.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(value ?? null, (_key, item) => (typeof item === 'bigint' ? item.toString() : item)));
}
