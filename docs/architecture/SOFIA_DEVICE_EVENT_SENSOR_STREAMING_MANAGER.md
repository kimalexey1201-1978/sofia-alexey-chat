# Sofia Device Event & Sensor Streaming Manager — Architecture Specification v1

**Status:** architecture specification only; runtime implementation is pending.  
**Contract baseline:** JSON Schema Draft 2020-12. This specification extends the existing Event Bus and Device & Sensor Data Manager; it does not replace either.

## 1. Purpose

Device Event & Sensor Streaming Manager (DESSM) coordinates bounded, policy-controlled delivery of device-originated events and sensor observations to authorized Sofia consumers. It defines the device-stream lifecycle, event provenance, ordering and freshness metadata, subscription scope, buffering, backpressure, delivery outcomes and cancellation semantics.

DESSM is not a sensor controller, device command executor, generic event broker, voice capture engine, memory store, or permission issuer. It does not create an always-on sensor listener or imply that a device/OS supports continuous streaming.

## 2. Existing component ownership and boundaries

The following responsibilities remain authoritative:

- **Device & Sensor Data Manager (DSDM):** sensor acquisition policy, purpose, consent, sampling/precision bounds, capture sessions, data classification, minimization, retention, deletion and consumer data-access eligibility.
- **Event Bus:** immutable event envelope, authenticated producer identity, event-type registry, transport, publish/subscribe delivery, deduplication, retries, dead-letter handling and replay controls.
- **Identity & Authentication Manager (IAM):** owner/principal authentication and session assurance.
- **Device Trust Manager (DTM):** device identity evidence, pairing credentials, trust freshness and revocation.
- **Universal Device Manager (SDM):** canonical device registry, declared capabilities, lifecycle, connection and device health.
- **Device Adapter SDK / Device Capability Broker (DCB):** adapter contract and sole mediated adapter invocation/transport boundary.
- **Device Runtime / Android Host (SDR/ADH):** adapter lifecycle, platform execution, Android OS permissions and foreground/background constraints.
- **Capability Permission Registry (CPR):** explicit consumer/producer capability grants.
- **Security Manager (SSM):** action- and delivery-specific security decisions; current policy is re-evaluated at delivery.
- **Data Governance & Lifecycle Manager (DGLM):** purpose, classification, destination, retention, export and deletion policy.
- **Resource & Budget Manager (RBM):** CPU, memory, network, battery, storage, concurrency and cost reservations; FREE_ONLY remains the default.
- **Execution Supervisor (ES):** authorized execution boundary and cancellation/deadline supervision.
- **Voice Interaction Manager (VIM):** microphone/audio capture, voice-session semantics, diarization and speaker attribution.
- **Privacy-Aware Output Manager (PAOM):** whether and how private information may be spoken or displayed.
- **Memory Manager:** admission and lifecycle of approved durable memories. A stream subscription never implies permission to write memory.

DESSM coordinates stream-specific metadata and lifecycle. It must not duplicate or override those policy owners.

## 3. Commands, events and observations

Keep three concepts distinct:

1. A **command** requests an action and enters the authorized command path through TPOE → ES → DCB/Integration Gateway.
2. An **event** is an immutable report that something happened; it cannot authorize a command or side effect.
3. A **sensor observation** is a measurement or derived feature with source, time, units, quality and capture provenance. It may be carried as an Event Bus event after DSDM authorization and minimization.

Sensor events must not trigger consequential device actions merely because a consumer subscribed. Any resulting action requires a new plan and fresh CPR, SSM, RBM and ES checks.

## 4. Event identity, provenance and time

Use the existing `contracts/v1/event-envelope.schema.json` as the generic transport envelope. Device/sensor-specific payloads use `contracts/v1/device-sensor-event-payload.schema.json`.

The trusted runtime, not the device payload, resolves the authenticated producer identity. A device-provided ID, sensor label, timestamp, sequence number or firmware string is untrusted evidence until checked against current SDM/DTM and session state.

Device payloads should carry:
- canonical device and sensor registry references;
- DSDM capture-session reference where applicable;
- source event/sequence identifier where the device provides one;
- source occurrence timestamp and clock-quality/uncertainty metadata;
- adapter receipt time and trusted Event Bus ingestion time (the latter remains in the envelope);
- measurement type, unit, bounded value or approved derived feature;
- quality flags, calibration/freshness status and transformation lineage;
- classification and purpose references inherited from DSDM policy.

Do not silently replace source time with ingestion time. Preserve clock skew/uncertainty and distinguish event time, adapter receipt time and bus ingestion time. If time cannot be trusted, mark it unknown/uncertain; do not claim precise ordering.

## 5. Subscription contract and admission

A consumer subscribes to a named, registered event type or data product, never to an unrestricted device feed. Each subscription is bound to:
- authenticated principal and approved module/version;
- purpose and declared task or service scope;
- exact device/sensor references or a narrowly defined eligible group;
- event types, fields and derived-data classes;
- permitted destination and classification ceiling;
- maximum event rate, burst, payload size, queue depth and concurrent deliveries;
- start/expiry time, retention/TTL and delivery mode;
- explicit owner consent/approval references where required.

Admission requires current IAM, DTM/SDM, CPR, DSDM, DGLM, SSM, RBM and ES evidence. Subscription creation is not a perpetual grant. Re-evaluate applicable policy and consent at acquisition, publish, enqueue, delivery, replay and before any downstream side effect. Missing, stale, conflicting or revoked evidence fails closed.

## 6. Stream sessions and lifecycle

A stream session is a bounded operational instance associated with an approved DSDM capture session and one or more authorized Event Bus subscriptions. It has a hard expiry, negotiated sampling/rate limits, resource reservation, delivery policy, cancellation handle and explicit stop reason.

Suggested states:
`requested → policy_check → awaiting_owner_action → starting → active → throttled | paused → stopping → stopped`
Exceptional states include `denied`, `expired`, `permission_revoked`, `device_disconnected`, `degraded`, `failed` and `cancelled`.

A session stops or suspends when its capture session expires, consent/grant is revoked, device trust is suspended, device disconnects, adapter/runtime fails, Android permission is revoked, policy changes, resource budget is exhausted or the owner cancels. Resume requires fresh admission and must not silently restore revoked authority.

## 7. Ordering, duplicates and delivery semantics

- Default delivery is at-least-once, consistent with Event Bus. Consumers must be idempotent.
- DESSM must not claim end-to-end exactly-once delivery.
- Source sequence numbers support gap/duplicate detection only within the source's documented scope; they do not establish global ordering.
- Ordering may be preserved only within a declared device/sensor partition key when the transport supports it.
- Deduplication keys combine stable source identity/sequence where reliable, otherwise event ID and bounded source metadata. Deduplication windows are finite and documented.
- Out-of-order, late, duplicate and missing-sequence observations are represented explicitly; never silently fabricate missing samples.
- A consumer acknowledgement means its declared durable processing boundary was reached, not that a physical action was completed.

## 8. Buffering, offline operation and backpressure

All queues and buffers are bounded by bytes, item count, age/TTL, subscription and resource reservation. Prefer ephemeral in-memory processing. If offline buffering is necessary, DGLM must approve storage, encryption, retention and deletion behavior.

When a producer or consumer exceeds limits:
1. apply negotiated sampling reduction or aggregation only if DSDM permits it;
2. throttle or pause the affected stream;
3. expire stale events rather than delivering them as current;
4. isolate failing consumers and apply bounded retry/backoff;
5. surface a typed degraded/overflow/drop outcome and audit metadata.

Never silently discard data while reporting a complete stream. If loss is unavoidable, record the gap count/reason where known. Do not buffer raw audio/video or precise location by default. No unbounded local queue, automatic paid fallback or silent quota increase.

## 9. Android and cross-platform constraints

Android Host must use supported APIs and comply with runtime permission, foreground-service, notification, background execution, Doze, battery, thermal, network and process lifecycle constraints. A background stream is available only when the specific platform/API/permission state permits it. Scheduled synchronization may be deferred by Android; the UI and contracts must report this honestly.

The OS permission and Sofia capability grant are separate gates. The design must not use hidden APIs, root assumptions, covert microphone/camera capture, Accessibility bypasses or silent permission grants. Other platforms implement the same logical contracts through platform-specific host adapters and report their actual guarantees.

## 10. Privacy, data governance and audit

- DSDM decides what may be captured and at what precision/rate/duration.
- DGLM decides permitted purpose, destination, retention, export and deletion.
- DESSM may route only the minimum authorized event fields.
- Raw audio, image, video, biometric templates, credentials and unnecessary precise location are prohibited from event envelopes and operational logs.
- Large payloads, if exceptionally required, use opaque access-controlled references with integrity metadata and governed short retention.
- Voice samples and speaker attribution remain under VIM; DESSM does not perform speaker recognition.
- Output of private stream-derived content remains subject to PAOM.
- Sensor observations and model interpretations remain distinct. A derived inference must be labeled as such and retain permitted lineage.
- Every subscription decision, stream start/stop, policy denial, throttle, overflow, delivery/replay and revocation is auditable with minimized metadata.

## 11. Failure and cancellation semantics

Cancellation stops queued or cancellable work and requests DSDM/SDR capture shutdown. It cannot reverse already delivered data or an irreversible downstream side effect. The system reports `outcome_unknown` when delivery or processing may have occurred but acknowledgement is missing. Reconciliation uses event IDs, delivery attempts and consumer inbox state; it must not blindly replay a side effect.

Revocation blocks future acquisition/delivery immediately within the system's enforcement boundary and triggers DGLM deletion propagation for governed stored copies and derivatives. Previously disclosed external copies can only be handled according to the applicable processor contract and technical capability; do not claim deletion that cannot be verified.

## 12. Required verification

Before runtime release, tests must cover:
- spoofed device/sensor identity and untrusted producer fields;
- stale/revoked DTM, CPR, consent and owner session;
- capture-session expiry and Android permission revocation;
- clock skew, unknown timestamps, out-of-order events and sequence gaps;
- duplicate delivery, idempotent consumer behavior and bounded deduplication;
- per-partition ordering without global-order assumptions;
- rate/burst/queue/byte limits, backpressure and overflow reporting;
- offline buffering, TTL expiry, process death and reconnect;
- consumer outage, retry exhaustion, dead-letter isolation and authorized replay;
- cancellation before/after dispatch and outcome-unknown reconciliation;
- data minimization, raw-media prohibition, retention/deletion propagation;
- Android foreground/background restrictions, battery/thermal pressure and deferred work;
- confirmation that event content cannot grant permissions or authorize physical actions.

## 13. Implementation sequence

1. Reuse the existing Event Bus envelope and registry; register device sensor event types and payload schemas.
2. Implement subscription admission backed by existing policy services; no independent policy cache may outlive source evidence.
3. Implement bounded stream sessions and DSDM coordination.
4. Add Android Host adapters with foreground-first behavior, explicit UI and platform capability reporting.
5. Add bounded queueing, deduplication, backpressure, TTL and typed delivery outcomes.
6. Add audit, revocation propagation, deletion hooks and independent verification.
7. Run simulator/contract tests before controlled real-device tests.

**Current implementation status:** specification and schemas only. No sensor streaming runtime, subscription service, Event Bus runtime, Android background service, hardware integration or real-device control is implemented by this change.
