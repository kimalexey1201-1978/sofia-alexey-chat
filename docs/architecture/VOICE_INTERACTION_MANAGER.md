# Voice Interaction Manager

**Status:** Architecture specification  
**Version:** 1.0  
**Applies to:** Android-first voice interface, audio adapters, Identity & Authentication Manager, Communication Manager, and Task Orchestrator

## 1. Purpose

The Voice Interaction Manager (VIM) provides a reliable, privacy-conscious voice interface for Sofia. It coordinates wake-word detection, capture-session control, speech activity detection, speaker diarization, owner-speaker verification, optional target-speaker extraction, speech recognition, turn management, and spoken responses.

The manager must prioritize the owner's recoverable speech in multi-speaker environments. The presence of other people speaking must not, by itself, cancel the owner's command. When the owner's speech can be separated or reliably recognized, Sofia should continue processing it. If a specific segment remains unrecoverable, Sofia should ask for that segment to be repeated rather than discarding the entire command.

## 2. Core invariants

1. **Wake word is activation, not authentication.** Hearing "София" opens a bounded interaction session; it does not prove who is speaking.
2. **Owner-first, not owner-only capture.** Other voices may be present. Their presence must not automatically suppress the owner's speech.
3. **No invented recovery.** Do not merge words from different speakers or fill inaudible gaps as if they were heard.
4. **Segment-level recovery.** Preserve confidently recognized portions and request clarification only for unclear spans.
5. **Voice biometrics are bounded evidence.** Speaker verification contributes to identity confidence but cannot alone authorize high-impact actions.
6. **Explicit capture state.** Microphone activation, active listening, pause, and termination must be represented and visible to the user.
7. **Platform-compliant operation.** Use supported Android APIs and permission flows; no hidden microphone access or permanent covert listening.
8. **Data minimization.** Prefer on-device wake-word detection and speech processing where feasible; do not retain raw audio by default.
9. **Untrusted transcript.** Speech content is user input, not policy or authority.
10. **Graceful degradation.** If separation or recognition fails, disclose the limitation and offer a focused retry or text input.

## 3. Interaction pipeline

1. **Standby:** use only the explicitly configured activation mechanism, with platform-compliant resource and privacy controls.
2. **Wake-word detection:** detect the configured phrase "София" using a local detector where feasible. Apply anti-spoofing and false-activation controls appropriate to device capability.
3. **Session opening:** create a bounded capture session, indicate that listening is active, and start a configurable inactivity/maximum-duration timer.
4. **Audio preprocessing:** apply supported echo cancellation, noise suppression, automatic gain control, and beamforming. Preserve source audio only transiently when required for processing.
5. **Voice activity detection:** identify speech regions without treating overlapping speech as a reason to discard the whole session.
6. **Speaker diarization:** estimate speaker turns and overlap regions. Speaker labels are temporary session identifiers unless separately enrolled and lawfully retained.
7. **Owner-speaker verification:** compare suitable speech segments against the user's enrolled voice profile, with quality and confidence thresholds. Poor-quality audio must yield an inconclusive result, not a forced identity.
8. **Target-speaker extraction:** when supported, isolate or enhance the owner's speech using diarization, spatial cues, beamforming, and source separation. Do not claim successful isolation unless quality checks support it.
9. **Speech recognition:** transcribe owner-attributed segments and preserve timestamps, confidence, overlap markers, and uncertain spans.
10. **Turn assembly:** assemble only segments attributable to the owner with adequate confidence. Keep speaker attribution and uncertainty attached to each segment.
11. **Intent and authorization:** pass the transcript to Task Orchestrator as untrusted input. Identity & Authentication Manager and Security Manager separately handle authentication and authorization.
12. **Response:** use the Communication Manager and speech synthesis adapter according to user settings.
13. **Session close:** stop capture, release audio resources, clear transient buffers under retention policy, and record a privacy-minimized audit event.

## 4. Multi-speaker handling

The system should distinguish:
- owner's speech, confidently attributed;
- other-speaker speech;
- overlapping speech with partial owner attribution;
- uncertain or unattributed speech;
- non-speech audio.

When owner speech overlaps another speaker:
- continue if the owner's words can be recovered with adequate confidence;
- prefer owner-attributed audio, not merely the loudest speaker;
- never splice another speaker's words into the owner's transcript;
- mark masked or uncertain spans explicitly;
- request only the missing phrase or clause when the rest of the command is reliable.

If speaker separation is unavailable on a device, Sofia may use best-effort diarization and recognition, then ask a targeted clarification. The UI must not promise source separation beyond tested hardware/software capability.

## 5. Voice enrollment and identity

Enrollment is an explicit user-controlled process. It should:
- explain what voice data is collected and why;
- capture multiple utterances under suitable conditions;
- store a protected voice representation rather than raw recordings where feasible;
- support re-enrollment, disablement, and deletion;
- detect low-quality or changed conditions and return inconclusive results;
- avoid enrolling bystanders without their explicit consent.

Voice verification is a probabilistic signal. It can support personalization and low-risk session continuity, but high-risk operations require an independent step-up method such as device authentication or explicit confirmation through a trusted channel.

## 6. Session states and controls

Suggested states:

`standby → wake_detected → capture_active → processing → awaiting_clarification | response_ready → responding → closed`

Additional terminal or exceptional states include `cancelled`, `timed_out`, `permission_denied`, `audio_unavailable`, and `verification_inconclusive`.

The user must be able to:
- disable wake-word activation;
- start/stop listening manually;
- see or hear when capture is active;
- cancel the current session;
- inspect and delete retained voice profile data;
- choose on-device/cloud processing where supported;
- set session duration and inactivity timeout;
- use a text fallback.

## 7. Android-first implementation constraints

Android implementation must use documented microphone permissions and supported audio APIs. Background activation must be designed around current OS restrictions, battery management, foreground-service requirements, and clear user-visible indicators. If continuous low-power wake-word detection cannot be supported reliably or lawfully in a given device/OS state, use push-to-talk, headset button, quick setting, or another supported activation path.

No accessibility-service abuse, hidden APIs, permission circumvention, or covert recording. Device-specific DSP and neural acceleration may be used only through supported APIs and verified capabilities.

Cross-platform desktop implementations may provide additional input modes, but they must implement the same session, consent, identity, and audit contracts.

## 8. Audio processing and provider routing

Audio capabilities are independent from text-model capabilities. The system may route speech recognition, separation, and synthesis to different local or remote engines.

Provider selection must respect:
- audio quality and language/dialect support;
- speaker overlap performance;
- latency and streaming support;
- privacy and data residency policy;
- device compute, battery, thermal state, and network;
- measured quality evidence from AI Evaluation & Quality Manager.

Raw audio must not be sent to a remote provider unless the applicable consent and Security Manager decision permit it. When processing locally is feasible and meets quality thresholds, prefer it for privacy and latency.

## 9. Uncertainty and clarification policy

Each recognized segment carries confidence and attribution metadata. Do not collapse these into one misleading confidence score.

- High-confidence owner segment: may be included in the command.
- Ambiguous speaker attribution: exclude from owner command and ask a focused question if material.
- Low-confidence words: mark as unclear; do not guess.
- Overlap masking a small phrase: request that phrase only.
- Entire utterance unusable: ask the user to repeat the whole command.
- Possible bystander command: do not execute as the owner without appropriate authentication.

Clarification should be concise and neutral. Never imply the user said something that the system did not reliably hear.

## 10. Security and abuse resistance

- Wake-word detection must be resistant to accidental activation and common replay/spoofing scenarios to the extent supported by device capabilities.
- Voice profile access is restricted and audited.
- Audio/transcript content is untrusted and may contain prompt injection.
- Speaker identity does not imply permission for a requested action.
- High-impact actions require action-specific authorization and step-up authentication.
- Session tokens are short-lived, scoped, and bound to device/session identity.
- Audio buffers and intermediate embeddings have explicit retention and deletion behavior.
- Bystander speech must not be used to build profiles or unrelated memory.

## 11. Observability

Record privacy-minimized operational data:
- wake-word false activation and missed activation rates;
- capture start/stop outcomes;
- speech activity and overlap rates;
- diarization and owner-attribution confidence distributions;
- segment-level recognition confidence and clarification frequency;
- end-to-end latency and resource usage;
- permission and provider failure categories.

Do not log raw audio or full transcripts by default. Diagnostic capture requires separate, explicit, time-limited consent.

## 12. Acceptance criteria

1. Wake-word activation does not authenticate the speaker.
2. The owner can be recognized in the presence of other speakers when the audio signal permits.
3. Other-speaker presence alone does not cancel an owner command.
4. Speaker attribution is preserved through transcription and turn assembly.
5. The system never merges another speaker's words into the owner's command.
6. Unrecoverable spans trigger targeted clarification rather than silent guessing.
7. Low-quality or uncertain voice verification returns inconclusive.
8. Voice alone cannot authorize high-impact actions.
9. Microphone state is explicit and user-controllable.
10. Android implementation respects permissions, background limits, and visible capture indicators.
11. Raw audio is not retained by default and remote processing requires policy approval.
12. Audio/provider failure produces a clear fallback instead of a false success.
