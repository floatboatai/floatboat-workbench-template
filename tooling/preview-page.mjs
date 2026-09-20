// ABOUTME: 固定预览入口沿用 SDK 的 iframe 授权协议，更新服务不改变浏览器地址。
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export async function createPreviewPage(token, getStatus) {
  const script = await readFile(new URL('./preview-page-client.mjs', import.meta.url));
  let url;
  const server = createServer((request, response) => {
    const send = (status, type, body) => {
      response.writeHead(status, {
        'content-type': type,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
        'content-security-policy':
          "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; frame-src http://127.0.0.1:*; frame-ancestors 'none'; base-uri 'none'",
      });
      response.end(body);
    };
    if (
      !url ||
      request.headers.host !== new URL(url).host ||
      (request.headers.origin && request.headers.origin !== url)
    )
      return send(403, 'text/plain', 'Forbidden');
    if (request.method !== 'GET') return send(405, 'text/plain', 'Method not allowed');
    if (request.url === '/__preview/status') {
      const supplied = Buffer.from(String(request.headers['x-workbench-preview-token'] ?? ''));
      const expected = Buffer.from(token);
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
        return send(401, 'text/plain', 'Unauthorized');
      return send(200, 'application/json', JSON.stringify(getStatus()));
    }
    if (request.url === '/__preview/client.mjs') return send(200, 'text/javascript', script);
    if (request.url === '/favicon.ico') return send(204, 'image/x-icon', '');
    if (request.url !== '/') return send(404, 'text/plain', 'Not found');
    send(
      200,
      'text/html',
      `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Workbench preview</title>
<style>html,body{height:100%;margin:0}body{display:flex;flex-direction:column;font:14px system-ui}#status{padding:8px 12px;background:#fff6dd;color:#473800}#status[hidden]{display:none}iframe{border:0;flex:1;width:100%;min-height:0}</style>
<div id="status" role="status">Connecting…</div><iframe title="Workbench preview" allow="microphone; clipboard-write"></iframe><script type="module" src="/__preview/client.mjs"></script></html>`,
    );
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  url = `http://127.0.0.1:${server.address().port}`;
  return {
    url,
    close: () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  };
}
