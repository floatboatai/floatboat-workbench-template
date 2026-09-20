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

## 2026-09-18 local resource contract update

The template now declares dependencies/resources, includes the resource SDK, and exports v2 packages with project assets and portable dependency bundles. External bindings remain Host-local. The updated tooling suite passed 6 tests, and the application test passed. Desktop separately validated resource/dependency archive import, configuration gating and source baselines.

## 2026-09-20 authoring Skill

Added the canonical `.agents/skills/floatboat-workbench/` Skill, 15 topic mappings, a generated Claude entry and the dependency-free guide CLI. Root AGENTS/README point to this entry; creation and runtime steps distinguish the standalone checkout from a registered Host workbench. Source alignment and reference notices are recorded in `docs/skill-provenance.md`.

Validation:

- `pnpm test:tooling`: 12 passed (6 existing application/toolchain cases and 6 Skill cases).
- `pnpm test`: 1 passed; the command also typechecks/builds the application and SDK.
- `pnpm skills:check`: all 15 topic files and Markdown links resolve; the generated Claude entry matches the canonical discovery metadata.
- skill-creator quick_validate.py: canonical and Claude entry both valid.
- Compared topics.json to Desktop getWorkbenchAuthoringGuideInputSchema: the 15 topic names match exactly.
- A temporary copy without node_modules can print runtime guidance from a different cwd and creates no preview/config/build directories. Unknown topics fail; sync is idempotent and preserves unrelated or handwritten skills.
- `git diff --check` and the updated OpenSpec strict validation passed.

No additional live Codex/Claude session, Windows session or authorized platform call was launched for this documentation/tooling change. Discovery directories follow the linked official conventions; model behavior is not inferred from file checks. The repository remains private; public visibility and licensing are unchanged.
