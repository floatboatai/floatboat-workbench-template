# Streaming speech recognition

Declare `asr`. The page captures audio and sends it to the app server, which owns `app.host.asr`; Host tokens stay off the page. This capability needs a connected authorized Floatboat installation, including microphone permission in the actual embedded page. Standalone preview can exercise local recording/UI but not claim platform transcription success.

1. Start with `{ sampleRate: 16000, format: 'pcm', hotwords?, semanticPunctuationEnabled?, speakerDiarizationEnabled? }` and retain streamId.
2. Decode/resample input to mono 16 kHz PCM16 little-endian. MP3/WAV container bytes are not PCM frames. Send `{ streamId, sequence, pcmBase64 }` starting at sequence 0; await nextSequence before continuing. Current Host frames are limited to 128 KiB.
3. Consume events({streamId,afterSequence}) for partial/final text and status. Store business transcripts in the app's data if required.
4. Use stop for completion or cancel to abandon. Disconnecting an event stream alone does not cancel transcription. Query get for the actual final state.

Frames and events have bounded replay retention; do not retry a different payload under an existing sequence. ASR_EVENT_CURSOR_EXPIRED requires querying the session state. Preserve partial/error status when the upstream fails. Current interfaces are in `sdk/asr-contracts.mts`; model routing and provider credentials belong to the Host.
