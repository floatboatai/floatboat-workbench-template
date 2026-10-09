# Workspaces and website accounts

Declare `workspaces` and, when executing workflows, `workflows` in `app/manifest.json`. Calls belong on the server through `app.host`; the page calls the application's own API. The SDK matches Floatboat `0.5.10-rc.1`. Check `app.host.capabilities.list({ domain: 'workspaces' })` against the running Host; SDK version `1.0.0` alone does not prove that an older client implements these operations. Report missing capability support and ask the user to update Floatboat.

A website account is distinct from the Floatboat account. Persistent workspaces on the same computer are peers: each app can choose a target while retaining its original ownership. `workspaces.list({ limit, cursor })` returns `workspaces` and `nextCursor`; summaries contain `id`, `name` and `status`.

## Add an account

1. Save a pending business account row in SQLite, including its label, login URL and stable create/navigation keys.
2. Call `workspaces.create({ name, browserIdentity: 'isolated', idempotencyKey })` and persist the returned `workspace.id` before navigation. Omit `absolutePath` for a Host-managed directory, or supply an existing absolute directory. Creating the workspace does not start an Agent or switch the foreground UI. Explicit `isolated` gives the new workspace its own browser login state; `default` follows the Host setting and can be shared.
3. Call `workspaces.openUrl({ workspaceId, url, idempotencyKey })` to activate the workspace and display the login page immediately. Save its `tabId` for later account-verification workflows that need to revisit the exact page. `workspaces.activate({ workspaceId })` only switches the workspace.
4. Let the user log in. Verify the actual website account through a declared Workflow in that workspace, or retain the source of an explicit user confirmation. Mark the business account ready only after that check. A created workspace, loaded page or Cookie is not evidence of the intended website identity.

```ts
// pending 是此前已提交到业务数据库的待登录记录。
const created = await app.host.workspaces.create({
  name: pending.label,
  browserIdentity: 'isolated',
  idempotencyKey: pending.createKey,
});
saveWorkspaceAssociation(pending.id, created.workspace.id);
const login = await app.host.workspaces.openUrl({
  workspaceId: created.workspace.id,
  url: pending.loginUrl,
  idempotencyKey: pending.navigationKey,
});
saveLoginTab(pending.id, login.tabId);
```

`saveWorkspaceAssociation` and `saveLoginTab` are application-owned database operations. Keep transactions synchronous and finish the first write before awaiting navigation. Repeating the create key with the same parameters recovers the original workspace; changed parameters conflict. Retry an uncertain navigation with its original key to reuse the existing tab without reloading a partially completed login. After the user closes that tab, a deliberate new navigation uses a new key with the same workspace. Keep interrupted accounts pending, preserving the workspace and login progress.

Navigation requires a current Floatboat workbench view in one owning window. Standalone `HOST_CONNECTED` does not guarantee that view exists. `WORKSPACE_UI_UNAVAILABLE` or `WORKSPACE_UI_NOT_PRESENTED` means navigation was not confirmed; the workspace or browser tab may already exist. Preserve the original identifiers and show a recoverable state. Validate this UI path from a displayed managed workbench; local HTTP tests cannot prove native window presentation or login isolation.

## Dispatch to the account workspace

```ts
const { runId } = await app.host.workflows.start({
  dependency: 'publish',
  workspaceId: account.workspaceId,
  input: { itemId: item.id },
  idempotencyKey: item.operationKey,
});
const run = await app.host.workflows.get({ runId });
const page = await app.host.workflows.list({ workspaceId: account.workspaceId, limit: 50 });
```

The account row supplies the target; a Workflow's business input does not select the execution workspace. Omission uses the app's original workspace, independent of the foreground UI. Keep keys stable for a single operation and use different keys for different targets. Query the original key or run ID when the outcome is unknown.

See [Workflow execution](workflows.md) for public run visibility, pagination and cancellation ownership. The app owns batching, concurrency, account deduplication and business retries. Account-verification workflows must declare a complete `meta.outputs` JSON Schema so the public `run.output` includes their account identifier. A succeeded run can have `output: null` without a valid output schema. Return only required business identifiers, never browser credentials.
