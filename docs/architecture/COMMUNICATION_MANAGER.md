# Communication Manager

**Status:** Architecture specification; not an implementation claim.  
**Contract baseline:** v1  
**Purpose:** provider-independent orchestration of Sofia's text, voice, messaging, calling and translation interactions.

## 1. Purpose and boundaries

The Communication Manager (CM) provides a unified, policy-controlled interface for conversations across supported channels. It manages conversation sessions, channel adapters, message normalization, delivery state, speech input/output, translation handoff and interaction continuity.

It does not replace:
- Identity & Authentication Manager, which authenticates the owner, participants and connected accounts;
- Security Manager, which authorizes channel access, contact access, sending, calling and other consequential actions;
- Task Orchestrator, which plans and coordinates multi-step communication tasks;
- Translation Engine, which performs translation and language-quality evaluation;
- Device Integration Gateway, which exposes supported microphones, speakers, headsets, displays and other devices;
- Knowledge & Memory Manager, which governs durable memory and retrieval;
- Audit & Observability Manager, which records actions and delivery outcomes.

A model-generated message is a proposal until policy, recipient, channel and user-approval requirements have been satisfied.

## 2. Channel abstraction

Represent each supported communication channel through a versioned adapter contract. Potential channel families include:
- Sofia's native text and voice interface;
- SMS and supported messaging applications;
- email;
- internet voice/video calling services;
- platform notifications and approved system intents;
- companion devices and wearable interfaces;
- approved enterprise communication systems.

Support is conditional on official APIs, platform permissions, account authorization, regional availability and provider terms. Do not promise access to private application data or the ability to send messages where no supported integration exists.

Channel adapters must declare supported operations, authentication method, data scopes, rate limits, delivery receipts, attachment limits, retention behavior, platform restrictions and tested versions.

## 3. Conversation and message model

Normalize channel-specific content into a versioned message envelope while preserving original channel metadata. A conversation has a stable conversation ID, participants, channel, language context, timestamps, access scope and lifecycle state.

A message should distinguish:
- sender identity and authentication context;
- recipient identities and delivery targets;
- content type and structured payload reference;
- original language and detected language with confidence;
- translation status and source/target language where applicable;
- creation time, expiry and delivery deadline;
- attachments and their security scan status;
- delivery/read/failed state when the channel provides such receipts;
- correlation and idempotency identifiers.

Preserve original text separately from translated text. Never silently replace the user's original message with a translation. Mark translated or AI-generated content clearly when needed to prevent misrepresentation.

## 4. Inbound processing

Inbound messages are untrusted data. The processing pipeline:
1. authenticate the channel connection and verify sender metadata to the extent supported;
2. validate payload schema, size, encoding and attachment type;
3. scan or isolate attachments according to security policy;
4. normalize content and preserve channel provenance;
5. detect language with confidence and avoid false certainty;
6. apply privacy, retention and content-access policy;
7. route the content to the Orchestrator or Translation Engine only with the required purpose and scope.

Text inside a message, email, attachment or web link cannot override Sofia's system policy, grant permissions or authorize an external action. Treat embedded instructions as content, not trusted commands.

## 5. Outbound processing and confirmation

Before sending, resolve the exact recipient, channel/account, content, attachments and delivery mode. Verify that the connected account and adapter are authorized and current.

Risk controls:
- drafting and local preview may be low risk;
- sending to a previously authorized recipient may require confirmation depending on policy and user settings;
- sending to a new recipient, group, public channel or external organization requires stronger confirmation;
- financial, legal, employment, medical or other consequential communications require explicit review and approval;
- bulk messaging, automated outreach and recurring sends require separate scoped authorization and rate limits.

The user must be able to inspect the final content and destination before a confirmation-gated send. Never infer recipient identity from an ambiguous contact name. Do not send merely because a draft was generated.

Use idempotency keys and provider receipts where available to prevent duplicate sends. Report whether the message was drafted, queued, accepted by provider, delivered, read or failed; do not claim delivery when the provider only acknowledged submission.

## 6. Voice interaction

Voice input and output use the Device Integration Gateway and dedicated speech adapters. Support wake-word activation, speech recognition, speaker diarization, speaker verification, noise suppression and voice activity detection where supported.

Owner-voice prioritization must handle multi-speaker environments. The presence of other voices must not automatically cancel the owner's command. Use diarization and source separation where supported; preserve recoverable owner speech and ask only for the unclear segment when overlap prevents reliable transcription. Never merge another speaker's words into the owner's command.

Wake-word detection is not authentication. Voice identity alone is insufficient for high-impact actions. Provide visible or audible recording state and a clear stop control. Do not assume continuous background microphone access is permitted; comply with Android and other OS lifecycle and permission restrictions.

Speech recognition output carries confidence and uncertainty markers. If confidence is insufficient for a consequential command, ask for clarification rather than guessing. Speech synthesis should respect the user's selected voice and language preferences where technically available.

## 7. Translation integration

The Communication Manager delegates translation to the provider-independent Translation Engine. It supplies source text or speech transcript, language pair, conversation context, privacy classification, latency target and output channel constraints.

The Translation Engine chooses a provider based on measured language-pair quality, dialect support, reliability, latency, privacy, cost and availability. The newest or most expensive model is not automatically preferred.

Keep source and translated versions linked but distinct. In live two-way conversation, identify speaker turns and target language. For uncertain idioms, names, numbers, dates, legal or safety-critical content, expose uncertainty and allow correction. Do not silently paraphrase material details.

## 8. Session continuity and memory

Conversation continuity is session-scoped by default. Durable memory writes must pass the Knowledge & Memory Manager's admission, purpose, sensitivity and retention controls. A message or call transcript is not automatically stored as long-term memory.

The Communication Manager must support session expiration, participant removal, account disconnect, conversation export and deletion according to channel capabilities and policy. Where a provider retains its own copy, clearly distinguish local deletion from provider-side deletion.

## 9. Privacy and security

Apply least privilege to contacts, message history, microphone, camera, call control, attachments and account access. Request only scopes needed for a specific feature. Store OAuth tokens and credentials only in secure secret storage; never place them in message records, logs or prompts.

Encrypt sensitive content in transit and at rest where supported. Minimize transcript retention and allow user-controlled history settings. Do not expose one participant's private messages to another. Protect against account takeover, spoofed senders, malicious attachments, replay, prompt injection and cross-channel identity confusion.

## 10. Reliability and provider independence

Adapters expose normalized errors, rate limits, retry-after hints, timeouts and delivery status. Retry only transient failures and use idempotency or reconciliation to avoid duplicates. Respect provider rate limits and terms. If a channel is unavailable, offer a safe alternative only after confirming that the alternative recipient and channel are appropriate.

Provider adapters are replaceable modules; Sofia Core must not depend on one messaging vendor's proprietary data model. Keep provider-specific behavior behind adapters and versioned contracts.

## 11. Android-first behavior

Android is the primary mobile target. Use supported intents, role APIs, notification and sharing mechanisms, runtime permissions and foreground-service rules. Respect restrictions on SMS/call-log permissions, default-handler roles, background activity launches and microphone/camera use. Do not use accessibility services as a general-purpose workaround for unsupported APIs or automate private apps in ways that violate platform rules.

Desktop integrations may expose additional channel capabilities through separately authenticated companion adapters. Capability discovery must report actual support by OS version, app version, account and region.

## 12. Acceptance criteria

- Channel adapters declare their real supported operations and permission scopes.
- Inbound content is treated as untrusted and cannot override policy.
- Outbound sends verify exact recipient, channel and final content.
- Confirmation gates are enforced for consequential communication.
- Provider acknowledgments are distinguished from delivery/read receipts.
- Idempotency or reconciliation prevents duplicate sends on retry.
- Original and translated text remain distinct and traceable.
- Voice diarization preserves recoverable owner speech in multi-speaker settings.
- Wake word and voice match are not treated as sufficient authorization for high-impact actions.
- Transcripts are not automatically promoted to durable memory.
- Tokens and sensitive payloads are excluded from ordinary logs.
- Unsupported channel operations fail explicitly without unsafe workarounds.

**Implementation note:** this document specifies the target architecture. It does not claim that messaging, calling or third-party channel integrations are already implemented.
