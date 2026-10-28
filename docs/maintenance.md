# Template maintenance

Application authoring belongs in `app/`; changing `sdk/` or `tooling/` changes the development platform and requires `pnpm test:tooling` in addition to the application checks.

The candidate keeps exact dependency versions and a root lockfile. `app/package.json` and its lockfile describe only the distributable application. If a new pure-JS runtime dependency is needed, install the same version at the root and in app, update both lockfiles, then rerun checks. Native dependencies and executable application build configs are outside this profile. The checker verifies the app lock against installed versions; it does not install dependencies during a build. The Host still applies its own import/build validation.

`provenance.json` records the source inventory and extraction hashes. SDK implementation and archive/hash logic are carried from that snapshot; contract extraction removes Desktop-only record types, and compiler imports/output paths are adapted for this repository. Local preview and authoring CLI are separate code. Do not manually patch generated `app/sdk`, `app/dist` or `.generated`.

Template version (`package.json`), application version (`app/manifest.json`) and SDK/profile versions (`compatibility.json`) have separate meanings. Updating the template does not silently update a user's business code, database migrations, installed workbench or published store release. Review template changes as normal Git diffs, preserve existing migrations, and test against local data before adopting them.

Desktop has not switched its template source in this change. Before making this repository the shared source, approve a follow-up that pins a reviewed tag/commit plus integrity hashes and tests generated-source compatibility. Avoid an unpinned runtime download or permanent manual dual maintenance.

Verification commands:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm skills:check
pnpm workbench:check
pnpm test
pnpm test:tooling
pnpm dev
pnpm workbench:pack
```

The tooling tests exercise external resource snapshots, opt-in data export with the SDK lock and SQLite backup, initialization safety, invalid manifest/source links, credential-free local HTTP, unavailable Host calls, SQLite persistence, concurrent data locking, shutdown cleanup and archive validation/exclusion. Browser and full Desktop import validation are separate checks; do not infer them from passing Node tests.

## 浏览器 WebAssembly

`sdk/runtime.mts` 与 `tooling/compiler/worker.ts` 支持随应用源码交付的 `.wasm` 文件：

```typescript
const engineUrl = new URL('./engine.wasm', import.meta.url);
const { instance } = await WebAssembly.instantiateStreaming(fetch(engineUrl));
```

将模块放在 `app/src/ui/` 或资源子目录。构建保留同源文件，即使文件很小也不内联为 data URL；SDK 返回 `application/wasm`，并使用 `script-src 'self' 'wasm-unsafe-eval'`。JavaScript eval/Function 和内联脚本保持受限；网络、Blob Worker 与多线程按 manifest.browser 声明，详见创作 engineering 指引。

修改上述真源后运行 `pnpm workbench:check`、`pnpm test`、`pnpm test:tooling`，再重启预览。不要手改生成的 `app/sdk` 或 `.generated`。源码包携带 WASM 源文件，Desktop 导入时补齐自己的 SDK 并重建，因此需要配套更新客户端；已有客户端工程使用 `workbench_runtime refresh-sdk` 后重新 check/open。外层预览壳不执行 WASM，其 CSP 保持原有范围。

Standalone live reload lives in `tooling/live-preview.mjs` and the fixed preview page. Local transport protocol v2 removes page/preview/Bearer credentials while preserving account and process context. It checks immutable source snapshots, waits for tracked work, backs up persistent data after stopping the old service and restores data on startup failure. Test actual saves, build/start failures, subsequent recovery and shutdown. The tooling suite runs files sequentially because preparation shares `.generated/`. `package` and `workbench:pack` route to the same source exporter; this is not npm registry publishing.

## Authoring guidance

Edit `.agents/skills/floatboat-workbench/SKILL.md` and its references. `topics.json` keeps the topic names aligned with the Host guide; `tooling/guide.mjs` reads these files without building or installing dependencies. `pnpm skills:sync` regenerates only the Claude entry, preserving unrelated skills; `pnpm skills:check` reports missing references or a stale entry. Commit both discovery entries when publishing repository changes so fresh checkouts have the Skill before running setup.

When Host APIs or authoring topics change, compare the sources recorded in [skill provenance](skill-provenance.md), update the corresponding portable guide and preserve the distinction between a standalone checkout and an installed Host instance. Validate command examples against package.json and signatures against the included SDK. The content should remain usable without the Desktop source repository.

Data-bearing export adapts `WorkbenchDataSnapshot.ts` from Desktop using the same snapshot schema and data lock. `--bindings` controls export only; it does not read private Host settings or change runtime bindings. Keep tests for both application and migration packages.
