# Dependencies and file resources

Maintain manifest declarations whenever business code adds a Workflow, Combo Skill or file dependency. IDs are stable lowercase letter/digit/hyphen names starting with a letter, up to 64 characters. `required` defaults to true. Actual absolute paths and installed IDs belong in Host-local bindings, not in manifest or portable business records.

```json
{
  "dependencies": [
    { "id": "extract", "kind": "workflow", "source": { "type": "bundle", "path": "dependencies/extract.workflow.js" } },
    { "id": "research", "kind": "combo", "source": { "type": "registry", "name": "research-assistant", "version": "1.2.3" }, "required": false }
  ],
  "resources": [
    { "id": "templates", "kind": "directory", "role": "asset", "location": "project", "path": "templates" },
    { "id": "attachments", "kind": "directory", "role": "data", "location": "data", "path": "attachments", "access": "read-write" },
    { "id": "contracts", "kind": "directory", "role": "data", "location": "external", "transfer": "rebind" }
  ]
}
```

Paths above are relative to the application root (`app/` in this repository), not the repository root. Do not use a workspace cwd or the original machine's path as an implicit anchor.

## Functional dependencies

- `bundle`: ship the declared `.workflow.js` or portable plain Owned `.aoe` from the application source. Sealed/encrypted packages cannot be smuggled into this mode.
- `registry`: retain the exact installed/published version reference. The receiving Host uses the original store's installation and authorization; unavailable versions remain pending rather than falling back to latest.
- `binding`: select an installed item in Floatboat's “依赖与资源” management UI. A required unresolved binding blocks standalone export; provide a bundle/reference when portable delivery is needed.

`requires: ["child-id"]` is an explicit closed dependency graph; declare all references and avoid cycles. Dynamic script dependencies cannot be discovered automatically. Start Workflows by logical dependency ID, as in [workflows](workflows.md). Workbench Agent tasks load the declared ready Combo bindings; declarations alone do not authorize their execution.

## File resources

`asset` is a read-only fixed resource in project source or an explicit external binding. `data` belongs to the app's data directory or an external binding. Project/data resources require relative path; external resources omit path and are selected in the Host. Transfer defaults to snapshot; rebind is for external resources that the recipient selects again. Symbolic links and paths outside the declared root are rejected.

Server code uses `await app.resources.path('templates', 'report.txt')` to read or `await app.resources.path('attachments', 'report.txt', 'write')` before Node fs writes. Persist the resource ID and relative path in business records. `configured(id)` reports a mapping; `path` checks file availability. Declared data directories are initialized on startup. Optional resources need a usable unconfigured state.

## Delivery

`pnpm workbench:pack` includes declared project assets and portable dependencies and generates a checked `workbench.lock.json`. It excludes preview business data. Required external fixed assets need a portable project copy or a Host export with the explicit binding. Host “包含业务数据” export can include SQLite, managed files and registered external snapshots, including apps without SQLite. Rebind resources carry declarations only.

Import creates a new app and remaps owned copies; missing required dependencies/resources stay pending and prevent startup. It does not copy credentials, running tasks, automatic trigger grants or internal Workflow state tables. Existing hardcoded paths/installation IDs must be adapted to logical references. This resource API is not an OS sandbox for Node code.
