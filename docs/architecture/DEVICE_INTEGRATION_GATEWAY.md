# Device Integration Gateway

**Status:** Architecture specification; not an implementation claim.  
**Contract baseline:** v1  
**Platform priority:** Android-first, cross-platform by capability.

## 1. Purpose

The Device Integration Gateway (DIG) is the controlled boundary between Sofia Core and external devices, operating systems, companion applications and device services. It provides one consistent interface for device discovery, pairing, capability negotiation, command dispatch, event delivery and connection health without assuming that every device exposes the same APIs or permissions.

The gateway separates physical device identity, software adapter, device capability and authorization grant. Pairing or discovery does not imply trust or permission. The gateway does not bypass OS security, vendor restrictions, account authorization or user consent.

## 2. Architectural boundaries

The gateway coordinates with Device Manager, Module Registry and Module Lifecycle Manager, Identity & Authentication Manager, Security Manager, Capability Registry, Task Orchestrator, Resource & Runtime Manager, and Audit & Observability Manager.

The gateway transports and normalizes requests. It does not independently decide that a requested action is safe or authorized.

## 3. Supported device families

The architecture is designed to accommodate, when a supported API/protocol and permission path exists: Android and other smartphones/tablets; Windows, Linux and macOS computers; smartwatches and fitness bands; headphones, microphones and speakers; smart glasses and wearable displays; cameras; televisions and monitors; vehicles and approved automotive interfaces; smart-home hubs, lights, locks, sensors and appliances; and future device classes through versioned adapters.

This is an extensibility target, not a claim that every brand, model or feature is currently supported. Each adapter must declare tested models, firmware/OS ranges, transport, permissions, limitations and supported capabilities.

## 4. Adapter model

Adapters are independently versioned modules with verified provenance, manifest, declared capabilities, dependency set, sandbox profile and resource budget. They pass through the Module Lifecycle Manager before production use.

Each adapter must discover only through approved mechanisms; identify devices and protocols without unnecessary collection; authenticate pairing/session establishment; report capabilities and limitations; translate normalized requests; normalize events and errors; enforce timeouts, cancellation and bounded retries; and release resources and credentials on disconnect/revocation.

Unsupported operations return a structured unsupported or permission_required result. Adapters must not silently fall back to unsafe transports or broader permissions.

## 5. Discovery, pairing and trust

Discovery is opt-in or constrained to an explicitly configured scope. Use platform-supported mechanisms such as Android Bluetooth APIs, local network discovery where permitted, USB, companion-app handoff, vendor APIs or authenticated cloud services.

Pairing binds device identity, owner/account context, adapter identity and session credentials. Show the device identity and requested access before granting sensitive capabilities. A reported device name is display metadata, not proof of identity.

Trust states include discovered, pairing, paired_untrusted, trusted_limited, suspended, revoked and disconnected. Reconnection revalidates credentials and grants. Lost, reset, sold or compromised devices must be revocable.

## 6. Capability negotiation and least privilege

Capabilities are negotiated per device instance and adapter version. Each capability identifies its contract and input/output schemas, permissions, risk tier, read-only/action nature, device/firmware compatibility, latency, bandwidth, power, availability and privacy characteristics.

Grant only the minimum capability required for the current task. Sensor access is purpose-bound and time-limited. Camera, microphone, location, health-related signals, vehicle controls, locks and other sensitive operations require stronger policy controls and visible consent. High-impact actions require fresh approval and, where appropriate, step-up authentication.

## 7. Command and event pipeline

Every command carries correlation ID, requesting principal, task ID, device ID, adapter ID/version, capability ID/version, deadline, idempotency key and authorization-context reference.

Before dispatch, resolve trusted device and adapter records; verify lifecycle and artifact identity; verify device trust/session; check capability compatibility and current grants; request a fresh Security Manager decision; reserve resources and apply rate limits; then dispatch only through the adapter contract.

Responses and events are normalized, schema-validated and tagged with provenance and timestamps. Reject malformed, replayed, stale or out-of-scope messages. Device events are untrusted input and never privileged instructions.

## 8. Android-first behavior

Android is the primary mobile target. Use supported Android APIs and respect runtime permissions, Bluetooth/nearby-device permission models, scoped storage, background execution limits, foreground-service requirements, battery optimization, Doze, thermal limits and OEM variation.

Do not rely on hidden APIs, accessibility-service abuse, silent permission grants or continuous sensor collection without an explicit supported user-facing purpose. Background connectivity must use OS-approved scheduling and foreground execution only when justified and disclosed. Capability discovery must reflect Android versions and manufacturer behavior actually tested.

Desktop platforms may offer additional integration paths, but only through separately authenticated and permissioned adapters. The core gateway contract remains platform-neutral.

## 9. Privacy and data minimization

Collect only data needed for the active task. Prefer on-device processing for sensitive streams when feasible. Expose sensor-active state to the user and provide immediate stop controls. Define retention, deletion and export behavior for device-derived data. Do not persist raw microphone, camera, biometric or location streams by default.

Health, biometric, location, camera and microphone data require separate classification and policy treatment. A connected device does not authorize broad access to all data it can produce.

## 10. Reliability and lifecycle

Each connection has explicit states, heartbeat policy, timeout, retry budget and reconnect backoff. Avoid retry storms and duplicate action dispatch. Side-effecting commands require idempotency support or reconciliation before retry.

When a device disconnects, adapter is suspended, permission is revoked or policy changes: stop new dispatch; cancel or safely terminate in-flight work; invalidate session tokens as appropriate; release resource reservations; and preserve a diagnostic event without sensitive payloads.

The gateway must report uncertainty. It must not claim an action succeeded merely because a command was sent; require device acknowledgment or independent state verification when supported.

## 11. Safety boundaries

Device commands are risk-tiered. Read-only queries are distinct from state-changing actions. Actions affecting physical safety, security, money, access control or vehicle operation require dedicated capability contracts, strong authorization, explicit confirmation and device-side safeguards. A general language model cannot directly invoke raw device APIs.

Emergency stop and permission revocation must be available independently of model-generated plans. A compromised adapter must be isolatable without disabling unrelated trusted devices.

## 12. Acceptance criteria

- Discovery and pairing never imply trust or permission.
- Only validated adapters access production device capabilities.
- Every dispatch is authorized against current device trust and scoped grants.
- Unsupported operations fail explicitly without unsafe fallback.
- Device messages are schema-validated and treated as untrusted input.
- Side-effecting retries are idempotent or reconciled before repetition.
- Revocation/disconnect blocks new dispatch and safely handles in-flight work.
- Sensor collection is purpose-bound, visible and stoppable.
- Android behavior respects supported APIs and OS restrictions.
- Device and adapter compatibility is evidence-based and testable.
- Commands, approvals, errors and state changes are auditable without sensitive payloads.

**Implementation note:** this document specifies the target architecture. It does not claim that adapters for all listed device families or a functioning gateway have already been implemented.
