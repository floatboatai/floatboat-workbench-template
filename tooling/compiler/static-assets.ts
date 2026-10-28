// ABOUTME: 将显式公开的目录放入构建专用 public 根，保留 URL 并阻止越界、私有文件和覆盖。
import { lstat, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { workbenchStaticAssetSchema } from '../contracts/workbenchBrowserPolicy';

const extensions = new Set([
  '.wasm',
  '.js',
  '.mjs',
  '.json',
  '.css',
  '.txt',
  '.bin',
  '.data',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.avif',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.mp3',
  '.wav',
  '.ogg',
  '.mp4',
  '.webm',
  '.pdf',
]);

export async function prepareWorkbenchStaticAssets(
  root: string,
  declarations: readonly { source: string; target: string }[] = [],
): Promise<string | false> {
  if (!declarations.length) return false;
  if (declarations.length > 16) throw new Error('WORKBENCH_STATIC_ASSETS_LIMIT');
  const destination = await mkdtemp(join(root, '.workbench-public-'));
  const outputs = new Set<string>();
  let bytes = 0;
  let files = 0;
  try {
    for (const declaration of declarations) {
      const { source, target } = workbenchStaticAssetSchema.parse(declaration);
      let current = root;
      for (const part of source.split('/')) {
        current = join(current, part);
        const stat = await lstat(current);
        if (stat.isSymbolicLink() || !stat.isDirectory())
          throw new Error(`WORKBENCH_STATIC_DIRECTORY_INVALID:${source}`);
      }
      const visit = async (path: string, output: string): Promise<void> => {
        const stat = await lstat(path);
        if (stat.isSymbolicLink()) throw new Error(`WORKBENCH_STATIC_SYMLINK:${source}`);
        if (stat.isDirectory()) {
          for (const name of (await readdir(path)).sort()) {
            if (name.startsWith('.') || ['node_modules', 'sdk', 'migrations'].includes(name))
              throw new Error(`WORKBENCH_STATIC_PRIVATE_FILE:${source}`);
            await visit(join(path, name), `${output}/${name}`);
          }
        } else if (stat.isFile()) {
          if (!extensions.has(extname(path).toLowerCase()))
            throw new Error(`WORKBENCH_STATIC_FILE_UNSUPPORTED:${output}`);
          bytes += stat.size;
          if (++files > 10_000 || bytes > 100 * 1024 * 1024) throw new Error('WORKBENCH_STATIC_ASSETS_LIMIT');
          const key = output.toLowerCase();
          if (outputs.has(key)) throw new Error(`WORKBENCH_STATIC_COLLISION:${output}`);
          outputs.add(key);
          const content = await readFile(path);
          if (content.length !== stat.size) throw new Error('WORKBENCH_STATIC_SOURCE_CHANGED');
          await mkdir(dirname(join(destination, output)), { recursive: true });
          await writeFile(join(destination, output), content, { flag: 'wx', mode: 0o600 });
        } else throw new Error('WORKBENCH_STATIC_FILE_UNSUPPORTED');
      };
      await visit(current, target);
    }
    return destination;
  } catch (error) {
    await rm(destination, { recursive: true, force: true });
    throw error;
  }
}
