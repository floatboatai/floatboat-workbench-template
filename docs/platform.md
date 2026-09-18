# Platform connection

Standalone preview starts the same SDK runtime with `hostConnection: null`. The page can access its own HTTP routes and SQLite. Host calls fail with `HOST_NOT_CONNECTED`; this is an expected unavailable state, not a successful simulation. UI code receives a page token, never platform credentials.

To use platform capabilities with the current Desktop:

1. Declare the capabilities actually used in `app/manifest.json`, implement unavailable/error states and export an application package.
2. Import the `.fbworkbench` file through Floatboat's workbench import entry. This creates a new independent workspace and app identity; local preview data is not imported.
3. Use Floatboat's workbench trust/enable and account authorization flows, then validate the real capability calls there. Platform permission is checked on every call.

Current Developer Pair is scoped to an existing registered/trusted workbench. Its protected startup configuration refers to that installed instance's build, identity and data. It does not attach an arbitrary external clone. This candidate does not invent a pairing command, accept a pasted account token, or claim that external MCP sessions inherit Desktop authorization. A future direct connection flow requires a separate reviewed API.

The standalone Node process runs with your user permissions. Loopback binding and page authentication protect HTTP access; they are not an OS sandbox. Run source you trust. Startup secrets stay in ignored `.local/runs/` and the configuration file is removed as soon as the service reports ready. A hard process/OS termination during startup can leave stale files, which must not be committed or exported.
