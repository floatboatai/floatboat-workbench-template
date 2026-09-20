# Authoring skill provenance

The repository-local `floatboat-workbench` Skill adapts the Floatboat authoring guidance for an external checkout. Its source is `.agents/skills/floatboat-workbench/`; Claude's generated entry references that directory without copying the topic bodies. The guide CLI reads the same files. No runtime connection to the Desktop checkout is required.

Adaptation snapshot: 2026-09-20. The current Desktop sources used for alignment are recorded by relative path below; they are maintenance references, not commands for users of this template to run.

| Topic | Desktop source |
| --- | --- |
| overview | resources/workbench-authoring/SKILL.md |
| engineering, design, verification, resources | resources/workbench-authoring/references/*.md |
| database, runtime, ui, llm, agent, asr, workflows, connected-services, calendar, automation | src/main/workbench/WorkbenchAuthoringService.ts, GUIDES |
| Topic names | src/common/workbench/workbenchAuthoring.ts, getWorkbenchAuthoringGuideInputSchema |
| SDK signatures | src/main/workbench/sdk/*.mts, carried as sdk/*.mts in this template |

The portable guides replace Host-only creation/check/open commands with the implemented local CLI, distinguish `.local/` preview data from an installed app's business database, and preserve the disconnected platform boundary. Host account authorization and Developer Pair are not emulated.

The original design selection references are UI UX Pro Max (revision `4aad0584d92131626b16d4ff4d77f0455385013c`) and awesome-design-md (revision `8147538b4226ae41e2487a9179e3bcc1f68e8554`). Their notices are retained in [.agents/skills/floatboat-workbench/LICENSES.md](../.agents/skills/floatboat-workbench/LICENSES.md). These notices concern that reference material and do not choose an open-source license for the template or SDK; repository publication remains governed by PUBLICATION.md.

Discovery locations were checked against [Codex local skills](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills) and [Claude Code project skills](https://code.claude.com/docs/en/skills#where-skills-live). The fallback for other agents is the explicit AGENTS.md pointer or the read-only guide command.

## Connector authorization update (2026-09-20)

The connected-services reference now follows Desktop `resources/workbench-authoring/references/connected-services.md`: pre-authorization catalog discovery, portable service declarations, Host-owned account binding, explicit request results and standalone limitations. SDK signatures are synchronized from Desktop workbench SDK source; actual Gmail OAuth remains unverified.

## Startup and source update guidance (2026-09-20)

The runtime and verification topics now describe this repository's checked live preview and `.fbworkbench` package handoff. Host ordinary-open versus explicit-refresh behavior and the local lightning toggle were checked against Desktop `WorkbenchLifecycleService`, `WorkbenchServerChannel` and `WorkbenchLiveUpdateService`. Standalone implementation remains in template tooling and reuses the existing browser SDK handshake; this change introduces no SDK or manifest version requirement.
