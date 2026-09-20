# Business database

`createWorkbenchServer(import.meta.url)` opens the app's SQLite database, applies migrations and exposes Node DatabaseSync as `app.database` and route-context `database`. Companies, projects and records are tables inside that app, not new workspaces or Host database rows.

Use parameterized `prepare(sql).get/all/run`. Use synchronous BEGIN/COMMIT/ROLLBACK for transactions; finish awaited network work before a transaction or after committing. Keep business schema and input validation in the server layer.

Add numbered files such as `app/migrations/0002_notes.sql`:

```sql
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

Existing applied migration filenames and contents are immutable. Append changes rather than resetting data or editing a prior checksum. `_workbench_*` tables are SDK metadata; leave them to the SDK. Keep actual database files, WAL files and credentials outside source and UI assets.

This checkout uses persistent preview data at `.local/data/<appId>/data.sqlite`. An imported Host installation has its own identity and database; importing a standalone source package does not copy preview records. The Host's normal workbench is its real business database, not another disposable preview. Use temporary databases in tests and the relevant export/backup flow for data transfer; copying an active WAL database is not a consistent backup.

Before an external mutation, persist a stable operation ID and its state. Agent/Workflow APIs can use that ID as an idempotencyKey. An interrupted or execution-unknown result needs reconciliation, not an automatically generated replacement key.
