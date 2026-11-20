# Privacy-Aware Output Manager — Architecture Requirement v1

## Status

Accepted architecture requirement; design specification only. This document does not implement microphone analysis, speaker recognition, camera sensing, display privacy, audio routing, or email access. No production settings, secrets, deployments, or the `main` branch are changed.

## 1. Purpose

Privacy-Aware Output Manager (PAOM) decides how Sofia presents private or potentially sensitive information. It operates after the requested data has been retrieved and classified, but before any content is spoken, displayed, transmitted to a wearable, or routed to another output device.

The manager is a policy enforcement component, not a language-model preference. The model may suggest a presentation mode but cannot override the policy or infer consent.

## 2. Core principles

1. **Owner control:** the owner chooses whether eligible content is spoken or displayed. A conservative default must not remove the owner's ability to choose.
2. **Data minimization:** expose only the minimum information needed for the current request. For example, announce sender and subject before reading the full email.
3. **Privacy before convenience:** if the environment or output channel is uncertain, do not automatically speak message contents.
4. **No false certainty:** microphone, camera, proximity, and device signals are probabilistic and capability-dependent. Never claim that Sofia knows with certainty that the owner is alone.
5. **No model self-authorization:** a model response, transcript, OCR result, or external message cannot authorize disclosure.
6. **Fail safely:** if sensing fails, permissions are denied, or signals conflict, use a non-audio private option where available and ask the owner.

## 3. Inputs to the decision

PAOM may consider the following signals, each with provenance, freshness, confidence and permission state:

- **Content classification:** public, personal, sensitive, highly sensitive; classification comes from policy and trusted metadata, not solely from model inference.
- **Owner/session state:** verified owner session, device trust, session expiry and current assurance.
- **Speaker context:** diarization and owner-speaker verification results, including uncertainty and overlap flags.
- **Acoustic context:** evidence of other voices or active conversation near the microphone. This is a risk signal, not proof of how many people are present.
- **Visual context:** camera-based person detection only when the device supports it and the owner has explicitly granted the relevant permission. Prefer on-device processing; do not retain frames by default.
- **Output route:** phone loudspeaker, earpiece, wired/Bluetooth headphones, wearable, vehicle audio, smart speaker, display or external screen.
- **Output privacy capabilities:** whether the route is plausibly private, whether the screen is locked/shared/cast, and whether another person could easily see or hear the output.
- **Owner preference:** explicit per-request choice and stored privacy defaults. A one-time choice must not silently become a global permission.

Missing or stale signals must be represented as unknown, not as “alone” or “private”.

## 4. Output decision flow

1. Authenticate the owner session according to the Identity & Authentication Manager. A wake word or voice transcription alone is not an authenticated session.
2. Identify the requested resource and its data classification.
3. Determine the available output routes and their privacy characteristics.
4. Evaluate speaker/environment signals only where permission and device capabilities allow.
5. Apply the policy matrix below.
6. If a choice is needed, ask a minimal, non-revealing question (for example: “There may be other people nearby. Should I read it aloud or show it on your phone?”). Do not include the email subject, sender, or body in that question unless the owner has already authorized that disclosure.
7. Honor the owner's current choice when it is allowed by policy. If the owner chooses loudspeaker output in a shared environment, obtain clear confirmation before speaking sensitive content.
8. Record a minimal audit event: policy decision, output class, route class, signal status and owner choice. Do not log message body, biometric templates, raw audio or camera frames.

## 5. Default policy matrix

| Content / context | Default behavior | Owner choice |
|---|---|---|
| Public or non-personal information | Normal requested output | Voice or screen |
| Personal content; no evidence of nearby speakers; trusted private route | Follow current request | Voice or screen |
| Personal content; other speakers detected or environment uncertain | Ask before reading; offer phone screen | Voice only after explicit choice; screen is default |
| Sensitive / highly sensitive content | Prefer authenticated screen or confirmed private audio route; avoid speakerphone | Explicit choice; step-up authentication if required by risk policy |
| Screen locked, screen sharing/casting active, or shared display likely | Do not reveal content on that display | Use a trusted personal screen or ask |
| Headphones connected | May be treated as a more private route, but not guaranteed private | Follow request unless other risk signals require confirmation |
| Sensor permission denied, sensor unavailable, stale or conflicting signals | Treat environment as unknown | Ask or use a private screen |
| Owner cannot be confidently attributed in a multi-speaker exchange | Do not disclose private content or execute owner-only commands | Ask for a repeat or use device confirmation |

A connected headset is only a privacy hint: it may be disconnected, route audio elsewhere, or leak sound. The operating system's actual audio route should be checked where supported.

## 6. Example: incoming email

1. A new-email notification arrives.
2. Owner says: “Sofia, check my mail.”
3. Sofia checks the mail only if the owner session and Gmail read capability are valid.
4. Sofia may announce a minimal notification such as “You have a new email” without exposing the sender or subject in a shared acoustic environment.
5. Owner says: “Read it.”
6. If the room appears shared or the environment is uncertain, Sofia asks: “There may be other people nearby. Would you like me to read it aloud or show it on your phone?”
7. “Show it” displays the content on the owner's personal device, respecting lock-screen, casting and screen-sharing state.
8. “Read it” is treated as explicit per-message consent to audible disclosure. For highly sensitive content, stronger confirmation may still be required by policy.
9. Replying, forwarding, deleting or changing mailbox settings is a separate capability and requires its own action-bound confirmation. Reading permission does not imply write permission.

## 7. Device and platform behavior

- Android is the primary implementation target. Use platform audio-route and screen/casting state APIs where available; report unavailable signals explicitly.
- Wearables, glasses, vehicle systems, smart speakers, computers and external displays must advertise output capabilities and privacy limitations through the Device Manager registry.
- A device must not claim “private output” merely because it is paired or registered.
- Prefer local processing for speaker/environment analysis. Cloud processing of ambient audio or camera data requires a separate privacy review and explicit owner consent.
- Do not continuously capture or retain ambient audio/video for this feature. Process only within an explicitly active interaction and within OS permission boundaries.
- A display is not automatically private: consider lock state, mirroring/casting, shared-screen context and notification previews.
- If a device cannot provide sufficient privacy signals, classify its output privacy as unknown.

## 8. Data protection and retention

- Do not store raw ambient audio, raw camera frames, message bodies or biometric templates in PAOM audit records.
- Keep only the minimum decision metadata needed for security diagnostics, with a defined retention period.
- Keep message content in the authorized mail/data adapter; PAOM receives classification and a short-lived content reference where possible, not an unnecessary duplicate.
- Do not send private message contents to an external model merely to choose an output route.
- Do not use ambient conversations to train or silently update the owner's voice profile.

## 9. Required interfaces

PAOM consumes versioned interfaces for:
- authenticated owner/session context;
- data classification and content reference;
- speaker/environment observations with confidence, provenance and expiry;
- device/output-route capability and privacy status;
- owner preferences and per-request consent;
- policy decision and audit event.

The manager returns a decision such as `ALLOW_VOICE`, `ALLOW_PRIVATE_DISPLAY`, `ASK_OWNER`, `REQUIRE_STEP_UP`, or `DENY_DISCLOSURE`, with a reason code and expiry. The final action is enforced by the output adapter; the model cannot bypass the manager.

## 10. Acceptance tests

1. In a known multi-speaker environment, personal email content is not read aloud before owner choice.
2. When the environment is uncertain or sensors are unavailable, the system does not assume the owner is alone.
3. The prompt asking for a choice does not reveal sender, subject, body or other private details.
4. “Show it” uses the owner's personal display and does not expose content through a locked, mirrored or shared display.
5. “Read it” is scoped to the current message/request and does not create blanket permission for future messages.
6. A headset is treated as a privacy hint, not an absolute guarantee.
7. A clearly owner-attributed command is not cancelled solely because background speakers are present; only ambiguous speech segments are clarified.
8. Voice match alone cannot authorize high-risk actions or bypass step-up policy.
9. Model output, OCR, email content or a transcript cannot change the policy decision or consent state.
10. Raw audio, camera frames, biometric templates and message bodies are absent from PAOM audit logs.
11. If sensor permissions are revoked during a session, the manager safely re-evaluates output before disclosure.
12. Reading, replying, forwarding and deleting email remain distinct capabilities.
13. A connected device with unknown privacy characteristics is never treated as a trusted private output by default.
14. The owner can explicitly choose a permitted output mode on each request.

## 11. Implementation sequence

A. Define and version the data-classification, environment-observation, output-route and consent contracts.
B. Implement a deterministic policy evaluator with unit tests and no microphone/camera dependency.
C. Add Android adapters for audio route, screen lock, casting and user-controlled output selection.
D. Add optional speaker/environment signals only after separate permission, accuracy and privacy validation.
E. Integrate mail read-only capability behind owner authentication and read-only scopes.
F. Add reply/forward/delete only as separate capabilities with action-bound approval.
G. Run multi-speaker, shared-screen, headset-routing, permission-revocation, privacy and regression tests before enabling the feature.

## 12. Explicit non-goals

This specification does not implement room occupancy detection, camera surveillance, speaker diarization, voice biometrics, Gmail integration, or automatic email reading. It does not guarantee that sensors can identify every person or determine with certainty whether an output is private.
