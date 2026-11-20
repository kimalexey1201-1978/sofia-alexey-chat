# Sofia AI — Translation Engine v0.1

Status: architecture specification. Provider selection is dynamic; no provider is selected as permanently best.

## Objective

Provide natural, accurate and context-aware translation for text, live speech, conversations and text observed through supported cameras or glasses. Optimize for meaning, terminology, tone and latency rather than literal word substitution.

## Functional modes

- Text translation.
- Two-way conversation mode with speaker turns.
- Streaming speech recognition, translation and speech synthesis.
- Camera translation: frame capture → OCR/vision extraction → text-region detection → translation → optional overlay/audio.
- Wearable mode: route translated audio to a paired headset and translated text to a supported display.
- Offline/degraded mode when supported language packs and device resources are available.

## Provider-independent pipeline

`Input Capture → Language/Context Detection → ASR or OCR → Context Assembly → Translation → Quality Checks → Output Rendering/TTS`

Each stage is an adapter behind a versioned contract. Providers may be different for speech recognition, translation, OCR/vision and text-to-speech.

## Quality strategy

- Preserve meaning, names, numbers, dates, units, negation, speaker intent and formatting.
- Use conversation context and optional user/domain glossary.
- Detect idioms, slang, honorifics and domain terminology.
- Preserve uncertainty: mark low-confidence recognition or ambiguous source text instead of inventing certainty.
- Keep source text available for comparison when the user requests it.
- Support formal, neutral and conversational register.
- Allow correction feedback to improve user-approved glossary entries; do not silently train on private conversations.

## Provider selection

The Translation Engine queries the Capability Registry for compatible providers and ranks them using:
- language-pair and dialect coverage;
- task type (OCR, ASR, translation, TTS);
- measured quality for the relevant language/domain;
- end-to-end latency and streaming support;
- privacy/data residency constraints;
- availability, reliability and cost;
- offline capability and device resource use.

Provider metadata must be current and tested. "Newest model" does not automatically mean best for every language pair. Use evaluation sets and live health signals; retain fallback providers.

## Translation quality evaluation

Maintain versioned test sets by language pair, dialect, domain and mode. Evaluate semantic adequacy, fluency, terminology consistency, named entities, numbers, omissions/additions, speech recognition word error rate, latency and human preference. Compare changes before promoting a provider/model. Report uncertainty where evaluation coverage is weak.

## Streaming and latency

Use partial hypotheses for low-latency conversation, but distinguish provisional from finalized output. Do not speak unstable partial translations as if final. Provide interruption handling, turn detection, echo/noise handling and a configurable delay/accuracy trade-off.

## Privacy and consent

Camera and microphone capture are off until explicitly started and permitted by the operating system. Show clear capture state. Minimize frame/audio retention; process locally when feasible. Do not retain raw recordings by default. External providers receive only the minimum data needed, under the configured privacy policy.

## Failure behavior

If a provider fails, retry only safe requests and switch to a compatible fallback. If confidence is low, ask for repetition or show the source text. Never fabricate a translation. Clearly label offline, partial or uncertain results.

## Acceptance criteria

- Same contract works with multiple provider adapters.
- Language-pair/provider capability is checked before routing.
- Conversation context improves coherence without leaking across unrelated sessions.
- Numbers, negation, names and key terminology are covered by regression tests.
- Low-confidence recognition is surfaced to the user.
- User can stop capture immediately and clear retained data.
- Wearable routing is capability- and permission-dependent, not assumed universal.
