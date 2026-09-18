# Local verification — 2026-09-18

Validated on macOS arm64 with Node 22.22.2 and pnpm 10.22.0. The candidate was copied to a clean temporary directory with no node_modules, generated files, preview data or access to Desktop source through its commands.

| Check | Result |
| --- | --- |
| Frozen public dependency install with lifecycle scripts disabled | Passed |
| Initialize a readable registry name and Chinese display metadata | Passed |
| SDK and tooling strict TypeScript, manifest/dependency checks, server/UI build | Passed |
| Application test | 1 passed |
| Authoring integration tests | 5 passed |
| Real HTTP authentication and cross-origin rejection | Passed |
| Real SQLite write, restart persistence, concurrent data lock | Passed |
| Missing platform connection | HOST_NOT_CONNECTED, no fabricated success |
| Browser refresh, 1280px/375px, reduced motion, overflow, error/retry and keyboard focus | Passed |
| Missing preview-token URL | Visible error without an unhandled page exception |
| Browser page/console errors during verified flows | None |
| CLI `pnpm dev` and Ctrl+C | Startup succeeded; service stopped and startup configuration removed |
| Source package read by the current Desktop transfer worker | Passed, 18 source files, 15,409 application bytes, 0 data bytes, no inspection warnings |
| Existing export overwrite prevention and generated/private directory exclusion | Passed |

Tooling tests also reject duplicate initialization, invalid metadata, source symlinks, type errors and browser imports of Node APIs. Export validates a frozen source copy before publishing the local artifact.

Not verified in this local run: Windows/Linux, the complete Electron import/trust flow, an actual authorized platform connection, or a session executed by external Codex/Claude Code. The existing Desktop **archive inspector** was exercised; this is not a claim of full Electron acceptance. External agent instruction discovery follows the official documented entry points below. The code is now hosted in the private floatboatai/floatboat-workbench-template repository. No public release or open-source license grant has been created.

References for entry points and runtime flags:

- [Codex AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [Claude Code CLAUDE.md imports](https://code.claude.com/docs/en/memory)
- [Node 22 TypeScript support](https://nodejs.org/docs/latest-v22.x/api/typescript.html): tests explicitly enable type stripping for Node 22 releases before it became the default.
