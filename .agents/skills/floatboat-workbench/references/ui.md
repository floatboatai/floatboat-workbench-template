# UI connection and contributions

Business React components live in `app/src/ui/`. Reuse the template's `getPageConnection()` from `connection.ts`, then `page.fetch('/api/...')`; it is immediately ready in both a top-level browser and a Host iframe. Local APIs require no page token; direct same-origin fetch also works. Node, SQL and Host SDK imports belong in the server.

The underlying `connectWorkbenchPage` comes from `../../sdk/browser.mjs`. In Floatboat it receives language and public theme from its parent; in standalone preview it uses the complete URL printed by `pnpm dev`. Keep platform credentials out of page code and responses.

Use `--workbench-background`, `--workbench-text`, `--workbench-border`, `--workbench-muted`, `--workbench-primary` with suitable local fallback values. Scope interactions to this page. Respect Host hotkeys and OS shortcuts instead of registering global handlers. See [design](design.md) for business layout and [verification](verification.md) for real browser checks.

Optional manifest contributions use unique IDs, title/titleEn, placement (`command`, `sidebar`, `toolbar`, `panel`), icon and target. A page target is `{ "kind": "page", "path": "/..." }`; an action target is `{ "kind": "action", "action": "..." }`, implemented through `app.action`. Keep targets inside the app. Host placements require verification after import; standalone preview does not contain the Floatboat shell.
