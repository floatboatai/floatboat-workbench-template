import { connectWorkbenchPage } from '../../sdk/browser.mjs';

function connect() {
  if (window.parent !== window) return connectWorkbenchPage();
  // SDK 会移除 URL 中的页面令牌；仅在当前页签保存，以支持独立预览刷新。
  const key = 'workbench-preview-page-token';
  const token = new URLSearchParams(location.hash.slice(1)).get('workbench-page') ?? sessionStorage.getItem(key);
  if (!token) return Promise.reject(new Error('PREVIEW_LINK_REQUIRED'));
  sessionStorage.setItem(key, token);
  return connectWorkbenchPage({ pageToken: token });
}

let connection: ReturnType<typeof connect> | undefined;
export function getPageConnection() {
  return connection ??= connect();
}
