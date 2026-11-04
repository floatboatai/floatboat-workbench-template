# Build and runtime delivery

Run commands from the template root after the pinned dependency install. Builds use the included compiler and SDK; they do not load executable application build configuration, run package scripts, start the application or install dependencies.

```sh
pnpm build
# Same build with business-module obfuscation:
pnpm workbench:build -- --obfuscate
# Source package (existing default):
pnpm workbench:pack
# Prebuilt package for installation without source compilation:
pnpm workbench:pack -- --runtime
```

`build` checks the manifest, dependency lock and TypeScript, bundles server dependencies, and produces `app/dist/server/index.mjs`, `app/dist/ui/` and the generated `app/sdk/`. Distribution builds omit source maps. These generated directories are build output, not a complete installer; use the package command for delivery. `workbench:check` remains the development check used by local preview.

Source export produces `artifacts/<registry>-<version>.fbworkbench` with the existing v2 format. Runtime export produces `artifacts/<registry>-<version>-runtime.fbworkbench` using v3 and `workbench.runtime.json`. Both reject an existing output file; `--output` accepts a new absolute `.fbworkbench` path outside `app/`.

## Runtime package contents

The runtime exporter validates and builds a frozen source copy, retains the SDK, migrations, declared fixed resources, portable Workflow/Combo dependencies and third-party notices, then records file sizes and SHA-256 digests. It excludes application source, tests, package manifests/locks, node_modules, source maps, preview fixtures, local settings and business data. External resources use the existing `--bindings /absolute/bindings.json` contract.

A standalone runtime package has restricted source access and always uses the same `business-compatible-v1` obfuscation profile as Floatboat publishing. Only application business modules are transformed; third-party code and data property names retain their contracts. Obfuscation raises reverse-engineering cost; it is not encryption and cannot prevent all modification. Deliver a separate source package when editable source is intended. A runtime-only file does not grant a store source-download entitlement.

Import requires a Floatboat client supporting transfer v3/runtime identity v1. Such clients verify and start the prebuilt package without installing npm dependencies or compiling source. Older clients must be updated. Host trust, resource bindings and platform permissions remain separate requirements. Exporting a file does not submit it to the store or replace a store's authenticated build and review.

`--runtime --include-data` is rejected. Keep the existing source/migration export for explicitly requested data transfer. Runtime dependencies requiring native addons, unsupported dynamic imports or files outside the application/toolchain fail the build rather than producing an incomplete package.

## Cover demonstration data

Maintain `app/workbench.preview.json` alongside API and page changes. Its responses are fictional JSON for the real page; include every API response needed to render the cover and match the actual response contract. Show `data-test-id="workbench-preview-ready"` only once those responses have rendered. The starter includes `/api/app` and its `platform` field. Initialization updates the starter fixture's name/version while preserving customized fixtures.

The source package carries the preview fixture so Floatboat publishing can capture the page without running the business server or reading its database. The runtime package omits it. Local `pnpm dev` continues to run the real application and its persistent local data.

## Repository validation

The GitHub `Build workbench template` workflow checks the guidance, application and tooling, runs the distribution build, then exports both package kinds as short-lived Actions artifacts. It does not publish to a store or release channel. See `VERIFICATION.md` for the platforms and import boundaries actually verified.
