# Model calls

Declare `llm` in manifest.capabilities. Call the SDK on the server; the browser uses an app API route. With Floatboat running, standalone preview uses the real Host model service. Handle `HOST_NOT_CONNECTED` while offline and verify real output; see repository `docs/platform.md`.

## Text, structured output and streaming

- `app.host.llm.generateText({ prompt, ...options })` returns text, model, requestId, finishReason, optional usage and an `assistant` message you can append to a conversation.
- `generateObject({ prompt, schema })` validates output against JSON Schema. The Host first extracts JSON from a code fence or surrounding prose; text that still is not JSON fails with `LLM_OBJECT_INVALID` and a schema mismatch with `LLM_OBJECT_SCHEMA_MISMATCH` (both executed, so retry deliberately). Treat the returned object as unknown until checked against the business type.
- `streamText({ prompt })` returns an async iterable with delta, tool-call, result and done events. Preserve incomplete/interrupted state if the stream ends without the required terminal result.
- With `prompt`, all three accept `images` (up to 8, each at most 10 MiB): `{ resource: { resourceId, relativePath } }` for a file in a declared directory resource, `{ url: 'https://…' }` that the Host downloads, or a small `{ dataUrl: 'data:image/png;base64,…' }` (the whole request is limited to 2 MiB). Only PNG, JPEG, WebP and GIF are accepted. A model or protocol without image input returns `LLM_IMAGE_INPUT_UNSUPPORTED` before any charge; check `inputs` from `listModels` first.

Calls that name no model use `DEFAULT_LLM_MODEL` (`gemini-3.8-flash`, exported by `sdk/host.mts`); omit `model` unless the product needs a different one. To choose one, pass a Host-supported model ID, for example `generateText({ model: 'gemini-3.8-flash', prompt: 'Hello' })`. The Host resolves the model catalog and selects Chat Completions, Responses, Anthropic or Gemini protocol, endpoint and authorization automatically. Configured `local/<model>` IDs use their registered endpoint. Do not infer a provider from a model-name prefix or supply your own endpoint. Text, streaming and JSON Schema generation follow the same routing. Real verification of one model does not prove every upstream account/model is available.

## Conversations, tools and reasoning

Pass `messages` instead of `prompt` (one or the other) for multi-turn calls: `{ role: 'system' | 'user', content }`, `{ role: 'user', content: [{ type: 'text', text }, { type: 'image', image }] }` and `{ role: 'tool', toolCallId, content }`. Append the previous result's `assistant` unchanged; its `hostState` is encrypted reasoning material the Host needs for the next turn. Do not edit it; if it is altered or the account changes, the Host continues without it instead of failing. `reasoning: 'off' | 'low' | 'medium' | 'high'` sets reasoning effort and falls back to off on models without it.

Tools run in your app, not in the Host. Pass `tools: [{ name, description?, parameters }]` (`parameters` is a JSON Schema with `type: 'object'`) and optionally `toolChoice: 'auto' | 'none' | 'required' | { name }` to `generateText` or `streamText`. When `finishReason` is `TOOL_CALLS`, run each entry of `toolCalls` (`{ id, name, input, inputError? }`) yourself, then call again with the history plus `result.assistant` and one tool message per call. `inputError` means the arguments failed the schema; return it as the tool result so the model can correct itself. Cap the number of rounds and check permissions before any tool writes data.

```ts
const messages: ChatMessage[] = [{ role: 'user', content: 'Where is order A1?' }];
for (let round = 0; round < 5; round++) {
  const result = await app.host.llm.generateText({ messages, tools: [lookupOrder] });
  messages.push(result.assistant);
  if (result.finishReason !== 'TOOL_CALLS') break;
  for (const call of result.toolCalls ?? [])
    messages.push({ role: 'tool', toolCallId: call.id, content: call.inputError ?? JSON.stringify(await runTool(call)) });
}
```

## Model catalog

`listModels({ kind? })` returns `models` (`id`, `kinds` of `text`/`speech`/`image`/`decision`/`rerank`, `inputs` of `text`/`image`, `source`), per-kind `defaults`, and `media`. Text models follow the same release, membership and local-model rules as the Floatboat chat model picker. `defaults.text` is the text default (`gemini-3.8-flash` when allowed); local models are listed with `source: 'local'` but are never a default. Speech, image, decision and rerank models come from a list Floatboat configures remotely (the first entry of each kind is its default), so `media` is always `available`; the platform may change these lists without an app update. Choose models from this result rather than hard-coding names.

## Speech and images

Both write results into a manifest resource with `kind: 'directory'` and `access: 'read-write'`; pass a logical `output: { resourceId, relativePath }`, never an absolute path. Results return the resource reference, byte length and format/MIME only.

- `generateSpeech({ text, voice?, format?, speed?, instructions?, model?, output })` synthesizes up to 4096 characters. `voice` is a provider voice ID (an ElevenLabs voice ID, or a Chirp name such as `cmn-CN-Chirp3-HD-Kore`); leave it empty for the model's default voice and do not pass OpenAI names like `alloy`. Platform speech models generally support `mp3` (default), `wav`, `opus` and `pcm` (24 kHz, 16-bit mono), and most reject `instructions`.
- `generateImage({ prompt, size?, quality?, count?, images?, model?, output })` creates 1–4 images. With `images` it edits from those references. For `count > 1`, files get `-1`, `-2` before the extension. The default request deadline is 330 seconds; show progress instead of blocking the page.

Omitting `model` uses the catalog default for that kind; a kind with no models yet (rerank today) has no default, so the call returns `LLM_MODEL_REQUIRED` until you pass an explicit `model`.

## Decisions (Jev)

`decide({ state, questions, model? })` asks the platform decision model (default `jev-latest`) structured questions about `state` (string, object or array). `questions` holds 1–32 entries keyed by `[A-Za-z0-9_-]{1,64}`, each `{ type: 'noul' | 'choice' | 'score', instructions, criteria? }`. For `choice`, `criteria` is an object mapping each option name to its description (1–255 entries); for `score`, it is an ordered array of levels scored from 0 (1–10 entries); `noul` optionally takes `{ true, false }` descriptions. Other shapes return `LLM_DECISION_CRITERIA_INVALID` before any charge. It returns the raw `answers`. Use it for yes/no, option and scoring judgements; it is cheaper and steadier than prompting a text model, and does not generate prose.

```ts
const result = await app.host.llm.decide({
  state: { message: ticket.body },
  questions: {
    urgent: { type: 'noul', instructions: 'Does the customer need a reply within an hour?' },
    topic: { type: 'choice', instructions: 'What is the message about?', criteria: { billing: 'Invoices or charges', bug: 'Something is broken' } },
    tone: { type: 'score', instructions: 'How upset is the customer?', criteria: ['Calm', 'Annoyed', 'Angry'] },
  },
});
```

## Retrieval: reranking

- `rerank({ query, documents, topN?, model? })` returns `{ index, relevanceScore }` sorted by score, with `index` pointing into `documents` (up to 1000).
- For a small candidate set, rerank all documents directly and show the matching originals as sources.

## Required Host operations

`pnpm workbench:check` and Floatboat builds scan the server code and write Host operations newer than the baseline (for example `llm.rerank`, or `llm.messages` / `llm.tools` / `llm.reasoning` / `llm.images` when text calls use those fields) to `manifest.requires.operations`. Older Floatboat clients then ask the user to update instead of failing at runtime. Commit the field with your code; the build only adds entries, so remove one by hand only when the code no longer uses it.

## Errors and billing

The platform owns model routing, credentials and billing; there is no app-supplied provider API key field. When credits run out every call returns `HOST_CREDITS_EXHAUSTED` with `execution: 'not-executed'`, and Floatboat shows its own "out of credits" prompt in the main window. Show a retryable state in the app and do not loop retries. Other upstream failures return `LLM_HTTP_<status>`. Users can see the last 30 days of calls per workbench in Floatboat under Me → Workbenches; it is a call count, not a credit statement.

Use `app.host.capabilities.list({ domain: 'llm' })` to inspect the connected contract; older Hosts report the newer operations as unavailable. Read `sdk/host-contracts.mts` (or generated `app/sdk/host-contracts.d.mts`) for supported options. Match business UI loading/cancel/error behavior to actual returned state rather than fabricated text.
