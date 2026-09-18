# Workbench authoring

Build the user's business application in `app/`. Read `app/REQUIREMENTS.md` first; record the users, business objects, primary flow and acceptance criteria before editing business code. The initial screen is a neutral scaffold, not an implemented business application.

## Work sequence

1. Inspect `git status`, `package.json` and `app/manifest.json`. Preserve existing user edits. On a fresh template, run `pnpm install --frozen-lockfile --ignore-scripts`, then `pnpm workbench:init -- --registry readable-english-name --name "Display name" --description "What the application does"`. On an initialized project, edit metadata in place; keep its appId stable.
2. Read `app/ENGINEERING.md` before adding routes, persistence or dependencies; read `app/DESIGN.md` before editing pages. Business code belongs in `app/src`, migrations in `app/migrations`, tests in `app/tests`. Generated SDK/build files are rebuilt by the tools.
3. Maintain `app/manifest.json` alongside changes. Read `docs/manifest.md` when changing identity, versions, capabilities, release notes or compatibility. A capability declaration records intent; it does not grant access.
4. Run `pnpm workbench:check` and `pnpm test`. Resolve diagnostic causes rather than suppressing types or bypassing checks. When changing the template tooling, also run `pnpm test:tooling`.
5. Run `pnpm dev` and open the complete URL printed in the terminal. Verify the primary flow, persistence after restart, empty/loading/error states, keyboard use and a narrow viewport. Restart the command after source changes; hot reload is not provided. Stop with Ctrl+C.
6. For delivery, run `pnpm workbench:pack`. Report the artifact path, checks run and any unverified platform integration. Exporting is local and does not submit to the store.

## Runtime boundaries

- UI code uses `app/sdk/browser.mjs` to call the application's `/api/` routes. Node, SQLite and platform SDK calls belong in `app/src/server`.
- Use parameterized SQL and append migrations once applied. The `.local/` directory contains real preview data and temporary credentials; reset or delete it only when the user requests data removal.
- Standalone preview provides real HTTP and SQLite. Platform calls return `HOST_NOT_CONNECTED` until an authorized Host connection exists. Read `docs/platform.md` for integration; do not invent successful model, workflow, calendar or service results.
- Floatboat-specific MCP tools are optional and may not exist in the current agent. Use the repository commands for local work. Do not assume the agent is a Floatboat session.
- Keep appId (local identity), registryName (human-readable store coordinate), display name, app version and SDK version distinct.
- Source exports exclude preview data, secrets, SDK output and dependencies. Place distributable assets inside `app/src/`. Keep credentials out of source and manifest.

## Completion

Deliver working code, updated requirements and manifest, passing relevant checks, the preview/export instructions and explicit limitations. Browser checks and platform authorization must be reported separately from a successful build. The repository is privately hosted under floatboatai. Making it public or applying an open-source license requires a separate owner decision; see `PUBLICATION.md`.
