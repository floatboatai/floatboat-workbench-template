# Workbench authoring

For creating, changing, previewing, validating or exporting a workbench, read and use [.agents/skills/floatboat-workbench/SKILL.md](.agents/skills/floatboat-workbench/SKILL.md). It routes to the same 15 topics as Floatboat's authoring guide, adapted for this standalone checkout. Read only the topics needed for the task; `pnpm workbench:guide -- --list` lists them without building or connecting to Floatboat.

Build the user's business app in `app/`. Read `app/REQUIREMENTS.md` and preserve existing user changes, identity, migrations and data. Run repository commands from the root. Maintain `app/ENGINEERING.md`, `app/DESIGN.md` and `app/manifest.json` with the implementation.

## Boundaries

- Local preview provides real HTTP and SQLite without Floatboat. The launcher automatically connects to a running compatible Floatboat client; Host capabilities use its normal account/manifest permissions. Offline calls return HOST_NOT_CONNECTED. See docs/platform.md. The skill's runtime topic maps repository commands to Host-only tools.
- UI uses the application's page connection/API; Node, SQL and Host SDK calls belong on the server. `.local/` contains persistent preview data and transient runtime state, and stays outside source packages.
- Application delivery includes working source, accurate declarations, checks actually run, preview/export instructions and any unverified browser/Host behavior.
- Changes to `sdk/` or `tooling/` affect the development platform; read [maintenance](docs/maintenance.md) and run the relevant tooling tests. Generated output is not the editing surface.
- `.agents/skills/floatboat-workbench/` is the guidance source. Generate the `.claude/skills/floatboat-workbench/SKILL.md` compatibility entry with `pnpm skills:sync`; verify it with `pnpm skills:check`. The Claude entry points to the same content and has no separate reference copies.

The repository is privately hosted under floatboatai. Publishing it or choosing an open-source license remains an owner decision; see [PUBLICATION.md](PUBLICATION.md). Exporting an application is not a store submission.
