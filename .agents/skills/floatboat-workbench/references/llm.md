# Model calls

Declare `llm` in manifest.capabilities. Call the SDK on the server; the browser uses an app API route. Standalone preview returns `HOST_NOT_CONNECTED` and should show a truthful unavailable state. Validate real model behavior after authorized Host import.

- `app.host.llm.generateText({ prompt, ...options })` returns text, model, requestId, finishReason and optional usage.
- `generateObject({ prompt, schema })` validates output against JSON Schema. Treat the returned object as unknown until checked against the business type.
- `streamText({ prompt })` returns an async iterable with delta, result and done events. Preserve incomplete/interrupted state if the stream ends without the required terminal result.

Use `app.host.capabilities.list({ domain: 'llm' })` to inspect the connected contract. The platform owns model routing and credentials; there is no app-supplied provider API key field. Read `sdk/host-contracts.mts` (or generated `app/sdk/host-contracts.d.mts`) for supported options. Match business UI loading/cancel/error behavior to actual returned state rather than fabricated text.
