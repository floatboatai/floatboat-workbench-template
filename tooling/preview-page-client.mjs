// ABOUTME: 固定预览页无需凭据，按状态投射目标 iframe 与语言。
const frame = document.querySelector('iframe');
const status = document.querySelector('#status');
const messages = navigator.language.startsWith('zh')
  ? {
      failed: '更新失败，请查看终端中的错误详情。',
      waiting: '正在等待当前任务完成…',
      updating: '正在更新…',
      unavailable: '预览服务已断开，请检查终端。',
    }
  : {
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
      language: navigator.language,
    },
    current.url,
  );
});
async function poll() {
  try {
    const response = await fetch('/__preview/status');
    if (!response.ok) throw new Error(messages.unavailable);
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
    status.textContent = messages.unavailable;
  }
  setTimeout(poll, 500);
}
void poll();
