# Verify and deliver

1. Run `pnpm workbench:check`. Resolve reported file/line diagnostics. Check validates manifest, dependencies, TypeScript and compilation; it does not exercise business behavior or prove Host connectivity.
2. Run `pnpm test`. Cover the changed business boundaries, persistence and actual call ordering using temporary data. The command discovers top-level `app/tests/*.test.ts`. When changing `tooling/`, `sdk/` or skill tooling, also run the relevant tooling tests and `pnpm skills:check`.
3. Run `pnpm dev`. Open its complete printed URL. Exercise the user's primary flow, refresh, and restart the preview to verify persistence. Check applicable loading/error/empty states, keyboard paths, responsive layout and actual screenshots. If browser tooling is unavailable, record visual validation as unverified.
4. If Host capabilities are used, first validate a truthful unavailable state locally. Export/import into a registered Floatboat instance, bind declared resources/dependencies and perform the authorized real calls there. Keep real external effects within the user's task. Record Host verification separately.
5. For handoff, run `pnpm run package` (or `pnpm workbench:pack`) and report the artifact path plus **Floatboat → My → Workbenches → Import workbench**. The CLI rejects an existing output path; choose a new absolute output when retaining prior artifacts. The package carries source, portable declared dependencies and fixed resources, but excludes node_modules, generated output, preview data and credentials. Verify Host import separately; successful packaging alone does not prove installation or platform authorization.

Manifest changes need check/pack validation even when the UI is unchanged. For declared resources, verify the import bindings and missing-required state. The standalone exporter excludes business data; use Floatboat's export option when testing a data-bearing package. Do not invent a CLI include-data flag.

## Diagnose the failing layer

| Result | Next action |
| --- | --- |
| NODE_VERSION_REQUIRED | Use the Node 22.x runtime range in package.json |
| ALREADY_INITIALIZED | Edit metadata in place and preserve appId |
| APP_LOCKFILE_STALE / dependency mismatch | Reconcile package manifests, locks and installed versions; then check |
| WORKBENCH_CHECK_FAILED / TS diagnostic | Fix the referenced source and rerun check |
| PREVIEW_LINK_REQUIRED / 401 | Open the complete preview URL, keeping its page authorization in the local tab |
| HOST_NOT_CONNECTED | Local preview is disconnected; test unavailable UI or continue with Host import |
| WORKBENCH_DEPENDENCY_UNBOUND / RESOURCE_UNBOUND | Supply a portable declared bundle/resource or establish the Host-local binding |
| Migration checksum or data-lock error | Preserve data and applied migrations; stop the owning preview or add a new migration |
| Preview exits | Inspect the application exception and startup output; the Node version footer alone is not the cause |

Report changed behavior, checks actually run, preview/export instructions and unverified integrations. Avoid treating generated code, a successful build or a ready HTTP server as completed business/visual acceptance.
