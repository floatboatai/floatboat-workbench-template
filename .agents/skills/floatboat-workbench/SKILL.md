---
name: floatboat-workbench
description: Create, modify, preview, validate or export a Floatboat workbench in this template repository. Use for business UI, server routes, SQLite, manifest metadata, Workflow/Combo dependencies, file resources and Host SDK integration.
---

# Floatboat workbench authoring

Build the user's application in this repository's `app/`. Locate the repository by `tooling/cli.mjs` and `app/manifest.json`; run all commands below from that root. Preserve the user's existing source, appId, migrations and data. This skill accompanies the template checkout, not a personal installation detached from it.

## Choose the execution environment

The template works **without Floatboat**. Use the repository CLI for this checkout. Floatboat authoring tools belong to a registered Desktop workbench and are not prerequisites for local development. The [runtime guide](references/runtime.md) maps the two environments. Local preview has real HTTP and SQLite. A running compatible Floatboat client is discovered automatically for standard Host SDK calls; no import is required. Follow repository `docs/platform.md` for connection, permissions and offline behavior.

## Work sequence

1. Inspect `git status`, `package.json`, `app/manifest.json` and `app/REQUIREMENTS.md`. Record the actual users, business objects, primary task and acceptance criteria. If the app is already initialized, keep its identity and extend the current implementation.
2. For a fresh checkout, install the pinned dependencies with `pnpm install --frozen-lockfile --ignore-scripts`. Initialize only when appId is `workbench.starter`:
   ```sh
   pnpm workbench:init -- --registry project-tracker --name "Project Tracker" --description "Track projects and follow-ups"
   ```
   Choose values from the user's business goal. `registryName` is a readable English coordinate; display names may be Chinese. Read [engineering](references/engineering.md) and [design](references/design.md) when creating the application; maintain `app/ENGINEERING.md` and `app/DESIGN.md` with the decisions used.
3. Implement the requested flow in `app/src/`, using the references below for the domains touched. Keep manifest declarations synchronized with implemented behavior. Use `app/sdk/*.d.mts` after the first check, or `sdk/*.mts` before generation, for exact signatures.
4. Run `pnpm workbench:check` and `pnpm test`. Then run `pnpm dev`, open the complete printed URL and exercise the real primary flow, persistence and failure states. Source saves are checked and reloaded automatically; see [runtime](references/runtime.md) for failure recovery and single-run preview. Use [verification](references/verification.md) to distinguish build, business, visual and Host results.
5. When handing off an application, run `pnpm run package` (alias of `pnpm workbench:pack`), report the resulting `.fbworkbench` path and explain **Floatboat → My → Workbenches → Import workbench**. Export creates a source package for a new Host installation; see repository `docs/platform.md` for dependency setup and authorization. Publishing, changing repository visibility or selecting a license requires the corresponding user request.

## Read only the relevant topics

These topics are also available without installing dependencies through `node tooling/guide.mjs --topic TOPIC`, or `pnpm workbench:guide -- --topic TOPIC`. List them with `pnpm workbench:guide -- --list`.

| Task | Reference |
| --- | --- |
| Source structure, runtime dependencies, manifest, release metadata | [engineering](references/engineering.md) |
| Business page layout, states and accessibility | [design](references/design.md) |
| Build, preview, delivery and failure diagnosis | [verification](references/verification.md) |
| Local server, commands and Host tool equivalents | [runtime](references/runtime.md) |
| Browser connection, theme and Host contributions | [ui](references/ui.md) |
| Business tables, migrations and transaction boundaries | [database](references/database.md) |
| Workflow/Combo declarations and portable file resources | [resources](references/resources.md) |
| Model text, structured output or streaming | [llm](references/llm.md) |
| Agent tasks with tools and an explicit execution directory | [agent](references/agent.md) |
| Streaming speech recognition | [asr](references/asr.md) |
| Starting or observing a declared Workflow | [workflows](references/workflows.md) |
| Connected third-party services and account selection | [connected-services](references/connected-services.md) |
| Ordinary calendar events | [calendar](references/calendar.md) |
| Scheduled Agent tasks | [automation](references/automation.md) |

## Delivery boundary

The UI calls its own API through `getPageConnection()`/`page.fetch`; Node, SQL and Host calls stay on the server. `.local/` holds persistent preview data and transient authorization material, and stays outside application source and exports. Use the user's actual authorization for external effects. Report unavailable platform integration or unavailable browser verification as unverified, not successful.
