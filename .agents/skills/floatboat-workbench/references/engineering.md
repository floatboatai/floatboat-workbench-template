# Engineering and manifest

Read and update `app/ENGINEERING.md` for the actual entrypoints, module responsibilities, data model, external effects and verification commands. Keep small applications small; split files when HTTP, SQL, external calls and page state become entangled.

| Directory | Responsibility |
| --- | --- |
| `app/src/server/` | Service assembly, business routes, rules, SQL and Host integration |
| `app/src/contracts/` | Serializable cross-boundary types and input/response validation |
| `app/src/ui/` | React pages, components, business state and CSS/assets |
| `app/migrations/` | Append-only numbered SQL migrations |
| `app/tests/` | Business contract and integration tests using temporary data |

Use strict TypeScript and unknown plus validation for external JSON. The compiler rejects explicit any, type-check suppression and server/Node imports from UI. Edit source and the declarative manifest/build configuration; `app/dist/`, `app/sdk/` and `.generated/` are generated. Application Vite/PostCSS configs, plugins and package scripts are not the Host build interface.

For an additional pure-JS runtime dependency, choose an exact compatible version and update both the root and `app/` package/lock files using pnpm (`pnpm add --save-exact package@version`, then the corresponding command from `app/`). The root toolchain supplies TypeScript, Vite and esbuild. Native modules are outside this application profile. Checking verifies the lock against installed versions; it does not repair dependencies through network access.

## Metadata

The maintained full schema is `tooling/contracts/workbenchManifest.ts`; repository `docs/manifest.md` explains its fields.

- Preserve `appId` after initialization. Use a readable lowercase English `registryName` with letters/digits/hyphens/underscores, not the local UUID. Name and description describe the actual business purpose in the user's language.
- Keep `runtime`, `sdkVersion`, `build.profile`, server, UI and migrations compatible with the shipped toolchain. Change business code to resolve diagnostics rather than inventing profile versions.
- Declare used platform domains only: llm, agent, asr, workflows, connected-services, calendar, automation. An empty capabilities array is valid for local-only apps.
- Declare dependencies/resources as they are added; see [resources](resources.md). Store absolute paths and installed IDs in Host bindings rather than public metadata or business records.
- Describe real changes in optional changelog. Set optional minDesktopVersion only from verified compatibility, not the current developer machine. License choice belongs to the owner.

Published registryName@version coordinates are immutable. Prepare a higher stable MAJOR.MINOR.PATCH version with accurate change/migration notes for a new submission. `workbench:pack` only produces a local source artifact; it neither submits nor publishes. Keep user customizations and applied migrations when adopting an update. Agent-assisted Host updates edit only the supplied staging candidate and record resolution.md; application of that candidate stays in the Host update flow.
