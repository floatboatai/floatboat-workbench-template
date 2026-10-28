# Engineering and manifest

Read and update `app/ENGINEERING.md` for the actual entrypoints, module responsibilities, data model, external effects and verification commands. Keep small applications small; split files when HTTP, SQL, external calls and page state become entangled.

| Directory | Responsibility |
| --- | --- |
| `app/src/server/` | Service assembly, business routes, rules, SQL and Host integration |
| `app/src/contracts/` | Serializable cross-boundary types and input/response validation |
| `app/src/ui/` | React pages, components, business state and CSS/assets |
| `app/migrations/` | Append-only numbered SQL migrations |
| `app/tests/` | Business contract and integration tests using temporary data |

Use strict TypeScript and unknown plus validation for external JSON. The compiler rejects explicit any, type-check suppression and server/Node imports from UI. Edit source and the declarative manifest/build configuration; `app/dist/`, `app/sdk/` and `.generated/` are generated. Application Vite/PostCSS configs, plugins and package scripts are not the Host build interface.

For an additional pure-JS runtime dependency, choose an exact compatible version and update both the root and `app/` package/lock files using pnpm (`pnpm add --save-exact package@version`, then the corresponding command from `app/`). The root toolchain supplies TypeScript, Vite and esbuild. Native modules are outside this application profile. Checking verifies the lock against installed versions; it does not repair dependencies through network access.

## Metadata

The maintained full schema is `tooling/contracts/workbenchManifest.ts`; repository `docs/manifest.md` explains its fields.

- Preserve `appId` after initialization. Use a readable lowercase English `registryName` with letters/digits/hyphens/underscores, not the local UUID. Name and description describe the actual business purpose in the user's language.
- Keep `runtime`, `sdkVersion`, `build.profile`, server, UI and migrations compatible with the shipped toolchain. Change business code to resolve diagnostics rather than inventing profile versions.
- Declare used platform domains only: llm, agent, asr, workflows, connected-services, calendar, automation. An empty capabilities array is valid for local-only apps.
- Declare dependencies/resources as they are added; see [resources](resources.md). Store absolute paths and installed IDs in Host bindings rather than public metadata or business records.
- Describe real changes in optional changelog. Set optional minDesktopVersion only from verified compatibility, not the current developer machine. License choice belongs to the owner.

Published registryName@version coordinates are immutable. Prepare a higher stable MAJOR.MINOR.PATCH version with accurate change/migration notes for a new submission. `workbench:pack` only produces a local source artifact; it neither submits nor publishes. Keep user customizations and applied migrations when adopting an update. Agent-assisted Host updates edit only the supplied staging candidate and record resolution.md; application of that candidate stays in the Host update flow.

## 浏览器资源与执行策略

涉及绘图、PDF、音视频、字体或 Worker 时，按实际需求配置下列声明，然后重新 check/open（独立模板使用 check/preview）。旧工程先 refresh-sdk；不要修改生成的 SDK。

```json
{
  "build": {
    "profile": "typescript-react-v1",
    "staticAssets": [{ "source": "public", "target": "vendor" }]
  },
  "browser": {
    "connectOrigins": ["https://api.example.com", "wss://sync.example.com"],
    "blobWorkers": true,
    "crossOriginIsolated": true
  }
}
```

- 普通模块资源放 `src/ui/`，用静态 `new URL('./engine.wasm', import.meta.url)` 引用。需要固定路径的字体、WASM、字典和第三方 Worker 放声明的 `source` 目录；示例 `public/fonts/font.ttf` 在运行时是 `/vendor/fonts/font.ttf`。这些文件随源码包交付，客户端重建时恢复路径。静态目录只放公开资源；文件必须满足支持的扩展名，禁止私有/隐藏文件、链接、原生程序、服务端源码和保留 URL 覆盖，合计不超过 100 MiB/10000 个文件。
- Blob 图片和字体可直接使用；TTF/OTF/WOFF/WOFF2、WebP/JPEG/GIF/AVIF 与 WASM 有正确 MIME。WASM 保留独立文件，使用 `WebAssembly.instantiateStreaming(fetch(url))`。
- 同源 Worker 使用 `new Worker(new URL('./worker.ts', import.meta.url), {type:'module'})`。Worker 也执行浏览器构建边界校验。只有库需要动态 Blob Worker 时才声明 `blobWorkers:true`；不声明时保持拒绝。
- `connectOrigins` 只接受精确 origin：HTTPS/WSS，或本机开发的回环 HTTP/WS；不含路径、凭据、查询、fragment、通配或 CSP 文本。浏览器直连使用标准 fetch/WebSocket；`page.fetch` 仍只调用本 App API。跨源服务仍需正确 CORS，平台能力继续使用服务端 Host SDK。省略时只允许同源连接。
- 多线程 WASM 声明 `crossOriginIsolated:true`。工作台通过 DIP 与 iframe 委派隔离自身，兼带 COOP/COEP 支持独立顶层页面；外部子资源需 CORS/CORP。先检查 `crossOriginIsolated`，然后使用共享 WebAssembly.Memory 与 Worker。已验证 Electron 39 和完整桌面 Chromium；其它浏览器以探测结果为准，不能用关闭 webSecurity 替代隔离。
- SDK 自动采集 CSP、404、资源加载/MIME 与隔离不可用；Host 用 `workbench_runtime status/logs` 读取，独立页面用 `GET /__workbench/diagnostics`。诊断限制条数并去重，保留错误码与脱敏路径，不保存 URL 凭据、query/hash 或异常正文。按诊断修正声明/打包后重新构建；服务 ready 不等于浏览器业务通过。
