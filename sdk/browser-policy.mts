// ABOUTME: 在独立运行入口再次验证浏览器声明，生成按应用生效的响应策略。
export interface WorkbenchBrowserPolicy {
  connectOrigins?: string[];
  blobWorkers?: boolean;
  crossOriginIsolated?: boolean;
}

export function readWorkbenchBrowserPolicy(value: unknown): Required<WorkbenchBrowserPolicy> {
  const input = value === undefined ? {} : value;
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('WORKBENCH_BROWSER_POLICY_INVALID');
  const policy = input as Record<string, unknown>;
  if (Object.keys(policy).some((key) => !['connectOrigins', 'blobWorkers', 'crossOriginIsolated'].includes(key)))
    throw new Error('WORKBENCH_BROWSER_POLICY_INVALID');
  for (const key of ['blobWorkers', 'crossOriginIsolated'])
    if (policy[key] !== undefined && typeof policy[key] !== 'boolean')
      throw new Error('WORKBENCH_BROWSER_POLICY_INVALID');
  const origins = policy.connectOrigins === undefined ? [] : policy.connectOrigins;
  if (!Array.isArray(origins) || origins.length > 32 || new Set(origins).size !== origins.length)
    throw new Error('WORKBENCH_BROWSER_ORIGIN_INVALID');
  for (const value of origins) {
    if (typeof value !== 'string' || value.length > 256) throw new Error('WORKBENCH_BROWSER_ORIGIN_INVALID');
    if (/[\s;,'"<>\\]/u.test(value)) throw new Error('WORKBENCH_BROWSER_ORIGIN_INVALID');
    const url = new URL(value);
    const secure = ['https:', 'wss:'].includes(url.protocol);
    const local = ['http:', 'ws:'].includes(url.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (!(secure || local) || value !== url.origin || url.hostname.includes('*') || url.username || url.password)
      throw new Error('WORKBENCH_BROWSER_ORIGIN_INVALID');
  }
  return {
    connectOrigins: origins as string[],
    blobWorkers: policy.blobWorkers === true,
    crossOriginIsolated: policy.crossOriginIsolated === true,
  };
}

export function workbenchBrowserHeaders(policy: Required<WorkbenchBrowserPolicy>): Record<string, string> {
  return {
    'x-content-type-options': 'nosniff',
    'cache-control': 'no-store',
    'content-security-policy':
      [
        "default-src 'self'",
        "script-src 'self' 'wasm-unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data: blob:",
        "media-src 'self' blob:",
        `connect-src 'self'${policy.connectOrigins.length ? ` ${policy.connectOrigins.join(' ')}` : ''}`,
        `worker-src 'self'${policy.blobWorkers ? ' blob:' : ''}`,
        "object-src 'none'",
        "base-uri 'none'",
        'report-uri /__workbench/csp-report',
      ].join('; ') + ';',
    ...(policy.crossOriginIsolated
      ? {
          'document-isolation-policy': 'isolate-and-require-corp',
          'cross-origin-opener-policy': 'same-origin',
          'cross-origin-embedder-policy': 'require-corp',
        }
      : {}),
  };
}

export const WORKBENCH_MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
  '.bin': 'application/octet-stream',
  '.data': 'application/octet-stream',
};
