# Scheduled Agent tasks

Declare `automation` for `app.host.automation`. It schedules a Host Agent task with title, objective, time, timezone and trustLevel; it does not implicitly schedule arbitrary workbench app.action callbacks. A local app.trackTask only tracks work in the current service.

Use preview(draft) for normalized input and the short-lived one-use previewToken. Continue the existing input-confirmation flow with create({...draft,previewToken}) or update({...draft,bindingId,previewToken}). If the input, account or token changes, obtain a fresh preview. Creation/update is an external mutation and must remain within the user's requested task.

Use list/get/runs/archive with the returned bindingId for actual state. Keep the Host's trustLevel/actionCapabilities and App provenance; callers do not supply a made-up Agent session or workspace. Execution belongs to the workbench's still-valid installation workspace. Local scheduling stops when the Host exits.

The exact draft is in `sdk/host-contracts.mts`. Standalone preview has no Host scheduler and returns HOST_NOT_CONNECTED. Test unavailable UI locally and validate real scheduling in an authorized installation; a preview token alone is not a created task.
