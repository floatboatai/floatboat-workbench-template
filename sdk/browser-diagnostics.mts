// ABOUTME: 自动记录页面资源与策略失败；只上报分类和 URL，不发送异常正文或脚本内容。
let reported = 0;
const seen = new Set<string>();
function report(code: string, resource = '', directive = '') {
  try {
    const url = new URL(resource, location.href);
    resource = ['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)
      ? url.origin === location.origin
        ? url.pathname
        : url.origin
      : url.protocol;
  } catch {
    resource = '';
  }
  resource = resource.slice(0, 256);
  directive = directive.slice(0, 80);
  const key = `${code}:${resource}:${directive}`;
  if (reported >= 50 || seen.has(key)) return;
  seen.add(key);
  reported++;
  void fetch('/__workbench/diagnostics', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, resource: resource.slice(0, 2048), directive: directive.slice(0, 80) }),
  }).catch(() => {});
}
window.addEventListener('securitypolicyviolation', (event) => {
  report('WORKBENCH_CSP_BLOCKED', event.blockedURI, event.effectiveDirective);
});
window.addEventListener(
  'error',
  (event) => {
    const target = event.target;
    if (target instanceof HTMLScriptElement || target instanceof HTMLImageElement || target instanceof HTMLMediaElement)
      report('WORKBENCH_RESOURCE_LOAD_FAILED', target.src);
    else if (target instanceof HTMLLinkElement) report('WORKBENCH_RESOURCE_LOAD_FAILED', target.href);
  },
  true,
);
window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  const reason: unknown = event.reason;
  if (reason instanceof Error && /mime|content.type/i.test(reason.message)) report('WORKBENCH_RESOURCE_MIME_INVALID');
});
void fetch('/__workbench/diagnostics')
  .then((response) => response.json())
  .then((state: { isolationRequested?: boolean }) => {
    if (state.isolationRequested && !crossOriginIsolated) report('WORKBENCH_ISOLATION_UNAVAILABLE');
  })
  .catch(() => {});
export {};
