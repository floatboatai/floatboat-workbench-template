# Calendar events

Declare `calendar` to use server-side `app.host.calendar`. Ordinary events use search/get/create/update/delete; an event is not a scheduled Agent task. Use [automation](automation.md) for execution scheduling.

For create, supply the real title, scheduledAt (epoch milliseconds) and timezone; optional fields include endAt, note, location, isAllDay and recurrence. Providers are `floatboat_calendar` and `system_calendar`. Retain eventId and providerKind from the actual result; update/delete need the explicit provider and identity. Recurring deletion supports the declared deletionScope—choose it from the requested scope rather than deleting the entire series by default.

Preserve App provenance and original provider authorization. Use the typed SDK and connected capability description rather than modifying Host SQL or inventing event IDs. The exact fields are in `sdk/host-contracts.mts`. Show unavailable state for HOST_NOT_CONNECTED locally, and verify authorized calendar operations after Host import. Reconcile unknown write outcomes before creating duplicate events.
