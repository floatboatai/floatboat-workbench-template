# Agent tasks

Declare `agent` in manifest.capabilities. On the server, use `app.host.agent.start({ prompt, workingDirectory, idempotencyKey, model?, timeoutMs? })` for reasoning plus tool execution. workingDirectory is an explicit real absolute execution directory; it is not implicitly the workspace cwd. A declared resource directory can provide that path. The Host fixes workspace/session ownership; callers do not select sessionId or workspaceId.

Persist the business operation ID before start and reuse it as idempotencyKey. Save the returned runId, use get/list/findByIdempotencyKey to recover state, events({runId,afterSequence}) for progress, and cancel({runId}) to cancel. Same-key changed input is a conflict. On timeout or disconnection, query the original operation before retrying.

Completed results survive Host restart; interrupted tasks are not automatically replayed. Events have bounded retention. If AGENT_EVENT_CURSOR_EXPIRED is returned, query get for the terminal state rather than assuming all events can be replayed. Keep raw tool arguments, internal reasoning and credentials out of page data. The exact types are in `sdk/agent-contracts.mts`.

Agent tasks differ from local app.trackTask and from scheduled [automation](automation.md). Declared Combo dependencies are resolved by the Host before the task starts. During standalone preview this API returns HOST_NOT_CONNECTED; test the unavailable branch locally and the actual task in an authorized Host installation.
