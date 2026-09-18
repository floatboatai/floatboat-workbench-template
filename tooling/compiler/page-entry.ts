// ABOUTME: 用 HTML 解析器校验真实页面入口，确保页面脚本进入 TypeScript 检查范围。

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse, type DefaultTreeAdapterMap } from 'parse5';
import type { WorkbenchCompilationDiagnostic } from '../contracts/workbenchCompilation';
import { diagnostic, inside } from './diagnostics';

export function checkPageEntry(root: string): WorkbenchCompilationDiagnostic[] {
  const html = parse(readFileSync(join(root, 'index.html'), 'utf8'), { sourceCodeLocationInfo: true });
  const issues: WorkbenchCompilationDiagnostic[] = [];
  let scripts = 0;
  const visit = (node: DefaultTreeAdapterMap['node']): void => {
    if ('tagName' in node) {
      const attributes = Object.fromEntries(node.attrs.map((attribute) => [attribute.name, attribute.value]));
      if (node.tagName === 'script' && !['application/json', 'application/ld+json'].includes(attributes.type)) {
        scripts++;
        const src = attributes.src ?? '';
        const path = resolve(root, src.startsWith('/') ? src.slice(1) : src);
        if (
          attributes.type !== 'module' ||
          !/^\/?src\/ui\/.+\.(?:ts|tsx|mts)$/u.test(src) ||
          !inside(join(root, 'src/ui'), path)
        )
          issues.push({
            ...diagnostic(
              'WORKBENCH_PAGE_ENTRY_UNSUPPORTED',
              '页面脚本必须是 src/ui/ 内的 TS/TSX module，才能进行完整类型检查。',
              'prepare',
              'index.html',
            ),
            line: node.sourceCodeLocation?.startLine,
          });
      }
      for (const key of ['src', 'href']) {
        const value = attributes[key];
        if (!value || node.tagName === 'a' || /^(?:https?:|data:|#)/u.test(value)) continue;
        const path = resolve(root, value.startsWith('/') ? value.slice(1) : value);
        if (!inside(join(root, 'src'), path))
          issues.push(
            diagnostic(
              'WORKBENCH_PAGE_RESOURCE_OUTSIDE_SOURCE',
              '本地页面资源必须位于 src/ 中。',
              'prepare',
              'index.html',
            ),
          );
      }
    }
    if ('childNodes' in node) for (const child of node.childNodes) visit(child);
  };
  visit(html);
  if (!scripts)
    issues.push(
      diagnostic(
        'WORKBENCH_PAGE_ENTRY_REQUIRED',
        'index.html 必须引用 src/ui/ 内的 TS/TSX 入口。',
        'prepare',
        'index.html',
      ),
    );
  return issues;
}
