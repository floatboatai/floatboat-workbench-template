# Template maintenance

Application authoring belongs in `app/`; changing `sdk/` or `tooling/` changes the development platform and requires `pnpm test:tooling` in addition to the application checks.

The candidate keeps exact dependency versions and a root lockfile. `app/package.json` and its lockfile describe only the distributable application. If a new pure-JS runtime dependency is needed, install the same version at the root and in app, update both lockfiles, then rerun checks. Native dependencies and executable application build configs are outside this profile. The checker verifies the app lock against installed versions; it does not install dependencies during a build. The Host still applies its own import/build validation.

`provenance.json` records the source inventory and extraction hashes. SDK implementation and archive/hash logic are carried from that snapshot; contract extraction removes Desktop-only record types, and compiler imports/output paths are adapted for this repository. Local preview and authoring CLI are separate code. Do not manually patch generated `app/sdk`, `app/dist` or `.generated`.

Template version (`package.json`), application version (`app/manifest.json`) and SDK/profile versions (`compatibility.json`) have separate meanings. Updating the template does not silently update a user's business code, database migrations, installed workbench or published store release. Review template changes as normal Git diffs, preserve existing migrations, and test against local data before adopting them.

Desktop has not switched its template source in this change. Before making this repository the shared source, approve a follow-up that pins a reviewed tag/commit plus integrity hashes and tests generated-source compatibility. Avoid an unpinned runtime download or permanent manual dual maintenance.

Verification commands:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm skills:check
pnpm workbench:check
pnpm test
pnpm test:tooling
pnpm dev
pnpm workbench:pack
```

The tooling tests exercise initialization safety, invalid manifest/source links, authenticated real HTTP, unavailable Host calls, SQLite persistence, concurrent data locking, shutdown cleanup and archive validation/exclusion. Browser and full Desktop import validation are separate checks; do not infer them from passing Node tests.

Standalone live reload lives in `tooling/live-preview.mjs` and the fixed preview page, leaving SDK/runtime contracts unchanged. It checks immutable source snapshots, waits for tracked work, backs up persistent data after stopping the old service and restores data on startup failure. Test actual saves, build/start failures, subsequent recovery and shutdown. The tooling suite runs files sequentially because preparation shares `.generated/`. `package` and `workbench:pack` route to the same source exporter; this is not npm registry publishing.

## Authoring guidance

Edit `.agents/skills/floatboat-workbench/SKILL.md` and its references. `topics.json` keeps the topic names aligned with the Host guide; `tooling/guide.mjs` reads these files without building or installing dependencies. `pnpm skills:sync` regenerates only the Claude entry, preserving unrelated skills; `pnpm skills:check` reports missing references or a stale entry. Commit both discovery entries when publishing repository changes so fresh checkouts have the Skill before running setup.

When Host APIs or authoring topics change, compare the sources recorded in [skill provenance](skill-provenance.md), update the corresponding portable guide and preserve the distinction between a standalone checkout and an installed Host instance. Validate command examples against package.json and signatures against the included SDK. The content should remain usable without the Desktop source repository.
