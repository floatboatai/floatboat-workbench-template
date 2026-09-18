# Floatboat workbench template

Create a workbench with Codex, Claude Code or another coding tool. Run its React page, Node HTTP service and SQLite locally without installing Floatboat. Development is hosted in the private [floatboatai/floatboat-workbench-template](https://github.com/floatboatai/floatboat-workbench-template) repository. It is not open source and no open-source license has been selected; see [publication status](PUBLICATION.md).

[中文说明](README.zh-CN.md) · [Agent instructions](AGENTS.md)

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

Codex discovers `AGENTS.md`. Claude Code uses `CLAUDE.md` to import that same file. For other tools, explicitly ask them to read it. These instructions do not require a particular model or Floatboat MCP tools.

## Layout

| Path | Purpose |
| --- | --- |
| `app/` | Business source, manifest, requirements, migrations and tests |
| `sdk/` | SDK source, compiled into ignored `app/sdk/` |
| `tooling/` | Portable compiler, manifest/transfer contracts and CLI |
| `.local/` | Ignored preview database and short-lived configuration |
| `.generated/` | Ignored compiler and SDK outputs |
| `artifacts/` | Ignored application packages |

## Deliver

```sh
pnpm workbench:pack
# Optional: an absolute custom destination
pnpm workbench:pack -- --output /absolute/path/project-tracker.fbworkbench
```

The package contains application source, migrations and tests. It excludes preview data, credentials, dependencies, generated SDK and compiled output. Existing output files are preserved: choose a new destination or explicitly remove an obsolete artifact. Floatboat can import the source package into a **new independent workspace** and rebuild it with its own toolchain. Imports are subject to its compatibility and trust checks; the package does not update an existing installation or submit a store listing.

Platform features are a separate integration: [connection boundary](docs/platform.md). Application metadata and releases: [manifest contract](docs/manifest.md). Toolchain changes and license readiness: [maintenance](docs/maintenance.md).
