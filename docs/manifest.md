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
| `build.staticAssets` | 工程内公开目录的 source → target URL 前缀映射；随源包交付和重建，拒绝私有文件、链接与保留路径覆盖。 |
| `browser` | `connectOrigins` 精确网络来源、`blobWorkers` 与 `crossOriginIsolated` 按应用声明；配置和验证见 [engineering](../.agents/skills/floatboat-workbench/references/engineering.md#浏览器资源与执行策略)。 |
| `capabilities` | Declare only used platform domains: llm, agent, asr, workflows, connected-services, calendar, automation, workspaces. Local-only apps may use an empty array. Declaring one does not connect or authorize it. |
| `minDesktopVersion` | Optional verified minimum Desktop version. Leave absent when unknown. |
| `contributions` | Optional Host entry points. Add only implemented page/action targets. |
| `license` | Optional application license, selected by its owner. The local candidate leaves it absent while its own license is undecided. Store submission may impose separate license requirements. |

Core defaults include `schemaVersion: 1`, `runtime: node22-sqlite-v1`, `sdkVersion: 1.0.0`, build profile `typescript-react-v1`, server `dist/server/index.mjs`, UI `dist/ui`, migrations `migrations`. Metadata beyond the required build contract is encouraged without inventing unsupported capabilities, compatibility or a license.

Workflow/Combo dependencies and file resources use `dependencies` and `resources`; see [resources](resources.md). Absolute local bindings do not belong in manifest.

For website account onboarding, declare `workspaces` and `workflows` as used; persist account-to-workspace associations and operation keys in the business database. Read the [workspaces guide](../.agents/skills/floatboat-workbench/references/workspaces.md) for isolated login state and navigation confirmation. The starter keeps an empty capability list until a business app needs these operations.

## Connector services

Declare `connectedServices: [{ "id": "mail", "provider": "connector:gmail" }]` with the `connected-services` capability. The logical id travels with source; Host stores each user’s authorized account binding separately. See the [authoring guide](../.agents/skills/floatboat-workbench/references/connected-services.md).
