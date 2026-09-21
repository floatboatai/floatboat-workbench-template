# Agent tasks

Declare `agent` in manifest.capabilities. On the server, use `app.host.agent.start({ prompt, workingDirectory, idempotencyKey, model?, timeoutMs? })` for reasoning plus tool execution. workingDirectory is an explicit real absolute execution directory; it is not implicitly the workspace cwd. A declared resource directory can provide that path. The Host fixes workspace/session ownership; callers do not select sessionId or workspaceId.

Persist the business operation ID before start and reuse it as idempotencyKey. Save the returned runId, use get/list/findByIdempotencyKey to recover state, events({runId,afterSequence}) for progress, and cancel({runId}) to cancel. Same-key changed input is a conflict. On timeout or disconnection, query the original operation before retrying.

Completed results survive Host restart; interrupted tasks are not automatically replayed. Events have bounded retention. If AGENT_EVENT_CURSOR_EXPIRED is returned, query get for the current state and partial text rather than assuming all events can be replayed. Keep raw tool arguments, internal reasoning and credentials out of page data. The exact types are in `sdk/agent-contracts.mts`.

Agent tasks differ from local app.trackTask and from scheduled [automation](automation.md). Declared Combo dependencies are resolved by the Host before the task starts. Standalone preview connects to the running Floatboat client and executes real Agent tasks in its stable source/account Workspace. Test both real execution and the offline HOST_NOT_CONNECTED branch; see repository `docs/platform.md`.

## Streaming and history

The SDK resumes interrupted Agent event subscriptions from the last delivered cursor and filters duplicate events. Its default 120-second timer measures idle time, not the total task duration; an explicit subscription timeoutMs still limits the whole subscription. Cancelling the subscription does not cancel the run: use agent.cancel for that. Do not resubmit agent.start when an event stream disconnects.

Persist the last applied sequence with business state. If retry attempts are exhausted, read agent.get, show its partial text while running and reopen events using the saved cursor. For an expired cursor, reconcile the current snapshot and poll get for partial text and terminal status; do not reuse the expired cursor or leave the UI permanently loading. Task execution timeoutMs is separate from the subscription timeout.

Current Floatboat persists assistant text and tool calls/results during execution and displays them in the Host chat session. SDK events intentionally expose sanitized progress, not raw tool arguments/results or internal reasoning. The workbench owns its business history and loading/error states; Host persistence does not automatically render them in your page.
