# Event Bus

**Status:** architecture specification; runtime implementation is pending.  
**Contract baseline:** JSON Schema Draft 2020-12; schema documents declare `schema_version`; public interfaces declare `contract_version`, following [CONTRACT_AND_IDENTIFIER_STANDARDS.md](CONTRACT_AND_IDENTIFIER_STANDARDS.md).

## 1. Purpose and boundaries

The Event Bus provides asynchronous, decoupled communication between Sofia modules and approved external adapters. Producers publish facts; authorized consumers subscribe and react without requiring direct knowledge of one another.

An event is an immutable statement that something happened. A command is an explicit request to perform an action. They are not interchangeable:
- Commands enter an authorized command/request path and require policy evaluation.
- Events report facts or lifecycle transitions; publishing or consuming an event does not grant authority to perform a side effect.
- Operations that require an immediate result continue to use synchronous request/response APIs. The Event Bus is not a universal replacement for those APIs.

The bus transports messages; it does not replace Sofia Core, Task Orchestrator, Security Manager, Identity & Authentication Manager, Privacy & Data Governance Manager, Audit & Observability Manager, or the independent verifier.

## 2. Event identity and envelope

Every event MUST have:
- immutable event ID (UUIDv7 recommended);
- namespaced event type and explicit `contract_version`;
- `schema_version` for the envelope schema, distinct from the event contract version;
- producer module identity resolved and authenticated by the server/runtime, never trusted from an untrusted client payload;
- event occurrence time and bus ingestion time as separate UTC timestamps;
- correlation ID and, where applicable, causation ID;
- optional aggregate/partition key for scoped ordering;
- principal/tenant context only when needed and authorized;
- data classification and privacy metadata;
- bounded payload or a controlled payload reference, with payload integrity metadata where applicable;
- idempotency key or stable event ID for duplicate detection.

Event records are immutable. Corrections are represented by a new compensating or superseding event, not by silently rewriting an event already observed by consumers.

## 3. Delivery guarantees

The default delivery model is **at-least-once**. Consumers MUST be idempotent. The platform MUST NOT claim end-to-end exactly-once processing.

Ordering is guaranteed only within an explicitly selected aggregate or partition key, where the chosen transport supports it. No global ordering guarantee is made across modules or partitions.

The runtime should implement:
- durable producer outbox and consumer inbox/deduplication records;
- acknowledgment only after the consumer's durable processing/commit boundary;
- bounded deduplication retention and documented replay behavior;
- delivery states such as accepted, queued, started, succeeded, retrying, dead-lettered, cancelled, and expired;
- bounded retries using exponential backoff with jitter;
- per-subscription concurrency, queue limits, quotas, deadlines, and backpressure;
- circuit breakers and isolation so one failing consumer cannot exhaust shared resources.

A crash between side effect and acknowledgment can cause redelivery. Consumers must use idempotency keys or transactional inbox/outbox patterns to prevent duplicate side effects where feasible. Irreversible external effects require their own reconciliation strategy.

## 4. Failure handling and dead letters

After configured retry limits or a non-retryable validation/security failure, delivery is quarantined in a dead-letter queue (DLQ) with a reason code and protected diagnostic metadata. Poison events MUST NOT loop indefinitely.

Redrive is a privileged, audited operation. Before redrive, the operator/runtime must verify the consumer version, contract compatibility, authorization, consent, retention eligibility, and whether the event is still actionable. Redrive preserves the original event identity and occurrence time while recording a distinct delivery/replay attempt. It MUST NOT bypass revoked consent, current policy, or safety controls.

## 5. Publish and subscribe security

- Authenticate publishers and subscribers; authorize each event type, topic, tenant, and operation.
- Derive producer identity from the authenticated runtime context. Reject producer spoofing.
- Validate envelope and payload against registered, versioned schemas; enforce size, depth, field, rate, and quota limits.
- Treat all event payloads, including provider-originated events, as untrusted input.
- Authenticate transport and protect stored records; use signatures where trust boundaries or offline verification require them.
- Do not place credentials, access tokens, or unnecessary raw sensor/audio/video content in event payloads.
- Apply classification, purpose limitation, consent, retention, deletion, and provider-disclosure rules before publish, delivery, storage, and replay.
- Consumers MUST re-check current Security Manager policy and authority before any consequential side effect. A historical event or replay token is not an authorization grant.
- Event data cannot modify system policy, grant permissions, elevate autonomy, or override server-owned instructions.

Audit/security events may use a separately protected durable delivery lane with tighter access and integrity controls. This does not justify retaining unlimited raw payloads; minimize content and retain only governed evidence.

## 6. Cancellation, expiry, and replay

Cancellation is a delivery/workflow signal, not a time machine. It can stop queued or cancellable work; it cannot reverse an already completed irreversible effect. Consumers must report the actual completion state and support compensation/reconciliation where available.

Events may carry a TTL or expiry time. Expired events are not delivered as actionable work unless an explicitly authorized, policy-compliant historical analysis path permits their use.

Replay is disabled by default for ordinary subscribers and must be scoped, bounded, authorized, rate-limited, and audited. Replay metadata identifies the replay operation and initiating authority while preserving original event time and identity. Replay must re-evaluate current privacy, consent, retention, and security policy; it cannot revive deleted data or bypass revocation.

## 7. Contract registry and compatibility

Event types are namespaced and registered with an owner, schema, `contract_version`, classification, retention policy, allowed publishers, allowed subscribers, and compatibility rules.

The envelope's `schema_version`, event `contract_version`, and producing module's implementation `version` are distinct. Unknown or incompatible versions fail closed for consequential processing. Compatibility adapters must be explicit, versioned, tested, and observable. Breaking changes require a new major contract version; consumers must not silently reinterpret fields.

## 8. Android and cross-platform operation

Android local queues and delivery workers must respect OS background execution, battery, network, and permission constraints. Work is scheduled through permitted foreground, expedited, or deferred mechanisms as appropriate; the design does not assume a perpetual background process.

Sensor-originated events require explicit capture state, least-privilege permissions, data minimization, and visible user controls. The Event Bus does not create an always-on microphone, camera, or location listener. Synchronization occurs when platform policy and connectivity allow it, with bounded local storage and expiry.

The same logical contracts apply across Android, web, Windows, Linux, and macOS; transport adapters may differ by platform.

## 9. Observability and verification

Record publish and delivery outcomes, latency, queue depth, retry counts, consumer lag, DLQ volume, schema failures, authorization denials, replay, and cancellation. Logs must avoid leaking secrets or unnecessary personal data. Correlation IDs link events to tasks and audit records without becoming authority tokens.

Required tests include:
- duplicate delivery and idempotent consumer behavior;
- per-key ordering and absence of assumed global ordering;
- outbox crash/restart and inbox deduplication;
- acknowledgment only after durable processing;
- retry backoff, jitter, exhaustion, poison-event quarantine, and DLQ redrive;
- consumer outage, backpressure, quotas, and isolation;
- authorization denial, producer spoofing, malformed/oversized payloads, and unknown contract versions;
- consent revocation, deletion/retention, TTL, and replay restrictions;
- cancellation before and after irreversible completion;
- Android process death, deferred sync, and background restrictions.

## 10. Integration sequence

The intended request/event flow is: authenticated producer -> schema and policy validation -> durable outbox -> broker/transport adapter -> authorized subscription -> durable inbox/deduplication -> consumer policy re-check -> consumer action -> delivery result and audit evidence.

The first implementation should be introduced behind the existing API Gateway/Worker using the Strangler Pattern. It must not replace the current chat UI, history, or storage keys as part of this architecture-only change.

**Implementation status:** no broker, outbox/inbox, runtime dispatcher, DLQ, replay engine, Android queue, or automated tests are created by this document. These remain implementation and verification work. No production configuration or deployment is changed.
