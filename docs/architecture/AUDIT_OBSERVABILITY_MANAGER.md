# Sofia AI Audit & Observability Manager — Foundation v1

## Status and purpose

This document defines the audit and operational-observability foundation. It is a specification, not a claim that production telemetry or tamper-evident storage is already deployed. The current application and production branch remain unchanged.

The manager provides two related but distinct functions:

- **Audit** answers: who or what attempted an action, under which authority, what decision was made, and what outcome followed?
- **Observability** answers: is the system healthy, reliable, performant and within its resource/security budgets?

## 1. Design invariants

1. Security-relevant events are recorded at trusted enforcement boundaries, not solely from model-generated summaries.
2. Logs are append-oriented and integrity-protected; privileged actors cannot silently rewrite history.
3. Collect the minimum data needed for accountability and diagnosis.
4. Never log passwords, API keys, access tokens, private keys, raw biometric templates or unrestricted private content.
5. Separate security audit records from diagnostic telemetry and product analytics.
6. Use stable correlation IDs across orchestrator, modules, tools, providers and devices.
7. Every event carries schema and policy versions where relevant.
8. Telemetry failure must not silently disable authorization checks. For high-risk operations, inability to durably record a mandatory audit event may block execution according to policy.
9. Retention, access, export and deletion rules must be explicit and jurisdiction-aware.
10. The owner must be able to inspect meaningful activity history and understand why protected actions were allowed, denied or escalated.

## 2. Event classes

- **Identity:** enrollment, authentication success/failure, session creation/revocation, device registration.
- **Authorization:** policy decision, grant issuance/revocation, approval challenge and result.
- **Execution:** capability invocation, start/completion/failure, external side effect and idempotency reference.
- **Module lifecycle:** discovery, validation, quarantine, activation, suspension, update and rollback.
- **Device lifecycle:** pairing, permission change, disconnect, reconnect and sensor access.
- **Data governance:** access, export, retention action and deletion request/result.
- **Security:** anomaly, replay/spoof signal, rate-limit event, emergency stop and credential rotation.
- **Operations:** latency, error, queue depth, resource use, provider availability and health-check result.

## 3. Required audit event fields

Each audit event should include:
- immutable event ID and event type;
- occurrence and recording timestamps;
- schema version and source component;
- correlation and causation IDs;
- actor/principal and device references where known;
- module ID/version where applicable;
- action/capability and resource reference;
- policy decision, reason code and grant/approval references where applicable;
- outcome and normalized error code;
- data classification and redaction metadata;
- integrity metadata (sequence, previous-event digest or equivalent).

Avoid embedding raw prompts, full documents, audio/video, location trails or message bodies. Prefer references, hashes and structured summaries. Any content capture must have a separate purpose, access policy and retention basis.

## 4. Integrity, storage and time

- Use append-only or write-once storage semantics where supported.
- Chain events with sequence numbers and cryptographic digests; periodically anchor signed checkpoints outside the mutable event store.
- Protect signing keys using platform/server secure storage and rotate them under controlled procedures.
- Record both event time and ingestion time; identify clock uncertainty.
- Use monotonic clocks for local duration measurement and UTC timestamps for cross-system correlation.
- Detect gaps, duplicate IDs, invalid signatures and out-of-order sequences.
- Back up audit data with access separation and tested restoration.

Hash chaining makes unauthorized edits detectable; it does not by itself prove that an event was truthful at the source. Trusted capture points, access control and key protection remain necessary.

## 5. Observability signals

Standardize structured logs, metrics and distributed traces.

Recommended metrics include:
- command-to-response latency and speech-to-text latency;
- wake-word false activation and missed activation rates;
- speaker attribution confidence distribution and unknown-speaker rate;
- owner-speech extraction quality and clarification rate;
- module/provider success, timeout and retry rates;
- policy decision counts by outcome and reason;
- queue depth, CPU/memory/GPU/NPU use, battery and network usage;
- device connection and sensor permission status.

Metrics must be aggregated and privacy-preserving. Do not use raw voiceprints or message content as metric labels.

## 6. Alerts and response

Define severity levels and owner-visible notices for:
- repeated authentication failures or suspected spoof/replay;
- unexpected privilege or permission changes;
- module integrity/provenance failure;
- emergency stop activation;
- unusual data egress or quota consumption;
- audit integrity gaps;
- repeated provider/device failures affecting core functions.

Alerts should be actionable, rate-limited and resistant to attacker-triggered notification floods. A security alert must not include secrets or unnecessary private content.

## 7. Access and governance

- Separate write, read, export and administration permissions.
- Modules may submit only their own scoped telemetry; they cannot edit or delete audit history.
- Owner-facing history should explain actions in plain language while preserving machine-readable evidence.
- Sensitive audit records require least-privilege access and access itself must be audited.
- Define retention by event class and legal basis; apply shorter retention to high-sensitivity diagnostic data.
- Provide export and deletion workflows where permitted, while preserving legally required security records under a documented policy.

## 8. Failure and degraded modes

- If ordinary diagnostics are unavailable, core safe functions may continue with bounded local buffering.
- If mandatory audit persistence is unavailable, R2/R3 actions must follow a fail-closed policy; do not perform consequential side effects without required evidence.
- Buffering must be encrypted, bounded, replay-safe and flushed in order when connectivity returns.
- If the buffer is full, drop low-priority diagnostics first; never silently discard mandatory security events.
- Surface degraded audit status to the owner and operations monitor.

## 9. Acceptance tests

1. A protected action produces a trusted decision event and an execution outcome event.
2. Audit events contain no secrets or raw biometric templates.
3. Tampering, deletion, duplication or sequence gaps are detected.
4. An ordinary telemetry outage does not bypass Security Manager.
5. R2/R3 operations follow the defined fail-closed behavior when mandatory audit persistence is unavailable.
6. Correlation IDs connect a request across orchestrator, module and provider boundaries.
7. A module cannot rewrite or erase events belonging to another component.
8. Owner-visible history explains allow, deny, approval and step-up decisions.
9. Sensitive diagnostic payloads obey consent, retention and access controls.
10. Alerts are actionable and rate-limited.

## 10. Implementation boundary

The Audit & Observability Manager exposes versioned event-ingestion, query, metrics and trace interfaces. Platform-specific storage adapters may differ, but event semantics, redaction requirements, integrity verification and access policy remain consistent. It must integrate with Security Manager and IAM without becoming an alternate authorization path.
