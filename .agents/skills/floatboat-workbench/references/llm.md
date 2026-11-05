# Model calls

Declare `llm` in manifest.capabilities. Call the SDK on the server; the browser uses an app API route. With Floatboat running, standalone preview uses the real Host model service. Handle `HOST_NOT_CONNECTED` while offline and verify real output; see repository `docs/platform.md`.

## Text, structured output and streaming

- `app.host.llm.generateText({ prompt, ...options })` returns text, model, requestId, finishReason and optional usage.
- `generateObject({ prompt, schema })` validates output against JSON Schema. Treat the returned object as unknown until checked against the business type.
- `streamText({ prompt })` returns an async iterable with delta, result and done events. Preserve incomplete/interrupted state if the stream ends without the required terminal result.
- All three accept `images` (up to 8, each at most 10 MiB): `{ resource: { resourceId, relativePath } }` for a file in a declared directory resource, `{ url: 'https://…' }` that the Host downloads, or a small `{ dataUrl: 'data:image/png;base64,…' }` (the whole request is limited to 2 MiB). Only PNG, JPEG, WebP and GIF are accepted. A model or protocol without image input returns `LLM_IMAGE_INPUT_UNSUPPORTED` before any charge; check `inputs` from `listModels` first.

Calls that name no model use `DEFAULT_LLM_MODEL` (`gemini-3.8-flash`, exported by `sdk/host.mts`); omit `model` unless the product needs a different one. To choose one, pass a Host-supported model ID, for example `generateText({ model: 'gemini-3.8-flash', prompt: 'Hello' })`. The Host resolves the model catalog and selects Chat Completions, Responses, Anthropic or Gemini protocol, endpoint and authorization automatically. Configured `local/<model>` IDs use their registered endpoint. Do not infer a provider from a model-name prefix or supply your own endpoint. Text, streaming and JSON Schema generation follow the same routing. Real verification of one model does not prove every upstream account/model is available.

## Model catalog

`listModels({ kind? })` returns `models` (`id`, `kinds` of `text`/`speech`/`image`/`decision`, `inputs` of `text`/`image`, `source`), per-kind `defaults`, and `media`. Text models follow the same release, membership and local-model rules as the Floatboat chat model picker. Speech, image and decision models come from the platform catalog; when `media` is `unavailable` that part may be incomplete, so keep an explicit retry instead of treating it as "no models". Choose models from this result rather than hard-coding names.

## Speech and images

Both write results into a manifest resource with `kind: 'directory'` and `access: 'read-write'`; pass a logical `output: { resourceId, relativePath }`, never an absolute path. Results return the resource reference, byte length and format/MIME only.

- `generateSpeech({ text, voice?, format?, speed?, instructions?, model?, output })` synthesizes up to 4096 characters. `format` is `mp3` (default), `wav`, `opus`, `aac`, `flac` or `pcm`.
- `generateImage({ prompt, size?, quality?, count?, images?, model?, output })` creates 1–4 images. With `images` it edits from those references. For `count > 1`, files get `-1`, `-2` before the extension. The default request deadline is 330 seconds; show progress instead of blocking the page.

Omitting `model` uses the catalog default for that kind; if the catalog is unavailable the call returns `LLM_MODEL_REQUIRED`.

## Decisions (Jev)

`decide({ state, questions, model? })` asks the platform decision model (default `jev-latest`) structured questions about `state` (string, object or array). `questions` holds 1–32 entries keyed by `[A-Za-z0-9_-]{1,64}`, each `{ type: 'noul' | 'choice' | 'score', instructions, criteria? }`; `choice` and `score` require `criteria`. It returns the raw `answers`. Use it for yes/no, option and scoring judgements; it is cheaper and steadier than prompting a text model, and does not generate prose.

```ts
const result = await app.host.llm.decide({
  state: { message: ticket.body },
  questions: { urgent: { type: 'noul', instructions: 'Does the customer need a reply within an hour?' } },
});
```

## Errors and billing

The platform owns model routing, credentials and billing; there is no app-supplied provider API key field. When credits run out every call returns `HOST_CREDITS_EXHAUSTED` with `execution: 'not-executed'`, and Floatboat shows its own "out of credits" prompt in the main window. Show a retryable state in the app and do not loop retries. Other upstream failures return `LLM_HTTP_<status>`.

Use `app.host.capabilities.list({ domain: 'llm' })` to inspect the connected contract; older Hosts report the newer operations as unavailable. Read `sdk/host-contracts.mts` (or generated `app/sdk/host-contracts.d.mts`) for supported options. Match business UI loading/cancel/error behavior to actual returned state rather than fabricated text.
