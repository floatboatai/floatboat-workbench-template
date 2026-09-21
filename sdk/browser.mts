// ABOUTME: 页面可直接连接本地工作台；父窗口消息只用于主题和语言同步。
export interface WorkbenchPage {
  fetch(input: string | URL, init?: RequestInit): Promise<Response>;
}
export function connectWorkbenchPage(_legacyOptions?: unknown): Promise<WorkbenchPage> {
  const parameters = new URLSearchParams(location.hash.slice(1));
  if (parameters.has('workbench-page')) {
    parameters.delete('workbench-page');
    history.replaceState(null, '', `${location.pathname}${location.search}${parameters.size ? `#${parameters}` : ''}`);
  }
  window.addEventListener('message', (event) => {
    if (window.parent === window || event.source !== window.parent || event.data?.type !== 'floatboat:workbench')
      return;
    const theme = event.data.theme ?? {};
    for (const name of ['background', 'text', 'border', 'muted', 'primary']) {
      if (typeof theme[name] === 'string')
        document.documentElement.style.setProperty(`--workbench-${name}`, theme[name]);
    }
    if (typeof event.data.language === 'string') document.documentElement.lang = event.data.language;
  });
  if (window.parent !== window) window.parent.postMessage({ type: 'floatboat:workbench-ready' }, '*');
  return Promise.resolve({
    fetch(input, init) {
      const target = new URL(input, location.href);
      if (target.origin !== location.origin) throw new Error('WORKBENCH_PAGE_TARGET_INVALID');
      return fetch(target, init);
    },
  });
}
