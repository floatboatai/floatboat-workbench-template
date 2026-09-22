# Platform connection

Start a compatible Floatboat client, sign in to an account with workbench execution access, and run `pnpm dev`. The standalone Node server automatically connects to the client's standard SDK gateway. Agent, LLM, ASR, Workflow, connected services, calendar and automation use the same declarations and account/domain authorization as managed workbenches. Import is optional for this development flow; source and preview data remain in this checkout.

Declare the capabilities actually used in `app/manifest.json`. Call `app.host` on the server; the browser uses your application API; local page and Host SDK connections need no tokens. `app.host.capabilities.list()` reports available operations; authorization is checked again on each call. See the repository Skill's domain references for inputs and lifecycle contracts. Connector authorization opens the existing Floatboat flow, and account bindings remain in the Host.

The SDK capability connection accepts only the Host loopback address and refuses HTTP redirects. Its LLM input does not accept supplier endpoints, provider selection or API keys. Model routing and upstream error sanitization stay inside Floatboat. The workbench’s own page/API port is separate from this Host capability gateway.

The launcher prints `HOST_CONNECTED` after connection. Floatboat can start after the preview, and closing or restarting it causes disconnect/reconnect without restarting the workbench. Calls while disconnected return `HOST_NOT_CONNECTED`; implement this unavailable state. Reconnection does not retry business calls. Reconcile uncertain writes by their existing idempotency key. An account change cancels prior process-bound Agent/ASR work and connects under the new account's permissions.

If more than one compatible client is running, set `FLOATBOAT_HOST_INSTANCE` to the filename stem under `~/.floatboat/hosts/`, then restart pnpm. After connecting, the launcher stays with that instance and does not silently choose another account. `FLOATBOAT_HOST_MODE=offline` explicitly disables discovery for offline work or isolated automated tests. Old clients without this protocol remain disconnected; update the client rather than pasting account tokens.

The Host creates a stable execution Workspace for this canonical source path and account. Agent workingDirectory remains an explicit absolute path. Declared bundled Workflow/Combo dependencies are restored using the normal Host installer and trust rules. Required missing bindings remain a configuration error. Changing capabilities or dependency declarations requires the normal save/check/restart flow. Identical appIds in different source directories receive isolated Host ownership; reconnecting the same source preserves its run and binding scope.

Discovery protocol v2 uses local endpoint descriptors without credentials. The SDK connection URL identifies the workbench and process generation; it is a routing address, not a secret. Loopback binding and Host/Origin checks remain. Preview exit, lease expiry, account change or client shutdown closes the context and cancels process-bound Agent/ASR work. Created durable domain resources follow their own lifecycles. Any local program can address these running services; this is not a sandbox for untrusted local source. Open or refresh the ordinary URL printed by pnpm dev without a fragment or authorization step.

## Deliver to a managed installation

Run `pnpm run package` (alias `pnpm workbench:pack`), then use **Floatboat → My → Workbenches → Import workbench**. Floatboat checks access/compatibility, installs locked dependencies, builds source and initializes a new independent workspace. Preview business data is excluded by default; `--include-data` exports it after stopping preview. External snapshot resources use `--bindings`; see [resources](resources.md). Import remains useful for managed lifecycle, panel contributions and distribution; external SDK development does not require it. Reimport creates another installation; use the release/update flow for existing installations.

A `.tgz` from `pnpm pack`, a repository ZIP or raw `app/` folder is not a `.fbworkbench` package. Developer Pair remains available for an existing registered/trusted installation and refers to that installation's build/data; it is separate from automatic external connections.

## Authoring catalog from external agents

With Floatboat open and signed in, `pnpm workbench:catalog providers --query gmail`, `actions --provider connector:gmail --query messages`, and `describe --capability <returned-id>` query the fixed loopback endpoint `127.0.0.1:47831`. No application import or third-party account authorization is required for catalog metadata. Execution still uses the existing Host SDK connection and the user's account binding. The fixed endpoint cannot run actions.

`HOST_CATALOG_PORT_IN_USE` means another process owns that port; Floatboat logs the failure and keeps its other features running. Only one instance provides this fixed endpoint at a time. Responses identify the instance, and `FLOATBOAT_HOST_INSTANCE` enforces an explicit selection. Do not point these commands at a public server. Old clients without this endpoint need upgrading/restarting. Domain/schema errors are returned as JSON error codes; they are not evidence that the user authorized execution.
