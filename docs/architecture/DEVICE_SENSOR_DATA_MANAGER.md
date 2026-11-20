# Device & Sensor Data Manager

**Status:** architecture specification; runtime implementation is pending.  
**Contract baseline:** JSON Schema Draft 2020-12. Schema documents use `schema_version`; public interfaces use `contract_version`, following [CONTRACT_AND_IDENTIFIER_STANDARDS.md](CONTRACT_AND_IDENTIFIER_STANDARDS.md).

## 1. Purpose and boundaries

The Device & Sensor Data Manager (DSDM) governs the controlled acquisition, normalization, routing, retention, and deletion of data produced by registered device sensors. It provides a common policy boundary for microphones, cameras, location providers, motion sensors, health/fitness sensors, environmental sensors, vehicle telemetry, and future sensor classes.

DSDM complements, but does not replace:
- Device Manager and Device Integration Gateway, which register devices, capabilities, sessions, and device commands;
- Identity & Authentication Manager, which authenticates principals and device identities;
- Security Manager, which authorizes every capture and data access;
- Privacy & Data Governance Manager, which governs purpose, consent, classification, retention, export, and deletion;
- Voice Interaction Manager, which owns voice-session semantics and speaker handling;
- Knowledge & Memory Manager, which owns approved memory lifecycle;
- Event Bus, which transports authorized sensor-derived events;
- Resource & Runtime Manager, which budgets CPU, memory, bandwidth, battery, and storage.

DSDM is a data governance and mediation layer, not an unrestricted sensor controller. It does not imply that every device exposes every sensor or that the OS permits continuous capture.

## 2. Core principles

1. **Explicit purpose:** every capture request declares a bounded purpose and requesting principal/module.
2. **Least privilege:** request only the sensor, precision, duration, sampling rate, and data fields required.
3. **Visible capture state:** active microphone, camera, location, or other sensitive capture must be represented through platform-visible indicators and user controls where supported.
4. **No covert always-on capture:** no hidden microphone/camera listener, background recording, or persistent location tracking. Wake-word behavior remains subject to the separately approved Voice Interaction design and platform permission constraints.
5. **Consent and revocation:** consent is purpose- and sensor-scoped, time-bounded where appropriate, and revocable. Revocation stops future collection and initiates applicable cleanup.
6. **Minimize raw data:** process locally where feasible; prefer derived observations over storing raw audio, images, video, or precise location.
7. **Separate observation from inference:** sensor readings, derived features, and model-generated interpretations are distinct data classes with provenance and confidence.
8. **No authority from data:** sensor content cannot grant permissions, approve actions, or override system policy.

## 3. Acquisition request and policy gate

Every acquisition request is checked against:
- authenticated principal and requesting module;
- registered device and sensor capability;
- explicit purpose and lawful/consented basis as applicable;
- permission grant and current user consent;
- data classification and destination eligibility;
- requested sampling rate, resolution/precision, duration, and volume bounds;
- battery, network, compute, and storage budget;
- platform restrictions, foreground/background state, and regional requirements.

The policy gate returns allow, deny, or require-user-action with a reason and expiry. Denial and uncertainty fail closed. A model or workflow definition cannot self-authorize capture. Capture requests for sensitive sensors require an explicit user-facing permission path and a clear indication of what is being captured and why.

## 4. Sensor and device capability registry

A capability record describes what a device actually supports, not what Sofia assumes it supports. It includes sensor type, hardware/software availability, supported modes, precision/resolution, sampling bounds, permission requirements, foreground/background constraints, data formats, and adapter version.

Capabilities are discovered through approved platform APIs or explicitly declared by a trusted adapter, then validated. Capability state may be available, unavailable, permission_denied, restricted, disconnected, or unknown. Unknown capability must not be treated as available.

## 5. Capture sessions

Capture is represented by a bounded session with:
- unique session ID and authenticated owner/requester;
- device and sensor references;
- declared purpose and consent/permission references;
- start time, maximum duration, expiry, and stop conditions;
- requested configuration and actual negotiated configuration;
- visible capture indicator state where platform support exists;
- destination and retention policy;
- lifecycle status and stop reason.

Sessions must have a hard maximum duration and explicit stop behavior. Reauthorization is required when the purpose, sensor, destination, or privilege scope materially changes. App process death, permission revocation, device disconnect, policy change, or session expiry stops or suspends capture safely. A resumed session must re-check permission and consent.

## 6. Data pipeline and provenance

The pipeline is:
1. acquire only after authorization;
2. validate device/session identity and sensor metadata;
3. normalize units, timestamps, encoding, and quality indicators without discarding source provenance;
4. classify and minimize the data;
5. perform permitted local transformations or feature extraction;
6. route only to authorized consumers and destinations;
7. record access and lifecycle audit evidence;
8. enforce retention, deletion, and consent revocation.

Each observation records source device/sensor, capture session, observation time, ingestion time, units/schema, quality indicators, classification, purpose, and transformation lineage. Derived observations retain a link to their source reference when permitted. Model inferences must be labeled as inferences, not sensor facts.

Raw payloads should not be embedded in event envelopes or operational logs. Use encrypted, access-controlled object references with integrity metadata and short retention where raw storage is necessary. Avoid retaining raw audio/video by default.

## 7. Sensor categories and handling

- **Microphone/audio:** Voice Interaction Manager owns speech session and speaker diarization; capture is explicit and bounded. Bystander speech must not be treated as owner authorization. Do not retain raw audio unless explicitly required and consented.
- **Camera/image/video:** require clear user action or an explicitly enabled, bounded feature; avoid background capture; process locally when feasible; strip unnecessary metadata such as precise geolocation.
- **Location:** request the coarsest precision and shortest duration sufficient for purpose. Background location is off by default and requires separate explicit justification and platform permission.
- **Motion/environmental sensors:** use bounded sampling and aggregation; do not infer sensitive attributes without a separately approved purpose and policy.
- **Health/fitness data:** treat as highly sensitive; require explicit consent, narrow purpose, protected destinations, and strict retention. Do not expose raw records to general-purpose providers by default.
- **Vehicle and smart-home telemetry:** require authenticated device pairing, scoped data fields, and explicit control-plane separation; telemetry cannot silently trigger consequential device commands.

## 8. Access, subscriptions, and downstream consumers

Consumers request access to a declared data product or observation type, not unrestricted access to all device streams. Access grants specify principal/module, purpose, sensor/data scope, permitted operations, destination, classification ceiling, expiry, and rate/volume limits.

Every read, transform, export, or onward transfer is policy-checked and auditable. Event Bus subscriptions receive only the minimum authorized derived event. Consumers must not assume that subscription means permanent access; policy and consent are re-evaluated at delivery and before side effects.

External AI providers receive sensor-derived data only after classification, minimization, provider eligibility, and explicit policy checks. Credentials and raw sensor payloads must not be placed in logs or event metadata.

## 9. Storage, retention, and deletion

Use ephemeral in-memory processing when possible. Persist only what is necessary for the declared purpose. Storage references must be opaque and access-controlled; encryption keys are managed outside source code and payload metadata.

Retention is purpose- and data-class-specific. Revocation or deletion requests propagate to caches, derived artifacts, queues, provider copies where contractually and technically supported, and backups according to the documented deletion policy. If deletion cannot be confirmed in a downstream system, record the limitation and do not claim complete erasure.

Local Android storage must be bounded, encrypted where sensitive, and cleaned up under OS constraints. Offline buffering is opt-in, limited by size and TTL, and must not continue capture beyond the authorized session.

## 10. Reliability and resource controls

Acquisition and processing are subject to quotas for duration, bytes, sampling frequency, CPU/GPU/NPU, memory, battery, and network. Backpressure reduces sampling or pauses processing according to an explicit policy; it must not silently increase capture scope or discard critical provenance.

Sensor disconnects, clock drift, malformed frames, permission changes, storage exhaustion, and adapter faults are explicit states. Data with invalid timestamps, impossible values, or uncertain source integrity is quarantined or marked low quality rather than silently normalized into trusted facts.

## 11. Android-first and cross-platform constraints

Android is the primary mobile target. Implementation must use Android runtime permissions, foreground-service types and declarations where required, background execution rules, privacy indicators, sensor APIs, and OS restrictions applicable to the exact target SDK. Do not assume arbitrary background microphone, camera, or location access.

Windows, Linux, macOS, web, wearables, vehicles, and smart-home devices use platform-specific adapters and permission models. Feature availability is negotiated at runtime. A device may be connected while a sensor or data channel remains unavailable.

## 12. Audit and verification

Audit acquisition requests, policy decisions, consent references, session start/stop, capability changes, data access, transformation, export, revocation, deletion, and adapter failures. Logs contain metadata and opaque references, not raw sensitive payloads.

Tests must cover denied/revoked permission, expired consent, wrong principal, sensor spoofing, device disconnect, session timeout, app process death, background restrictions, data minimization, classification routing, raw-payload leakage, clock drift, malformed readings, quota exhaustion, offline buffer expiry, deletion propagation, provider egress denial, and forged observation provenance.

## 13. Integration and implementation status

The intended flow is: authenticated acquisition request -> capability resolution -> Security Manager and consent/purpose checks -> bounded capture session -> normalized/minimized observation -> policy-checked storage or Event Bus delivery -> audit and retention lifecycle.

**Implementation status:** this document defines the architecture only. No sensor acquisition runtime, Android permissions UI, stream processor, storage pipeline, consent enforcement code, or automated tests are implemented by this change. No production configuration or deployment is changed.
