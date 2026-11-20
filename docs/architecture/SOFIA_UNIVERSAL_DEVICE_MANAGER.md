# Sofia Universal Device Manager — Architecture Specification v1

## Status and boundary

Accepted architecture specification only. It does not implement discovery, pairing, device control, sensors, Bluetooth/Wi-Fi integrations, Android services, or device telemetry collection. No changes to `main`, production, deployment, Cloudflare configuration, secrets, existing chat behavior, or existing contracts are included.

## 1. Purpose

Sofia Device Manager (SDM) provides a provider- and transport-independent control plane for the owner's connected, wearable, mobile, computing, automotive, and smart-environment devices. It maintains device identity references, declared capabilities, pairing and trust state, connection/health observations, platform constraints, and adapter routing.

The device universe is intentionally broad: smartphones and tablets; smart watches and fitness bands; glasses and headphones; microphones, cameras and other sensors; displays and TVs; computers; vehicle and in-car systems; smart-home hubs, locks, lights, climate and safety devices; and future compatible devices.

A device being discoverable, nearby, paired, registered, online, or owned does not by itself authorize an operation.

## 2. Architectural position and authority

SDM is a registry and device-lifecycle manager, not an identity provider, permission issuer, policy bypass, model tool, or direct command executor.

Protected control flow:

1. Sofia Core accepts and clarifies the task.
2. Task Planning & Orchestration Engine creates a bounded plan.
3. Capability/Module Registry resolves the relevant module and declared device capability.
4. Identity & Authentication Manager verifies the owner session; Device Trust evidence independently establishes the target device's trust state.
5. Capability Permission Registry resolves an explicit narrow grant.
6. Data Governance & Lifecycle Manager evaluates purpose, classification, retention and egress.
7. Security Manager evaluates the exact action, target, risk, authority envelope, consent and approvals.
8. Resource & Budget Manager reserves permitted resources under the owner's FREE_ONLY default.
9. Execution Supervisor is the only supported invocation boundary.
10. SDM selects a registered adapter; the adapter communicates with the device and returns a normalized result.
11. Audit & Observability records minimal decision and outcome metadata.

Models, plans, device advertisements, QR codes, vendor descriptions, OCR, transcripts and device-returned text are untrusted data. They cannot create grants, raise trust, change policy, or approve actions. SDM must not provide a direct model-to-device command path.

## 3. Separation of device concepts

Keep these concepts distinct:

- **Device identity:** stable registry reference and available cryptographic identity evidence.
- **Owner identity/session:** verified separately by IAM.
- **Pairing/association:** owner-authorized association between an account and a device.
- **Device trust:** current assessment of identity proof, key status, platform posture and revocation.
- **Capability declaration:** what a device or adapter claims it can do.
- **Capability grant:** explicit authorization for a principal/module/operation/target scope; declarations and pairing are never grants.
- **Connection state:** current transport reachability.
- **Health state:** freshness and operational condition.
- **Privacy state:** whether a particular input/output route is plausibly private; never inferred from pairing alone.

A paired device is not automatically trusted for every operation. A trusted device is not automatically granted every capability. A healthy device is not necessarily safe or private.

## 4. Device registry and lifecycle

The registry stores a canonical device reference, owner/account scope, device class, manufacturer/model identifiers when available, platform and OS version, adapter/protocol references, supported contract versions, capability declaration references, pairing method, key/credential handles, trust assessment reference, connection/health observations, privacy characteristics, resource constraints and lifecycle state.

Lifecycle states:

- `DISCOVERED`: observed but not associated.
- `PAIRING_PENDING`: owner-authorized pairing flow started.
- `PAIRED_UNVERIFIED`: association exists but required proof is incomplete.
- `REGISTERED`: identity and registry metadata validated; this is not a blanket trust or permission grant.
- `TRUSTED`: current Device Trust Manager assessment meets policy for defined uses.
- `DEGRADED`: device remains registered but evidence, health or connectivity is impaired.
- `SUSPENDED`: operations blocked pending review or recovery.
- `REVOKED`: association/key/grants invalidated.
- `RETIRED`: intentionally removed from active use.

State transitions require authenticated, auditable events. Lost/stolen device handling must support immediate suspension/revocation, credential rotation where possible, and review of grants and active sessions. Re-pairing must not silently restore previous privileges.

## 5. Discovery, pairing and identity proof

Discovery is an observation, never an authorization event. Do not trust names, MAC addresses, serial strings, BLE advertisements, network presence, vendor metadata or proximity as proof of identity.

Pairing requirements:

- Initiate pairing only in an authenticated owner session and for a clearly identified target.
- Show the device class/name and requested access before association.
- Use cryptographic challenge-response or platform/vendor secure pairing where supported; bind the resulting public-key or credential reference to the registry record.
- Verify out-of-band comparison/confirmation where the protocol requires it.
- Require explicit owner confirmation for sensitive sensors, vehicle systems, locks, alarms, cameras, microphones and other consequential devices.
- Record proof method, assurance, timestamp, expiry and provenance. Unsupported proof remains unknown; do not invent attestation.
- Keep secrets in a protected platform keystore/vault; store opaque handles, never raw secrets in prompts, logs or ordinary local storage.
- Support unpair, revoke, key rotation and recovery. Revocation must invalidate dependent grants and sessions according to policy.

## 6. Capability model and adapter boundary

Device capability declarations are descriptive, versioned and non-authoritative. Examples include `audio.output`, `audio.input`, `display.render`, `camera.capture`, `sensor.read`, `notification.read`, `media.playback`, `vehicle.status.read`, `vehicle.control`, `home.lock.control`, and `climate.setpoint.write`. These identifiers are illustrative; each capability needs a contract, risk classification, data class, resource profile and explicit operation semantics before implementation.

Adapters translate canonical SDM operations to platform/vendor protocols and normalize results. Transport-specific behavior belongs behind adapters, including Bluetooth LE, Wi-Fi/LAN, USB, Android/iOS/desktop APIs, Matter and vendor services. Listing a transport here does not assert current support or compatibility.

Adapters must:
- declare exact capabilities, operations, target types, platform requirements and contract versions;
- expose permission requirements and limitations;
- authenticate/encrypt remote sessions where supported;
- enforce freshness, replay protection and request binding;
- reject unknown operations and unsupported contract versions;
- never widen a grant or silently substitute a more privileged route;
- return typed results and explicit uncertainty;
- avoid logging content, credentials, raw ambient media or unnecessary telemetry.

## 7. Authorization and physical side effects

Every protected operation is a canonical action with principal/session, task, module, capability, operation, exact device/target, parameters digest, data classification, risk, authority envelope, grant, consent/approval and resource reservation references.

Examples of consequential physical effects include unlocking doors, opening gates, disabling alarms, controlling a vehicle, changing heating/cooling, switching power, moving machinery, activating cameras or microphones, and exposing live sensor streams.

- Risk classification comes from trusted policy and capability metadata, not solely model estimates.
- R3 or otherwise high-impact actions require strong step-up and action-bound owner confirmation, unless policy denies them outright.
- Confirmation is bound to exact device, operation, target, parameter digest, time limit and task. A confirmation for one command is not blanket consent for later commands.
- Apply manufacturer, OS, local safety interlocks and device-native restrictions. Sofia must not bypass them.
- Fail closed when identity, trust, grant, device state, sensor evidence, parameter validation or safety state is missing, stale, conflicting or unverifiable.
- Device telemetry or a model's claim that an action is safe cannot replace an independent safety interlock.

## 8. Command lifecycle and reliability

Every command has a unique command ID, idempotency key where supported, canonical action digest, target device reference, creation/expiry times, authorization references and normalized outcome.

States: `accepted`, `queued`, `sent`, `acknowledged`, `completed`, `failed`, `timed_out`, `outcome_unknown`, `cancelled`, `rejected`.

A timeout after dispatch does not prove failure. For non-idempotent operations, never blindly retry: reconcile device state or request owner intervention. Retries must be bounded by the task envelope and resource reservation. Revalidate authorization, expiry, target identity, trust, current device state and safety conditions immediately before a side effect. Cancellation is best-effort once a device has accepted a command and must be reported honestly.

## 9. Connection, health, resources and platform behavior

Track connection separately from health and trust. Observations require source, timestamp, freshness/expiry and uncertainty. Stale state becomes `unknown`, not healthy or safe.

Resource awareness may include battery level/charging, thermal state, memory/storage pressure, network type/quality, bandwidth, latency, data cost where known, power state, foreground/background restrictions and device availability. Collect only what is needed for the current purpose.

Android is the first implementation target. Respect runtime permissions, foreground-service restrictions, background execution limits, scoped storage, Bluetooth/nearby-device permission changes, battery optimization, thermal throttling, network constraints and OS lifecycle. Do not promise continuous background monitoring where Android does not permit it. Windows, Linux and macOS are later cross-platform targets behind the same contracts; platform-specific behavior stays in adapters.

## 10. Privacy and sensor safeguards

- Microphone, camera, location and other sensitive sensors require separate, purpose-bound capability grants and platform permission.
- Use explicit activation and visible/understandable indication for sensor use where platform/device supports it.
- Prefer on-device processing and minimum necessary data. No continuous ambient recording by default; no raw ambient audio/video in audit logs.
- A sensor being present or paired does not imply permission to activate it.
- Device outputs are subject to PAOM. A shared room, shared display, casting session or unknown route is not private by default.
- Reading permission does not authorize speaking; a connected headset is only a privacy hint.
- Never send private sensor streams to external models/services without a separate data-egress decision and explicit authorization.
- Device location and telemetry must be minimized, purpose-limited and retention-controlled by DGLM.

## 11. Failure handling and observability

Use explicit reason codes for unknown identity, pairing incomplete, trust stale/revoked, capability undeclared, grant missing, authorization expired, device offline, adapter unavailable, permission denied, safety interlock, resource limit, replay detected, unsupported contract and outcome unknown.

Audit minimal metadata: actor/session reference, device and module references, operation/capability, policy decision, approval references, timestamps, adapter result class, correlation/idempotency references and integrity metadata. Do not log credentials, raw audio/video, unnecessary location history, message bodies or full sensor payloads.

## 12. Required contracts and acceptance criteria

The v1 contracts introduced alongside this document define:
- device registry record and lifecycle;
- device capability declaration;
- device trust assessment;
- normalized device command request and result.

Acceptance criteria for future implementation:
1. Discovery alone never creates a paired, trusted or authorized device.
2. Pairing requires a verified owner session and explicit target confirmation.
3. Device trust, owner identity, connection, health, privacy and capability grants remain separate.
4. A declared capability never becomes a grant.
5. No model or executor can directly invoke a device adapter.
6. Every protected command passes SSM, RBM and ES; DGLM applies to data handling and egress.
7. High-impact physical actions require action-bound approval and respect device safety interlocks.
8. Stale or conflicting evidence fails closed.
9. Non-idempotent timeouts enter outcome reconciliation and are not blindly retried.
10. Sensor access is explicit, purpose-bound and minimized.
11. PAOM blocks sensitive disclosure through shared or unknown output routes until owner choice.
12. Android limitations are represented honestly; no unsupported background guarantees.
13. Lost-device revocation invalidates dependent grants/sessions and is auditable.
14. Existing chat, history, localStorage keys, API contract, provider behavior and production branch remain unchanged.

## 13. Implementation sequence

A. Validate these contracts against existing IAM, SSM, CPR, ES, RBM, DGLM, PAOM and audit contracts.
B. Implement deterministic registry and lifecycle state machine without hardware access.
C. Implement pairing and Device Trust Manager evidence flow.
D. Implement adapter SDK and mock-device tests.
E. Add one low-risk Android read-only adapter, with explicit permissions.
F. Add output routing and PAOM integration.
G. Add write/control adapters only after action-bound approvals, safety interlocks, replay protection, idempotency and reconciliation tests.
H. Add further device families and desktop platforms incrementally.

No hardware integration or runtime device control is implemented by this specification.
