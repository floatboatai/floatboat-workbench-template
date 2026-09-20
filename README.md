# Floatboat workbench template

Create a workbench with Codex, Claude Code or another coding tool. Run its React page, Node HTTP service and SQLite locally without installing Floatboat. Development is hosted in the private [floatboatai/floatboat-workbench-template](https://github.com/floatboatai/floatboat-workbench-template) repository. It is not open source and no open-source license has been selected; see [publication status](PUBLICATION.md).

[中文说明](README.zh-CN.md) · [Agent instructions](AGENTS.md) · [Authoring skill](.agents/skills/floatboat-workbench/SKILL.md)

## Start

Use Node **22.16+ in the 22.x series** and pnpm **10.22.0** (also declared in package.json).

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm workbench:init -- --registry project-tracker --name "Project Tracker" --description "Track projects and follow-ups"
pnpm workbench:check
pnpm test
pnpm dev
```

Open the complete loopback URL printed by the last command. `pnpm dev` watches source saves, checks an isolated snapshot, then safely restarts the service and refreshes the same page. Check failures keep the previous version; startup failures restore its data and service. Page state may reset. Ctrl+C stops the preview; data persists in `.local/data/`. Use `pnpm dev -- --no-watch` for a single run. Restart the command after changing template SDK/tooling or installing dependencies. The first check builds the included SDK and compiler from source. After cloning this repository with authorized access, no Desktop checkout or platform credentials are needed for local preview. Node's SQLite module is experimental in this runtime profile; the launcher suppresses that known warning, not application errors.

With a compatible Floatboat client running and signed in, `pnpm dev` automatically connects standard Host SDK capabilities, including Agent and LLM. No import is required. See [platform connection](docs/platform.md) for permissions, reconnect and multiple-client selection.

Use this prompt from the repository root:

> Read AGENTS.md. Build a workbench for [users and business goal]. Record requirements, implement the business flow in app/, keep the manifest accurate, run checks and tests, and validate the real local preview.

The repository includes the `floatboat-workbench` Skill, with 15 topics matching the existing Floatboat creation guide. From a new session in this checkout:

- Codex: `$floatboat-workbench Build a workbench for [users and business goal]`.
- Claude Code: `/floatboat-workbench Build a workbench for [users and business goal]`.
- Other tools: ask them to read `.agents/skills/floatboat-workbench/SKILL.md`; AGENTS.md also points there.

The canonical `.agents/skills` location follows [Codex skill discovery](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills). The generated `.claude/skills` entry follows [Claude Code project skills](https://code.claude.com/docs/en/skills#where-skills-live) and points to the same guidance. `CLAUDE.md` still imports AGENTS.md. No Floatboat MCP installation is needed to read or use the local authoring guidance.

```sh
pnpm workbench:guide -- --list
pnpm workbench:guide -- --topic resources
# Before dependency installation, plain Node can also read a topic:
node tooling/guide.mjs --topic runtime
```

The runtime topic maps Host authoring tools to the local CLI. SDK topics explain the actual platform integration and the disconnected preview state. Maintain only the canonical Skill; `pnpm skills:sync` refreshes the Claude entry, and `pnpm skills:check` checks topics, links and entry consistency.

## Layout

| Path | Purpose |
| --- | --- |
| `app/` | Business source, manifest, requirements, migrations and tests |
| `sdk/` | SDK source, compiled into ignored `app/sdk/` |
| `tooling/` | Portable compiler, manifest/transfer contracts and CLI |
| `.agents/skills/floatboat-workbench/` | Canonical authoring Skill and topic references |
| `.claude/skills/floatboat-workbench/` | Generated Claude entry pointing to the canonical Skill |
| `.local/` | Ignored preview database and short-lived configuration |
| `.generated/` | Ignored compiler and SDK outputs |
| `artifacts/` | Ignored application packages |

## Deliver

```sh
pnpm run package
# Equivalent existing command
pnpm workbench:pack
# Optional: an absolute custom destination
pnpm workbench:pack -- --output /absolute/path/project-tracker.fbworkbench
```

The command prints the `.fbworkbench` path under `artifacts/` and import instructions. It is a package.json script for Floatboat application delivery; `pnpm pack` creates an npm archive and is not the import format.

In Floatboat, open **My → Workbenches → Import workbench**, select the file, review its details and confirm import. The client downloads locked dependencies, builds the source and initializes a **new independent workspace**. Import needs network access for missing dependencies and passes the client's compatibility, access and trust checks. Bind resources and authorize declared platform services after importing. Floatboat Agent is not needed to create the package. See [platform connection](docs/platform.md) if the entry is unavailable.

The package contains application source, migrations, tests, declared fixed resources and portable Workflow/Combo bundles. It excludes preview data, credentials, node_modules, generated SDK and compiled output. Existing output files are preserved: choose a new destination or explicitly remove an obsolete artifact. Import does not update an existing installation or submit a store listing.

Platform features are a separate integration: [connection boundary](docs/platform.md). Application metadata and releases: [manifest contract](docs/manifest.md). Toolchain changes and license readiness: [maintenance](docs/maintenance.md).
