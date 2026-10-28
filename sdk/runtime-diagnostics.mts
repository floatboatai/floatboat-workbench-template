// ABOUTME: 浏览器失败的有界、去重、脱敏诊断，供 Host IPC 与独立预览读取。
const messages = {
  WORKBENCH_CSP_BLOCKED: '浏览器策略阻止资源，请检查 browser 声明或资源来源。',
  WORKBENCH_RESOURCE_NOT_FOUND: '静态资源不存在，请检查资源 URL 和 build.staticAssets。',
  WORKBENCH_RESOURCE_LOAD_FAILED: '浏览器资源加载失败，请检查文件、MIME 和跨源资源策略。',
  WORKBENCH_RESOURCE_MIME_INVALID: '资源 MIME 类型不受支持或与浏览器预期不符。',
  WORKBENCH_ISOLATION_UNAVAILABLE: '当前页面未获得跨源隔离，请检查运行环境与 iframe 委派。',
} as const;
export type WorkbenchBrowserDiagnosticCode = keyof typeof messages;
export interface WorkbenchBrowserDiagnostic {
  code: WorkbenchBrowserDiagnosticCode;
  message: string;
  path?: string;
  retryable: boolean;
  severity: 'warning';
  stage: 'runtime';
}
export function createWorkbenchBrowserDiagnostics(publish: (entry: WorkbenchBrowserDiagnostic) => void) {
  const entries = new Map<string, WorkbenchBrowserDiagnostic>();
  let windowStart = Date.now();
  let count = 0;
  return {
    list: () => [...entries.values()],
    report(code: unknown, resource: unknown, base: string, directive?: unknown) {
      if (typeof code !== 'string' || !Object.hasOwn(messages, code)) return false;
      const now = Date.now();
      if (now - windowStart > 60_000) {
        windowStart = now;
        count = 0;
      }
      if (++count > 100) return false;
      let path: string | undefined;
      if (typeof resource === 'string' && resource && resource.length <= 2048) {
        try {
          const url = new URL(resource, base);
          path = ['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)
            ? url.origin === new URL(base).origin
              ? url.pathname
              : url.origin
            : ['blob:', 'data:'].includes(url.protocol)
              ? url.protocol
              : undefined;
        } catch {
          /* 格式不明的定位信息不进入日志。 */
        }
      }
      path = path
        ?.split('')
        .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
        .join('')
        .slice(0, 256);
      const category = typeof directive === 'string' && /^[a-z-]{1,40}$/.test(directive) ? directive : '';
      const entry: WorkbenchBrowserDiagnostic = {
        code: code as WorkbenchBrowserDiagnosticCode,
        message: messages[code as WorkbenchBrowserDiagnosticCode] + (category ? ` (${category})` : ''),
        ...(path ? { path } : {}),
        retryable: false,
        severity: 'warning',
        stage: 'runtime',
      };
      const key = `${code}:${path ?? ''}:${category}`;
      if (entries.has(key)) return true;
      if (entries.size >= 50) entries.delete(entries.keys().next().value!);
      entries.set(key, entry);
      publish(entry);
      return true;
    },
  };
}
