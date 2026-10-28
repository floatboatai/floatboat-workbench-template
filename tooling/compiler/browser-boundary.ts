// ABOUTME: 页面与 Worker 共用受管浏览器边界，防止 Worker 独立构建绕过 Node/服务端限制。
import { builtinModules } from 'node:module';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { inside } from './diagnostics';

export function workbenchBrowserBoundary(root: string, toolchain: string): Plugin {
  const nodeNames = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));
  return {
    name: 'workbench-browser-boundary', enforce: 'pre',
    load(id) {
      const file = id.split('?')[0];
      if (isAbsolute(file) && ((!inside(root, file) && !inside(toolchain, file)) || /\.(?:scss|sass|less|styl)$/u.test(file)))
        throw new Error('WORKBENCH_PAGE_RESOURCE_UNSUPPORTED');
      if (inside(join(root, 'src/server'), file) || /\/sdk\/(?:runtime|host|database)\./.test(file.replaceAll('\\', '/')))
        throw new Error('WORKBENCH_BROWSER_SERVER_IMPORT');
      return null;
    },
    resolveId(source, importer) {
      if (nodeNames.has(source) || source.startsWith('node:')) throw new Error(`WORKBENCH_BROWSER_SERVER_IMPORT:${source}`);
      if (importer && source.startsWith('.')) {
        const target = resolve(dirname(importer), source);
        // 独立模板依赖位于仓库根；仅允许依赖内部在该目录中解析。
        const dependencyImport = inside(join(toolchain, 'node_modules'), importer.split('?')[0]) && inside(join(toolchain, 'node_modules'), target);
        if ((!inside(root, target) && !dependencyImport) || inside(join(root, 'src/server'), target) || /\/sdk\/(?:runtime|host|database)\./.test(target.replaceAll('\\', '/')))
          throw new Error(`WORKBENCH_BROWSER_SERVER_IMPORT:${source}`);
      }
      return null;
    },
  };
}
