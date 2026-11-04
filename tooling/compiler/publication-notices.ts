// ABOUTME: 发布包保留依赖的许可与版权声明，不把开发依赖树交付安装者。
import { lstat, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { inside } from './diagnostics';
export async function writeWorkbenchPublicationNotices(root: string, dependencyDirectory = join(root, 'node_modules')) {
  const canonical = await realpath(dependencyDirectory);
  const notices: string[] = [];
  const visited = new Set<string>();
  const scan = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.')) continue;
      const path = await realpath(join(directory, entry.name));
      if (!inside(canonical, path)) throw new Error('WORKBENCH_RUNTIME_IMPORT_OUTSIDE_PROJECT');
      if (entry.name.startsWith('@')) {
        await scan(path);
        continue;
      }
      if (!(await lstat(path)).isDirectory() || visited.has(path)) continue;
      visited.add(path);
      const info = JSON.parse(await readFile(join(path, 'package.json'), 'utf8')) as {
        name?: string;
        version?: string;
        license?: unknown;
      };
      const texts: string[] = [];
      for (const name of (await readdir(path)).sort()) {
        if (!/^(?:licen[sc]e|copying|notice)(?:[.-].*)?$/iu.test(name)) continue;
        const file = join(path, name),
          stat = await lstat(file);
        if (stat.isSymbolicLink() || !stat.isFile() || stat.size > 1024 * 1024) continue;
        texts.push(`${name}\n${await readFile(file, 'utf8')}`);
      }
      notices.push(
        `${info.name ?? entry.name}@${info.version ?? ''}\nLicense: ${typeof info.license === 'string' ? info.license : 'See component notice'}\n${texts.join('\n')}`,
      );
      await scan(join(path, 'node_modules'));
    }
  };
  await scan(dependencyDirectory);
  const existing = await readFile(join(root, 'THIRD_PARTY_NOTICES.txt'), 'utf8').catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return '';
      throw error;
    },
  );
  await writeFile(join(root, 'THIRD_PARTY_NOTICES.txt'), [existing, ...notices].filter(Boolean).join('\n\n---\n\n'), {
    mode: 0o600,
  });
}
