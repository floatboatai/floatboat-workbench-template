# Model calls

Declare `llm` in manifest.capabilities. Call the SDK on the server; the browser uses an app API route. With Floatboat running, standalone preview uses the real Host model service. Handle `HOST_NOT_CONNECTED` while offline and verify real output; see repository `docs/platform.md`.

- `app.host.llm.generateText({ prompt, ...options })` returns text, model, requestId, finishReason and optional usage.
- `generateObject({ prompt, schema })` validates output against JSON Schema. Treat the returned object as unknown until checked against the business type.
- `streamText({ prompt })` returns an async iterable with delta, result and done events. Preserve incomplete/interrupted state if the stream ends without the required terminal result.

Use `app.host.capabilities.list({ domain: 'llm' })` to inspect the connected contract. The platform owns model routing and credentials; there is no app-supplied provider API key field. Read `sdk/host-contracts.mts` (or generated `app/sdk/host-contracts.d.mts`) for supported options. Match business UI loading/cancel/error behavior to actual returned state rather than fabricated text.

Pass a Host-supported model ID, for example `generateText({ model: 'deepseek-flash', prompt: 'Hello' })`. The Host resolves the model catalog and selects Chat Completions, Responses, Anthropic or Gemini protocol, endpoint and authorization automatically. Configured `local/<model>` IDs use their registered endpoint. Do not infer a provider from a model-name prefix or supply your own endpoint. Text, streaming and JSON Schema generation follow the same routing. Real verification of one model does not prove every upstream account/model is available.
