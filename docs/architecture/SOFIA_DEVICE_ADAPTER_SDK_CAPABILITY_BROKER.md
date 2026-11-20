# Sofia Device Adapter SDK & Capability Broker — Architecture Specification v1

## Status and boundary

Architecture specification only. This document defines contracts and responsibilities; it does not implement adapters, a runtime broker, Bluetooth/Wi-Fi/Matter transports, Android services, device discovery, pairing, cryptographic verification, sandboxing, or hardware control. It does not change `main`, the production chat, Cloudflare settings, secrets, deployment, or existing contracts.

## 1. Purpose

The Device Adapter SDK defines one stable integration surface for device manufacturers, platform integrations and approved third-party modules. The Device Capability Broker is the sole mediation layer between Sofia's authorized execution path and device adapters.

The design supports Android-first delivery while preserving cross-platform contracts for phones/tablets, watches, fitness bands, glasses, headphones, cameras/sensors, displays, computers, vehicles, smart-home devices and future compatible endpoints.

The SDK standardizes how an adapter declares capabilities, validates inputs, receives a narrowly scoped invocation, reports health and returns normalized results. The broker resolves the exact device/adapter/capability route and enforces the authorization context before dispatch.

## 2. Authority boundaries

The control path is:

Sofia Core → TPOE → Execution Supervisor (ES) → Device Capability Broker (DCB) → SDM route resolution → approved adapter runtime → transport/platform API → device.

Before dispatch, the broker must consume current evidence and decisions from:
- IAM: authenticated owner/session context;
- DTM: device trust assessment and credential status;
- SDM: canonical device record, lifecycle, connection and platform constraints;
- CPR: active grant bound to principal, module, capability, operations, device/target and data scope;
- DGLM: purpose, data classification, retention and external data-egress constraints;
- SSM: action-specific ALLOW and any step-up/owner approval;
- RBM: resource reservation under FREE_ONLY policy;
- ES: verified module identity, isolation, invocation deadline, cancellation and result validation.

The broker is not an alternate invocation path and cannot be called directly by a model or UI. An adapter cannot call another adapter, grant itself permissions, change device trust, alter registry lifecycle, or invoke external services outside its manifest and brokered capabilities.

## 3. SDK surface and adapter lifecycle

Each adapter implements a versioned interface with the following logical operations:

- `describe()`: return immutable adapter identity, SDK/API compatibility, supported platforms/transports, declared device classes and capability references.
- `validateConfiguration()`: validate non-secret adapter configuration and report required platform prerequisites.
- `discover()`: optional, bounded discovery returning untrusted candidate observations only; discovery never pairs or registers a device.
- `connect()` / `disconnect()`: establish or close an authorized transport session using opaque credential handles supplied by the approved platform broker.
- `getCapabilities(deviceRef)`: return the adapter's effective supported capability declarations for one registered device; declarations are not grants.
- `invoke(invocation)`: execute exactly one broker-authorized capability operation and return a typed result.
- `getHealth()`: report adapter process/transport health with timestamp and freshness.
- `cancel(invocationId)`: best-effort cancellation where the operation supports it.
- `reconcile(invocationId)`: report known outcome for a previously dispatched operation whose result was lost or timed out.
- `shutdown()`: stop accepting work, release resources and close sessions within a bounded grace period.

An adapter manifest is immutable per release and binds module ID/version, publisher, artifact digest/signature, SDK contract version, platform/runtime, transports, device classes, capability declarations, permissions, data classes, resource limits, network egress and cancellation/reconciliation support. A manifest is a declaration, never an approval.

Lifecycle: DISCOVERED → QUARANTINED → VALIDATING → REVIEW_REQUIRED → APPROVED → ACTIVE → SUSPENDED/REVOKED → RETIRED. Only trusted installation and registry services may transition lifecycle state. New artifact digest, SDK major version, expanded permission, new capability or broader egress requires re-review.

## 4. Canonical capability model

A capability is a Sofia-owned, versioned contract with:
- stable capability ID and contract version;
- operation names and strict input/output schemas;
- supported target types;
- minimum risk tier and permitted data classes;
- sensor access and physical-side-effect flags;
- idempotency, timeout, cancellation and reconciliation semantics;
- required platform permissions and device trust use class;
- data-egress and resource profile.

Adapter declarations must be a subset of the Sofia-owned capability definition. Unknown operations, extra fields, unsupported versions or undeclared targets are rejected. Adapter metadata cannot lower the risk tier, expand data classes or redefine the operation's semantics.

## 5. Device Capability Broker responsibilities

DCB is a policy-enforcing reference monitor at the adapter boundary. For each invocation it must:

1. Accept requests only from ES over an authenticated, integrity-protected interface.
2. Validate the invocation schema, deadline, correlation and idempotency key.
3. Resolve exact adapter ID/version/artifact digest and device registry reference.
4. Confirm adapter is ACTIVE, compatible, healthy enough and permitted on the current platform.
5. Resolve exact capability definition and ensure the adapter's declaration is compatible.
6. Verify current IAM session, DTM trust scope/freshness, SDM lifecycle/connection state and CPR grant.
7. Verify grant scope includes the exact device, operation, target, data classes, module/version and risk ceiling.
8. Require current SSM ALLOW, action-bound consent/approval where required, and valid DGLM decision.
9. Confirm RBM reservation and FREE_ONLY policy; unknown or paid routes are blocked unless separately authorized under policy.
10. Validate operation input against the capability schema and canonicalize/hash parameters.
11. Revalidate authorization, expiry, device trust, safety interlocks and connection immediately before an external side effect.
12. Dispatch only the bounded invocation to the isolated adapter; never pass unrestricted secrets or general-purpose credentials.
13. Normalize, validate and provenance-tag the result; record minimal audit metadata.
14. Release reservations and sessions on completion, cancellation, failure or timeout.

Any missing, stale, contradictory or unverifiable gate fails closed. The broker must not infer authorization from a paired device, a trusted adapter, an owner-visible consent screen, or a successful connection.

## 6. Invocation envelope and adapter result

An invocation binds:
- invocation/request/task/correlation IDs and idempotency key;
- authenticated principal/session reference;
- exact device, adapter ID/version and artifact digest;
- capability ID/version and operation;
- canonical target and input reference/digest;
- grant, authority-envelope, Security Manager decision, approval and resource-reservation references;
- risk tier, data classification, deadline and cancellation semantics.

The adapter receives only the minimum fields required for the operation. Sensitive input is passed by short-lived opaque reference through a brokered channel, not embedded in prompts or ordinary logs.

Results use typed status and schema references, with optional payload reference/digest, device observation reference, timestamps, adapter identity and error code. A result is untrusted until schema, invocation binding, adapter provenance and correlation are checked by the broker/ES.

## 7. Isolation, secrets and transport security

- Run adapters in the least-privileged runtime available: Android service/API boundary, isolated process, WASM or container where supported.
- Network, filesystem, sensors, credentials and device APIs are denied by default and brokered explicitly.
- Do not expose raw OAuth tokens, pairing secrets, private keys or keystore contents to adapter code unless a narrowly defined platform API requires a protected opaque handle.
- Prefer OS-protected keystores, non-exportable keys, authenticated encrypted transport and platform-native pairing.
- Enforce endpoint allowlists, TLS/certificate validation where applicable, request binding, replay protection, rate/concurrency quotas and bounded message sizes.
- Treat device responses, vendor cloud content, BLE advertisements, QR codes, discovery metadata and adapter logs as untrusted data.
- Never let an adapter update its own digest, trust, grant, manifest or audit history.

## 8. Reliability and side-effect semantics

Every capability definition declares whether an operation is read-only, idempotent, retryable, cancellable or externally consequential. Adapter implementations must match those semantics.

- Enforce per-invocation deadlines and bounded retries.
- A timeout after dispatch is `OUTCOME_UNKNOWN` unless the adapter can prove no side effect occurred.
- Never blindly retry a non-idempotent operation; call `reconcile()` or require owner intervention.
- Cancellation is best-effort after dispatch and must not be represented as rollback.
- Circuit breakers and health checks affect route eligibility but never grant authority.
- Adapter failover is permitted only if the alternate adapter is independently approved and preserves exact target, capability semantics, data scope, security policy and budget. No silent privilege expansion or paid fallback.
- Device state and safety interlocks are rechecked immediately before physical side effects.

## 9. Android-first implementation constraints

Android is the first implementation target. SDK adapters must use supported Android APIs and runtime permissions, respect Bluetooth/nearby-device permission differences, scoped storage, foreground-service and background-execution limits, battery optimization, thermal and memory pressure, and platform lifecycle.

A foreground service or persistent background monitor is not assumed to be available. The adapter reports required permissions and unsupported features before activation. Platform permission denial is a hard capability limitation, not something Sofia may bypass.

The same logical SDK contracts should later map to iOS, Windows, Linux, macOS, vehicle and smart-home adapters. Capability availability remains platform- and model-specific; no universal compatibility claim is implied.

## 10. Privacy and data minimization

- Request only the minimum sensor/device data needed for the current task.
- Sensor access is purpose-bound and separately granted; no ambient recording by default.
- Keep raw audio/video and sensitive sensor payloads out of ordinary logs and audit events.
- External data egress requires explicit DGLM evaluation and matching owner authorization; device pairing does not authorize cloud processing.
- PAOM governs where private results may be displayed or spoken.
- Retention, deletion and export follow DGLM, including derived caches and vendor-side data where controllable.
- Adapter health telemetry is minimized and does not include content.

## 11. Observability and audit

Record adapter ID/version/digest, device reference, capability/operation, invocation and correlation IDs, grant/SSM/RBM/DTM references, decision/reason code, timestamps, normalized outcome, resource use and integrity metadata. Do not record secrets, full command payloads, private media or unnecessary location history.

Metrics include availability, latency, timeout/error rates, reconciliation outcomes, resource consumption, contract failures, denied invocations, policy violations and platform-specific capability availability. Trust, health and authorization remain separate dimensions.

## 12. Acceptance tests

1. A model/UI cannot invoke an adapter except through ES and DCB.
2. An unapproved, quarantined, suspended or revoked adapter cannot run.
3. Artifact digest or signature mismatch blocks activation.
4. Unsupported SDK/capability contract versions are rejected.
5. Manifest declaration does not create a capability grant.
6. A grant for one device, target or operation cannot be used for another.
7. Expired/revoked IAM, DTM, CPR, SSM or RBM evidence blocks dispatch.
8. A paired or trusted device without a grant cannot be controlled.
9. Adapter cannot raise risk, widen data classes or access unrequested permissions.
10. Input schema violations and unknown fields are rejected before dispatch.
11. External side effects trigger immediate authorization and safety revalidation.
12. Timeout after dispatch returns OUTCOME_UNKNOWN unless non-execution is proven.
13. Non-idempotent commands are not blindly retried.
14. Cancellation is reported as best-effort and is not described as rollback.
15. Adapter failover preserves exact security scope and FREE_ONLY budget.
16. Android permission denial/background restrictions are reported without bypass.
17. Secrets, raw media and private sensor payloads do not appear in logs.
18. Adapter response with wrong invocation/device/correlation binding is rejected.
19. Revocation prevents queued invocations and invalidates sessions as applicable.
20. Health degradation may remove a route but cannot grant additional authority.

## 13. Implementation sequence

1. Freeze SDK interfaces and schemas; build conformance fixtures.
2. Implement a local mock adapter and deterministic broker with no hardware access.
3. Add schema, authorization, isolation, idempotency and failure-injection tests.
4. Add Android adapter host and platform permission disclosure.
5. Implement one low-risk read-only adapter capability end-to-end.
6. Add privacy review, security assessment and audit instrumentation.
7. Add additional device classes/transports one at a time after conformance testing.

No real device control should be enabled until the broker, authorization gates, isolation and recovery semantics are implemented and independently tested.
