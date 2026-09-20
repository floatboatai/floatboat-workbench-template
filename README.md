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

Open the complete loopback URL printed by the last command. Ctrl+C stops the service; preview data persists in `.local/data/`. Restart `pnpm dev` after editing source. The first check builds the included SDK and compiler from source. After cloning this repository with authorized access, no Desktop checkout or platform credentials are needed for local preview. Node's SQLite module is experimental in this runtime profile; the launcher suppresses that known warning, not application errors.

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
pnpm workbench:pack
# Optional: an absolute custom destination
pnpm workbench:pack -- --output /absolute/path/project-tracker.fbworkbench
```

The package contains application source, migrations, tests, declared fixed resources and portable Workflow/Combo bundles. It excludes preview data, credentials, node_modules, generated SDK and compiled output. Existing output files are preserved: choose a new destination or explicitly remove an obsolete artifact. Floatboat can import the source package into a **new independent workspace** and rebuild it with its own toolchain. Imports are subject to its compatibility and trust checks; the package does not update an existing installation or submit a store listing.

Platform features are a separate integration: [connection boundary](docs/platform.md). Application metadata and releases: [manifest contract](docs/manifest.md). Toolchain changes and license readiness: [maintenance](docs/maintenance.md).
