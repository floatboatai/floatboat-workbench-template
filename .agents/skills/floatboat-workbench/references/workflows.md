# Workflow execution

`run.status === 'succeeded'` is successful completion; read `run.output` then. `queued`, `running` and `waiting_for_user` remain active. `failed`, `skipped`, `rejected`, `timed_out`, `emergency_stopped` and `cancelled` are terminal: stop waiting and show the appropriate result. Use the exported `WorkflowRunStatus` union; do not reuse Agent task status names for Workflow runs. Persist the operation key before starting and keep it across page reloads until the result is reconciled.

Declare `workflows` and each dependency in manifest. See [resources](resources.md) for bundle, exact registry reference and Host-local binding. Workbench declarations and native Workflow capability allowlists serve different purposes; maintain both when authoring nested calls.

Server example, after persisting a stable business operation ID:

```ts
const started = await app.host.workflows.start({
  dependency: 'extract',
  input: { document: 'contract-123' },
  idempotencyKey: operationId,
});
const run = await app.host.workflows.get({ runId: started.runId });
```

The operation ID and document value above come from real business records. New applications use dependency, not a hardcoded local Workflow name/ID. Legacy name is compatible only when dependencies was never declared. A nested Workflow uses the child's logical name, declares it in requires, and permits that call in its own `capabilities.workflow.allowedWorkflowNames`. The Host carries the fixed ID/content digest through the declared graph.

The execution workspace is fixed by the installed workbench's ownership; the SDK does not let the app substitute another workspace/session. Required missing, changed or untrusted dependencies prevent ready execution. Store-protected Workflows retain native installation, execution authorization and billing.

Start returns runId; use get/list, events({runId,afterSequence}), findByIdempotencyKey and cancel. Reconcile an unknown start result through the original key rather than generating a replacement. For WORKFLOW_EVENT_CURSOR_EXPIRED, query get and preserve that the event history is incomplete. Types are in `sdk/host-contracts.mts`. Standalone preview returns HOST_NOT_CONNECTED; it does not install or simulate workflows.
