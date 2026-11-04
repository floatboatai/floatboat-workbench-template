// ABOUTME: 演示响应遵守真实页面数据契约，防止自动封面停留在错误或加载状态。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { isAppInfo } from '../src/contracts/app.ts';

test('封面演示响应满足页面的应用信息校验', async () => {
  const preview = JSON.parse(await readFile(new URL('../workbench.preview.json', import.meta.url), 'utf8'));
  assert.equal(preview.schemaVersion, 1);
  assert.equal(preview.readyTestId, 'workbench-preview-ready');
  const response = preview.responses.find(
    (item: { method: string; path: string }) => item.method === 'GET' && item.path === '/api/app',
  );
  assert.ok(response);
  assert.ok(isAppInfo(response.body));
});
