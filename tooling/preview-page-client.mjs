// ABOUTME: 页面凭据只经固定预览页的受鉴权状态接口和目标 iframe 消息传递。
const parameters = new URLSearchParams(location.hash.slice(1));
const token = parameters.get('preview') ?? sessionStorage.getItem('workbench-preview');
if (token) sessionStorage.setItem('workbench-preview', token);
history.replaceState(null, '', location.pathname);
const frame = document.querySelector('iframe');
const status = document.querySelector('#status');
const messages = navigator.language.startsWith('zh')
  ? {
      link: '请打开终端输出的完整预览地址。',
      auth: '预览授权失效，请重新打开终端中的地址。',
      failed: '更新失败，请查看终端中的错误详情。',
      waiting: '正在等待当前任务完成…',
      updating: '正在更新…',
      unavailable: '预览服务已断开，请检查终端。',
    }
  : {
      link: 'Open the complete preview URL printed in the terminal.',
      auth: 'Preview authorization failed. Reopen the terminal URL.',
      failed: 'Update failed. See the terminal for details.',
      waiting: 'Waiting for active work to finish…',
      updating: 'Updating…',
      unavailable: 'Preview disconnected. Check the terminal.',
    };
document.documentElement.lang = navigator.language;
let current;
window.addEventListener('message', (event) => {
  if (
    !current?.url ||
    event.source !== frame.contentWindow ||
    event.origin !== current.url ||
    event.data?.type !== 'floatboat:workbench-ready'
  )
    return;
  frame.contentWindow.postMessage(
    {
      type: 'floatboat:workbench',
      pageToken: current.pageToken,
      language: navigator.language,
    },
    current.url,
  );
});
async function poll() {
  if (!token) {
    status.textContent = messages.link;
    return;
  }
  try {
    const response = await fetch('/__preview/status', {
      headers: { 'x-workbench-preview-token': token },
    });
    if (!response.ok) throw new Error(messages.auth);
    const next = await response.json();
    if (next.url && next.revision !== current?.revision) {
      current = next;
      frame.src = next.url;
    }
    status.hidden = next.phase === 'watching';
    status.textContent =
      next.phase === 'failed'
        ? messages.failed
        : next.phase === 'waiting'
          ? messages.waiting
          : messages.updating;
  } catch (error) {
    status.hidden = false;
    status.textContent = error.message === messages.auth ? messages.auth : messages.unavailable;
  }
  setTimeout(poll, 500);
}
void poll();
