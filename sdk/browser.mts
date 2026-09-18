// ABOUTME: 将 Host 页面授权和主题投射到 App 页面，不向浏览器交付 Host SDK 凭据。

export interface WorkbenchPage {
  fetch(input: string | URL, init?: RequestInit): Promise<Response>;
}

export function connectWorkbenchPage(options: { pageToken?: string } = {}): Promise<WorkbenchPage> {
  return new Promise<WorkbenchPage>((resolve) => {
    const parameters = new URLSearchParams(location.hash.slice(1));
    let pageToken = options.pageToken ?? (window.parent === window ? parameters.get('workbench-page') : null);
    if (parameters.has('workbench-page')) {
      parameters.delete('workbench-page');
      history.replaceState(
        null,
        '',
        `${location.pathname}${location.search}${parameters.size ? `#${parameters}` : ''}`,
      );
    }
    const receive = (event: Pick<MessageEvent, 'source' | 'data'>) => {
      if (event.source !== window.parent || !event.data || event.data.type !== 'floatboat:workbench') return;
      if (typeof event.data.pageToken === 'string') pageToken = event.data.pageToken;
      if (!pageToken) return;
      const theme = event.data.theme ?? {};
      for (const name of ['background', 'text', 'border', 'muted', 'primary']) {
        if (typeof theme[name] === 'string')
          document.documentElement.style.setProperty(`--workbench-${name}`, theme[name]);
      }
      if (typeof event.data.language === 'string') document.documentElement.lang = event.data.language;
      resolve({
        fetch(input, init = {}) {
          const target = new URL(input, location.href);
          if (target.origin !== location.origin) throw new Error('WORKBENCH_PAGE_TARGET_INVALID');
          const headers = new Headers(init.headers);
          if (!pageToken) throw new Error('WORKBENCH_PAGE_UNAUTHORIZED');
          headers.set('x-workbench-page-token', pageToken);
          return fetch(target, { ...init, headers });
        },
      });
    };
    window.addEventListener('message', receive);
    if (window.parent !== window) window.parent.postMessage({ type: 'floatboat:workbench-ready' }, '*');
    else if (typeof pageToken === 'string')
      receive({ source: window, data: { type: 'floatboat:workbench', pageToken } });
  });
}
