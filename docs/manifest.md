# Manifest contract

The validator is `tooling/contracts/workbenchManifest.ts`. `pnpm workbench:check` uses it before compiling; unknown fields and unsupported runtime/SDK combinations fail. Keep `app/manifest.json` synchronized with the application.

| Field | Meaning and authoring rule |
| --- | --- |
| `appId` | Local source identity. `workbench:init` creates it once. Floatboat import creates a fresh installation identity. Never use this UUID as a public listing default. |
| `registryName` | Readable lowercase English listing coordinate using letters, digits, hyphens or underscores, starting and ending with a letter or digit. Independent from display name; initialized explicitly. Store availability is checked when publishing. |
| `name`, `description` | Human-readable title and purpose; Chinese is supported. Defaults are starter text that the author updates. |
| `version` | Application version. Store releases require stable `MAJOR.MINOR.PATCH`; already submitted releases are immutable, so publish changes under a newer version. |
| `changelog` | Optional release notes. Describe real changes; for the first release describe the implemented capabilities. |
| `runtime`, `sdkVersion`, `build` | Compatibility contracts selected by the toolchain. Do not guess a newer profile or edit these to bypass a failure. |
| `capabilities` | Declare only used platform domains: llm, agent, asr, workflows, connected-services, calendar, automation. Local-only apps may use an empty array. Declaring one does not connect or authorize it. |
| `minDesktopVersion` | Optional verified minimum Desktop version. Leave absent when unknown. |
| `contributions` | Optional Host entry points. Add only implemented page/action targets. |
| `license` | Optional application license, selected by its owner. The local candidate leaves it absent while its own license is undecided. Store submission may impose separate license requirements. |

Core defaults include `schemaVersion: 1`, `runtime: node22-sqlite-v1`, `sdkVersion: 1.0.0`, build profile `typescript-react-v1`, server `dist/server/index.mjs`, UI `dist/ui`, migrations `migrations`. Metadata beyond the required build contract is encouraged without inventing unsupported capabilities, compatibility or a license.

Workflow/Combo dependencies and file resources use `dependencies` and `resources`; see [resources](resources.md). Absolute local bindings do not belong in manifest.
