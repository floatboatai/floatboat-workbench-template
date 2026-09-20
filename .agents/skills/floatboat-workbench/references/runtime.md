# Runtime and authoring commands

Use Node 22.16+ within 22.x and the pnpm version pinned in package.json. The repository root contains the tools; `app/` contains the business application. The CLI rebuilds the SDK/compiler as needed. A check does not install application dependencies or run the business server.

| Intent | This template checkout | Registered Floatboat workbench only |
| --- | --- | --- |
| Create | Initialize `app/manifest.json` with `pnpm workbench:init` | `create_workbench_project` returns the owned absolute source directory |
| Read guidance | `pnpm workbench:guide -- --topic runtime` | `get_workbench_authoring_guide` |
| Check | `pnpm workbench:check` | `check_workbench_project` |
| Test | `pnpm test` uses `app/tests/*.test.ts` | Run project tests using the available Host toolchain |
| Run | `pnpm dev`; source saves trigger checked live reload | `workbench_runtime open` applies the current source |
| Show UI | Open the complete URL printed by the preview | `workbench.open` shows the registered Workspace panel |
| Inspect failures | Read check output and the preview terminal | `workbench_runtime status/logs` |
| Stop | Ctrl+C in the preview terminal | `workbench_runtime stop`; closing the panel keeps the service alive |
| Refresh SDK | Adopt a reviewed template SDK/tooling update, then check | `workbench_runtime refresh-sdk` preserves a backup |
| Export | `pnpm run package` / `pnpm workbench:pack`, optionally `-- --output /absolute/path/app.fbworkbench` | Host export can also include registered business data |

Host tool names are mappings, not shell commands to invent in an external session. External `pnpm dev` automatically connects to a compatible running Floatboat client for standard SDK calls; see repository `docs/platform.md`. Developer Pair remains separate and applies to an already registered/trusted Host instance.

## Source updates

Standalone `pnpm dev` keeps a fixed preview URL, coalesces source saves and builds an isolated snapshot. A passing check waits for active work, backs up preview data, restarts the service and refreshes the page. A check failure leaves the old version running; a startup failure restores the old data and service. Read the terminal diagnostics and fix the source; the next save retries. Page state may reset. Generated files, dependencies and local data do not trigger rebuilds. Use `pnpm dev -- --no-watch` for one run; restart after changing SDK/tooling, installing dependencies or changing appId. Ctrl+C closes the watcher and services while retaining preview data. If recovery itself fails, preserve the reported recovery directory and diagnose before starting again.

In Floatboat, ordinary panel opening reuses the last validated version. Explicit refresh or `workbench_runtime open` validates current source. The panel's lightning toggle enables automatic source updates for that installed workbench; it is off by default. Closing the panel keeps its service alive. This Host preference is local and does not belong in manifest.json or an exported package.

The server entry in `app/src/server/index.ts` creates one application:

```ts
import { createWorkbenchServer } from '../../sdk/runtime.mjs';
const app = await createWorkbenchServer(import.meta.url);
app.route('GET', '/api/health', () => ({ ready: true }));
await app.listen();
```

Register routes before `listen`. Route handlers receive `request`, `url`, `params`, `body`, `database` and `host`; validate JSON bodies as unknown. `app.resources` resolves declared files. `app.action` handles declared Host actions. `app.trackTask` tracks local work and `app.tasks()` exposes its recorded state; use the [Agent API](agent.md) when tools and reasoning are needed.

Preview startup owns `FLOATBOAT_WORKBENCH_CONFIG` and the page authorization URL. Keep configuration and tokens out of source, logs, screenshots and exported reports. The Node process has the developer's OS permissions; loopback/page authentication is not a filesystem sandbox. Preview data persists at `.local/data/<appId>/` and shutdown preserves it.
