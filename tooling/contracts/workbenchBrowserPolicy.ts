// ABOUTME: 工作台浏览器网络、隔离与静态目录声明；不授予 Host 能力。
import { z } from 'zod';

const origin = z
  .string()
  .max(256)
  .refine((value) => {
    try {
      if (/[\s;,'"<>\\]/u.test(value)) return false;
      const url = new URL(value);
      const secure = ['https:', 'wss:'].includes(url.protocol);
      const local =
        ['http:', 'ws:'].includes(url.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      return (secure || local) && value === url.origin && !url.hostname.includes('*') && !url.username && !url.password;
    } catch {
      return false;
    }
  }, '网络来源必须是精确 HTTPS/WSS origin；仅回环地址可用 HTTP/WS');

export const workbenchBrowserPolicySchema = z
  .object({
    connectOrigins: z
      .array(origin)
      .max(32)
      .refine((values) => new Set(values).size === values.length, '网络来源不能重复')
      .optional(),
    blobWorkers: z.boolean().optional(),
    crossOriginIsolated: z.boolean().optional(),
  })
  .strict();

const directory = z
  .string()
  .min(1)
  .max(256)
  .refine(
    (value) =>
      /^[a-zA-Z0-9_-][a-zA-Z0-9_./-]*$/.test(value) && value.split('/').every((part) => part && !part.startsWith('.')),
    '静态目录必须是工程内相对路径',
  );

export const workbenchStaticAssetSchema = z
  .object({
    source: directory.refine(
      (value) =>
        !/(?:^|\/)(?:sdk|node_modules|dist|migrations)(?:\/|$)/i.test(value) &&
        !/^src\/(?:server|contracts)(?:\/|$)/i.test(value),
      '静态资源不能来自服务端或受管目录',
    ),
    target: directory.refine(
      (value) => !/^(?:assets|api|__workbench|index\.html)(?:\/|$)/i.test(value),
      '静态资源不能覆盖保留 URL',
    ),
  })
  .strict();
