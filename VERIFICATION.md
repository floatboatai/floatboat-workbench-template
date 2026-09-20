# Local verification — 2026-09-18

## 2026-09-20 Remote-clone application and Electron handoff

Pushed live preview and Connector SDK/guidance to the private template repository (`6269987`), cloned that remote revision into a separate application checkout and built a project delivery workbench with CRUD, SQLite, fixed assets, managed delivery files and a bundled deterministic Workflow.

The exercise exposed a missing Workflow status contract: success is `succeeded`, not the Agent task status `completed`. The SDK now exports `WorkflowRunStatus`, and the workflow topic explicitly documents active and terminal states. Application SDK/build/tests and Skill checks pass after this correction.

Real standalone Chrome covered CRUD, filtering, file persistence, source live reload, failed-save recovery, unavailable Workflow/Connector states and 360/768/1280 layouts. Packaged macOS Electron then imported the real source package, restored dependencies, required trust before execution, ran the actual bundled Workflow, retained the process after panel close, persisted the auto-start preference, and exported/imported SQLite plus the declared delivery file into a separate workspace. Account/entitlement setup and native dialog choices used the isolated E2E harness; packaging, compilation, SQLite, file resources and Workflow execution used their real implementations. This does not verify production account entitlement, third-party OAuth, paid models, Windows/Linux or public store publishing.

## 2026-09-20 Standalone live reload and package handoff

`pnpm dev` now watches source, validates isolated snapshots and reloads a stable authenticated preview page. Build failures retain the old version; startup failures restore its data and service. `pnpm run package` aliases the existing `.fbworkbench` exporter and prints Floatboat import instructions. README and the canonical authoring Skill cover standalone and Host update behavior.

Validated locally on macOS arm64 / Node 22.22.2 / pnpm 10.22.0:

- Tooling suite: 14 passed; the extended live-preview suite passed 2 cases, covering initial failure cleanup plus real saves, generated-output exclusion, active-work waiting, database/file persistence, startup rollback, subsequent recovery and stop during rebuild. Together these cover 15 distinct tooling cases.
- A fresh copy without generated files, dependencies, Desktop configuration or data completed frozen installation, initialization, application test/typecheck/build and `pnpm run package`.
- Real Chrome: authenticated iframe startup, refresh, automatic save reload, failed save retaining the previous page, correction, missing-link state, 1280px/375px screenshots and SIGINT cleanup passed with no page/console errors. Preview status supports English and Chinese.
- Current Desktop transfer worker inspected the generated application package: 18 source files, 15,481 application bytes, zero data bytes, no warnings. This validates archive compatibility, not the full Electron import/trust journey.
- Skill links/discovery validation and canonical skill format validation passed; changes remain local and unpushed.

Windows/Linux, authorized platform services and a full Electron installation were not exercised in this update. Persistent preview data is excluded from exported packages.

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

## 2026-09-20 Connector authorization integration

Added portable `connectedServices` declarations and synchronized the Host SDK for requesting/observing authorization, reading account bindings and calling a logical service. The authoring guide distinguishes pre-authorization catalog discovery from runtime execution and Host-local account bindings.

The existing 12 tooling tests and 1 application test passed. A new targeted export test verified that service declarations survive `.fbworkbench` packaging while personal connectionId fields are rejected by the manifest. Final application/SDK check and skills:check passed. Desktop separately passed 114 focused tests, a packaged Electron cancellation flow, and browser fixture checks at desktop and narrow widths. No real Gmail OAuth or Gmail business operation was performed. These changes are local and have not been pushed.
