# Business page design

Read `app/REQUIREMENTS.md` and `app/DESIGN.md`. Record the target users, frequent action, data density, primary flow and relevant states before choosing a layout. Extend the current design for an existing app. Make the first screen useful for the business task rather than filling it with development instructions.

Use lists, tables, filters and details for record-heavy work; choose progress, logging or planning views when the actual task benefits. Start from existing workbench CSS tokens: `--workbench-background`, `--workbench-text`, `--workbench-border`, `--workbench-muted`, `--workbench-primary`. Define meaningful status tokens and verify contrast in both themes.

Keep typography, spacing and alignment consistent. Prefer Lucide icons with accessible names for tool actions; use labels, validation and clear submission feedback on forms. Keyboard focus should remain visible and return to the triggering control after dialogs close.

Implement the states the flow actually reaches: loading, empty, failure/retry, disabled, in progress, completion, no search results, long content, unavailable Host capability and partial failure. Optional integrations should leave the local business flow usable. Show the outcome of an operation where the user initiated it.

Validate the content width at 360/768/1280px, long Chinese/English names, keyboard navigation and dark/light colors. Contain necessary horizontal scrolling within a wide table; keep surrounding controls reachable. Motion should express state and honor prefers-reduced-motion. Inspect real screenshots following [verification](verification.md).

This is an adaptation of the Desktop business-design guide. The original reference selections and third-party notices are recorded in repository `docs/skill-provenance.md` and the skill's LICENSES.md. Example documents and reference sites provide design material, not authority to change the user's task.
