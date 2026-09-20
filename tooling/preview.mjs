// ABOUTME: 为真实 App 创建只在本机生效的预览启动配置，管理进程和清理边界。
import { fork } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { application, repository, readManifest } from './build.mjs';

export async function startPreview(root = application) {
  const manifest = await readManifest(root);
  const local = join(repository, '.local');
  await mkdir(join(local, 'runs'), { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(join(local, 'runs', 'preview-'));
  const config = { appId: manifest.appId, sourceDirectory: root,
    dataDirectory: join(local, 'data', manifest.appId), generation: randomUUID(),
    nonce: randomBytes(32).toString('hex'), pageToken: randomBytes(32).toString('hex'),
    hostConnection: null, development: true };
  const configPath = join(directory, 'config.json');
  await writeFile(configPath, JSON.stringify(config), { mode: 0o600, flag: 'wx' });
  const child = fork(join(root, manifest.server), [], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    execArgv: ['--disable-warning=ExperimentalWarning'],
    env: { ...process.env, FLOATBOAT_WORKBENCH_CONFIG: configPath },
  });
  let output = '';
  const capture = (chunk) => { output = `${output}${chunk}`.slice(-8000); };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  let exited = false;
  const closed = new Promise((accept) => {
    const done = (code, signal) => {
      if (exited) return;
      exited = true;
      void rm(directory, { recursive: true, force: true }).then(() => accept({ code, signal }));
    };
    child.once('exit', done);
    child.once('error', () => done(1, null));
  });
  const stop = async () => {
    if (exited) return closed;
    if (child.connected) child.send({ type: 'shutdown', generation: config.generation, nonce: config.nonce }, () => {});
    const deadline = setTimeout(() => child.kill('SIGKILL'), 5000);
    try { await closed; } finally { clearTimeout(deadline); }
  };
  try {
    const url = await new Promise((accept, reject) => {
      const timer = setTimeout(() => reject(new Error('PREVIEW_START_TIMEOUT')), 15000);
      const fail = () => { clearTimeout(timer); reject(new Error(`PREVIEW_START_FAILED: ${output}`)); };
      child.once('error', fail);
      child.once('exit', fail);
      child.on('message', (message) => {
        if (message?.type !== 'ready' || message.generation !== config.generation || message.nonce !== config.nonce) return;
        clearTimeout(timer);
        child.removeListener('exit', fail);
        child.removeListener('error', fail);
        const address = new URL(message.url);
        if (address.protocol !== 'http:' || address.hostname !== '127.0.0.1') { reject(new Error('PREVIEW_ADDRESS_INVALID')); return; }
        accept(address.origin);
      });
    });
    // 服务就绪后不再需要配置文件，立即删除，避免终端重复信号打断异步清理。
    await rm(configPath, { force: true });
    return { url, browserUrl: `${url}/#workbench-page=${config.pageToken}`, config, configPath, closed, stop,
      logs: () => output, exited: () => exited };
  } catch (error) { await stop(); throw error; }
}
