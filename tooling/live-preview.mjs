// ABOUTME: 合并源码保存，在隔离快照上校验并安全替换预览进程，失败恢复旧服务与数据。
import { cp, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { watch } from 'chokidar';
import { application, repository, checkApplication } from './build.mjs';
import { startPreview } from './preview.mjs';
import { createPreviewPage } from './preview-page.mjs';

const generated = new Set([
  'node_modules',
  'sdk',
  'dist',
  '.workbench-vite',
  '.git',
  '.local',
  '.generated',
  'artifacts',
  'coverage',
]);
const ignored = (root, path) =>
  relative(root, path)
    .split(sep)
    .some(
      (part) =>
        generated.has(part) ||
        part.startsWith('.env') ||
        part === '.DS_Store' ||
        /\.(?:log|db|sqlite)(?:-wal|-shm)?$/.test(part),
    );

export async function startLivePreview(root = application, { onStatus = () => {} } = {}) {
  await mkdir(join(repository, '.local'), { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(join(repository, '.local/live-'));
  const token = randomBytes(32).toString('hex');
  let active, activeRoot, appId, gateway, timer, running, stopPromise;
  let stopped = false;
  let switching = false;
  let preserveRecovery = false;
  let requested = 0;
  let revision = 0;
  let state = { phase: 'building' };
  let finish;
  const closed = new Promise((resolve) => {
    finish = resolve;
  });
  const notify = (phase, message) => {
    state = { phase, ...(message ? { message } : {}) };
    onStatus(state);
  };
  const status = () => ({
    ...state,
    revision,
    ...(active ? { url: active.url, pageToken: active.config.pageToken } : {}),
  });
  const watcher = watch(root, {
    ignoreInitial: true,
    followSymlinks: false,
    ignored: (path) => ignored(root, path),
    atomic: 100,
    awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 50 },
  });
  const ready = new Promise((resolve, reject) => {
    watcher.once('ready', resolve);
    watcher.once('error', reject);
  });
  watcher.on('error', (error) => notify('failed', `WATCH_FAILED: ${error.message}`));

  function activate(preview, snapshot) {
    active = preview;
    activeRoot = snapshot;
    revision++;
    void preview.closed.then(() => {
      if (!stopped && !switching && active === preview)
        notify('failed', `PREVIEW_STOPPED_UNEXPECTEDLY: ${preview.logs()}`);
    });
  }

  async function update(sequence) {
    let snapshot;
    try {
      notify('building');
      snapshot = await mkdtemp(join(directory, 'source-'));
      await cp(root, snapshot, {
        recursive: true,
        filter: (path) => !ignored(root, path),
      });
      const manifest = await checkApplication(snapshot, (issue) =>
        onStatus({
          phase: 'diagnostic',
          message: `${issue.severity}: ${issue.path ?? ''}:${issue.line ?? ''} ${issue.code} ${issue.message}`,
        }),
      );
      if (appId && appId !== manifest.appId)
        throw new Error('PREVIEW_IDENTITY_CHANGED: Restart pnpm dev after changing appId.');
      if (stopped || sequence !== requested) return;
      const previous = active;
      const previousRoot = activeRoot;
      if (previous) {
        // 构建期间旧服务继续处理请求；所有已登记工作结束后才进入替换阶段。
        while (!stopped && sequence === requested) {
          let health;
          try {
            const response = await fetch(`${previous.url}/__workbench/health`, {
              headers: { authorization: `Bearer ${previous.config.nonce}` },
              signal: AbortSignal.timeout(2000),
            });
            if (!response.ok) throw new Error('PREVIEW_HEALTH_FAILED');
            health = await response.json();
          } catch (error) {
            if (!previous.exited()) throw error;
            break;
          }
          if (health.activeTasks === 0) break;
          notify('waiting');
          await delay(100);
        }
        if (stopped || sequence !== requested) return;
        switching = true;
        await previous.stop();
      }
      const backup = join(directory, 'data-backup');
      let backedUp = false;
      try {
        if (previous) {
          await cp(previous.config.dataDirectory, backup, {
            recursive: true,
            errorOnExist: true,
            force: false,
          });
          backedUp = true;
        }
        if (stopped) return;
        const next = await startPreview(snapshot);
        activate(next, snapshot);
        snapshot = undefined;
        appId = manifest.appId;
        notify('watching');
      } catch (error) {
        if (previous) {
          try {
            if (backedUp) {
              // 失败候选可能已执行迁移或业务写入，整体恢复停止后的数据副本。
              const failedData = join(directory, 'failed-data');
              await rename(previous.config.dataDirectory, failedData);
              await rename(backup, previous.config.dataDirectory);
              await rm(failedData, { recursive: true, force: true });
            }
            if (!stopped) activate(await startPreview(previousRoot), previousRoot);
          } catch (recovery) {
            preserveRecovery = true;
            throw new Error(
              `PREVIEW_RECOVERY_REQUIRED: ${directory}\n${error.message}\n${recovery.message}`,
            );
          }
        }
        throw error;
      } finally {
        switching = false;
        if (!preserveRecovery) await rm(backup, { recursive: true, force: true });
      }
      if (previousRoot && previousRoot !== activeRoot)
        await rm(previousRoot, { recursive: true, force: true });
    } catch (error) {
      notify('failed', error.message);
      if (!active) throw error;
    } finally {
      if (snapshot && !preserveRecovery) await rm(snapshot, { recursive: true, force: true });
    }
  }

  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (stopped || preserveRecovery || running) return;
      const sequence = requested;
      running = update(sequence)
        .catch((error) => notify('failed', error.message))
        .finally(() => {
          running = undefined;
          if (!stopped && requested !== sequence) schedule();
        });
    }, 350);
  };
  watcher.on('all', () => {
    requested++;
    schedule();
  });

  function stop() {
    if (stopPromise) return stopPromise;
    stopped = true;
    clearTimeout(timer);
    stopPromise = (async () => {
      await watcher.close();
      await running?.catch(() => {});
      await active?.stop();
      await gateway?.close();
      if (!preserveRecovery) await rm(directory, { recursive: true, force: true });
      finish({ code: 0, signal: null });
    })();
    return stopPromise;
  }

  try {
    await ready;
    // 监听先就绪，避免初次编译期间保存被遗漏；首次校验失败仍明确退出。
    let initialSequence = requested;
    running = update(initialSequence);
    await running;
    running = undefined;
    while (!active) {
      initialSequence = requested;
      running = update(initialSequence);
      await running;
      running = undefined;
    }
    if (requested !== initialSequence) schedule();
    gateway = await createPreviewPage(token, status);
    return {
      url: gateway.url,
      browserUrl: `${gateway.url}/#preview=${token}`,
      token,
      closed,
      stop,
      status,
    };
  } catch (error) {
    await stop();
    throw error;
  }
}
