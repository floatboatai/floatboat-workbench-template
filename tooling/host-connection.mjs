// ABOUTME: 仅从当前系统用户的受保护目录发现 Floatboat，维持外部预览的作用域连接。
import { lstat, readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

function safeAddress(value) {
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    !url.port ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("HOST_DISCOVERY_ADDRESS_INVALID");
  return url.origin;
}
async function privateFile(path, directory = false) {
  const info = await lstat(path);
  if (
    info.isSymbolicLink() ||
    (directory ? !info.isDirectory() : !info.isFile()) ||
    (process.getuid && (info.uid !== process.getuid() || info.mode & 0o077))
  )
    throw new Error("HOST_DISCOVERY_PERMISSIONS_INVALID");
  if (!directory && info.size > 8192)
    throw new Error("HOST_DISCOVERY_FILE_INVALID");
}
export async function connectLocalHost(
  input,
  {
    directory = join(homedir(), ".floatboat", "hosts"),
    instance = process.env.FLOATBOAT_HOST_INSTANCE,
    offline = process.env.FLOATBOAT_HOST_MODE === "offline",
    intervalMs = 3000,
    onChange = () => {},
    onStatus = (code) => process.stdout.write(`[Floatboat] ${code}\n`),
  } = {},
) {
  let selected = instance,
    descriptor,
    lease,
    timer,
    running,
    stopping = false,
    previousStatus;
  let value = null;
  const controller = new AbortController();
  const report = (status) => {
    if (status !== previousStatus) {
      previousStatus = status;
      onStatus(status);
    }
  };
  const publish = (next) => {
    value = next;
    onChange(next);
  };
  async function post(
    host,
    route,
    body,
    timeout = 1500,
    signal = controller.signal,
  ) {
    const response = await fetch(`${safeAddress(host.url)}${route}`, {
      method: "POST",
      redirect: "error",
      headers: {
        authorization: `Bearer ${host.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.any([signal, AbortSignal.timeout(timeout)]),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result?.error?.code ?? "HOST_CONNECTION_FAILED");
    return result;
  }
  async function discover() {
    try {
      await privateFile(directory, true);
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
    const candidates = await Promise.all(
      (await readdir(directory))
        .filter((name) => /^[a-z0-9-]{1,80}\.json$/.test(name))
        .map(async (name) => {
          try {
            await privateFile(join(directory, name));
            const host = JSON.parse(
              await readFile(join(directory, name), "utf8"),
            );
            if (
              host.protocol !== 1 ||
              host.instance !== name.slice(0, -5) ||
              !/^[a-f0-9]{64}$/.test(host.token) ||
              (selected && host.instance !== selected)
            )
              return null;
            safeAddress(host.url);
            if ((await post(host, "/status", {})).protocol !== 1) return null;
            return host;
          } catch {
            return null;
          }
        }),
    );
    return candidates.filter(Boolean);
  }
  async function tick() {
    if (stopping || offline) return;
    try {
      if (lease) {
        await post(descriptor, "/heartbeat", { lease });
        return;
      }
      const hosts = await discover();
      if (hosts.length > 1) {
        report("HOST_INSTANCE_REQUIRED: set FLOATBOAT_HOST_INSTANCE");
        return;
      }
      if (!hosts.length) {
        report("HOST_NOT_CONNECTED");
        return;
      }
      descriptor = hosts[0];
      const result = await post(descriptor, "/connect", input, 15000);
      if (!result.lease || !result.connection?.token)
        throw new Error("HOST_CONNECTION_INVALID");
      safeAddress(result.connection.url);
      lease = result.lease;
      selected = descriptor.instance;
      if (!stopping) {
        publish(result);
        report("HOST_CONNECTED");
      }
    } catch (error) {
      if (stopping) return;
      if (lease)
        await post(descriptor, "/disconnect", { lease }).catch(() => {});
      lease = undefined;
      if (value) publish(null);
      if (!stopping)
        report(
          /^[A-Z][A-Z_]+$/.test(error.message)
            ? error.message
            : "HOST_NOT_CONNECTED",
        );
    }
  }
  const poll = () => {
    if (!running)
      running = tick().finally(() => {
        running = undefined;
      });
    return running;
  };
  if (offline) report("HOST_OFFLINE");
  else {
    await poll();
    timer = setInterval(poll, intervalMs);
    timer.unref();
  }
  return {
    current: () => value,
    async close() {
      stopping = true;
      clearInterval(timer);
      controller.abort();
      await running?.catch(() => {});
      if (lease)
        await post(
          descriptor,
          "/disconnect",
          { lease },
          1500,
          new AbortController().signal,
        ).catch(() => {});
      lease = undefined;
      publish(null);
    },
  };
}
