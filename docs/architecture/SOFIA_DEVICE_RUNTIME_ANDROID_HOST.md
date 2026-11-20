# Sofia Device Runtime & Android Host — Architecture Specification v1

## Status and boundary

Architecture specification only. This document does not implement an Android application/service, adapter process host, foreground service, background scheduler, device permissions UI, runtime sandbox, transport, hardware integration or device control. It does not alter the existing working chat, `main`, production settings, Cloudflare, secrets or deployment.

## 1. Purpose

Sofia Device Runtime (SDR) provides the controlled lifecycle and resource environment in which approved device adapters execute. Android Device Host (ADH) is the first platform implementation boundary. The design must let Sofia use supported Android APIs without granting adapters unrestricted access to the phone, other apps, user data or connected devices.

The host is an execution environment, not an authority source. It does not authenticate the owner, establish device trust, grant capabilities, approve sensor capture or authorize commands.

## 2. Component boundaries

- **Sofia Core / TPOE:** plans work and declares bounded requirements.
- **IAM / DTM / SDM / CPR / DGLM / SSM / RBM:** supply identity, device trust, registry, capability grants, data policy, action decisions and resource reservations.
- **Execution Supervisor:** validates module provenance, isolates invocation, controls deadline/cancellation and is the only supported caller of the Device Capability Broker.
- **Device Capability Broker:** validates the exact invocation and routes it to an approved adapter.
- **Sofia Device Runtime:** starts, supervises, limits, monitors and stops approved adapter instances.
- **Android Device Host:** maps canonical runtime operations to Android-supported app/process/service/permission APIs.
- **Platform API adapters:** invoke only declared Android APIs and return normalized results.
- **Audit & Observability:** records lifecycle and security decisions with minimized metadata.
- **DGLM:** controls persisted state, retention, export and deletion.

No model, workflow, adapter or UI component may launch an arbitrary process or call device APIs outside ES → DCB → SDR/ADH.

## 3. Runtime lifecycle

Adapter runtime lifecycle:
- `QUARANTINED`: artifact acquired but not executable.
- `VALIDATING`: manifest, signature/digest, SDK contract and compatibility checks.
- `STAGED`: immutable verified artifact staged but inactive.
- `START_PENDING`: an authorized bounded start request is being admitted.
- `STARTING`: host is allocating the declared runtime and resources.
- `READY`: health check and interface handshake succeeded.
- `RUNNING`: one or more authorized invocations are executing.
- `DEGRADED`: runtime remains available with reduced capability or health.
- `STOPPING`: no new invocation accepted; active work is drained/cancelled within policy.
- `STOPPED`: process/service is no longer active and resources are released.
- `FAILED`: startup, health or execution failed.
- `SUSPENDED`: policy, trust, permission, compatibility or security event blocks execution.
- `REVOKED`: adapter artifact or publisher trust is revoked.
- `RETIRED`: removed from active availability.

Transitions require durable operation references and audit events. A crash/restart must reconcile host-observed process state with the runtime registry before new invocations are admitted.

## 4. Admission and startup protocol

Before starting an adapter instance:
1. Verify the caller is the trusted runtime supervisor, not a model or arbitrary app component.
2. Validate adapter ID/version, immutable artifact digest, signature/provenance and lifecycle approval.
3. Validate SDK/runtime contract compatibility and target platform/API level.
4. Confirm requested capabilities and permissions are within the reviewed manifest and current grants.
5. Resolve the exact device/adapter route and current IAM/DTM/SDM/CPR evidence.
6. Confirm DGLM, SSM and RBM gates; FREE_ONLY applies to runtime, network, provider and vendor-service costs.
7. Reserve CPU, memory, storage, concurrency, network, battery/thermal allowance and execution deadline.
8. Select the least-privileged supported runtime profile.
9. Start the process/service through an OS-supported mechanism; do not use hidden APIs or privilege escalation.
10. Perform an authenticated versioned handshake and health check before marking READY.
11. Admit only invocations that pass DCB validation.

If a platform cannot provide the required isolation, permission boundary or execution guarantee, the adapter is unavailable for that operation. Do not simulate stronger isolation than the platform provides.

## 5. Android Host model

Android is the first target. ADH is an application-owned host with explicit platform adapters and lifecycle policy. It must respect:
- Android application sandbox and per-app UID boundaries;
- runtime permissions and permission revocation;
- Bluetooth/nearby-device permission changes across Android versions;
- scoped storage and Storage Access Framework;
- foreground-service types, declarations, user-visible notifications and start restrictions;
- background execution limits, Doze, App Standby and OEM-specific process management;
- notification permission and notification-channel behavior;
- battery, thermal, memory and network constraints;
- Android package installation and user-confirmation rules;
- platform privacy indicators for microphone, camera and location where applicable.

The host must not use hidden APIs, root-only assumptions, silent permission grants, Accessibility Service as a general-purpose automation bypass, notification-listener abuse, or device-administrator privileges as a substitute for user consent.

### 5.1 Foreground and background work

Each adapter operation declares whether it needs immediate foreground execution, a user-visible foreground service, a deferrable scheduled task, or no background execution.

- Short interactive operations run while the app is active when feasible.
- Long-running user-visible work uses a correctly typed foreground service only when Android policy allows it and the user is informed.
- Deferrable maintenance uses OS scheduling APIs with constraints; execution time is not guaranteed.
- Persistent background monitoring is not assumed and must not be enabled by default.
- Microphone/camera/location capture is separately governed by DSDM and platform permissions; a running service does not imply sensor authorization.
- App process death, force-stop, permission revocation, device reboot or OS restriction triggers safe suspension and state reconciliation.

The host must explain when Android cannot guarantee immediate or continuous background execution.

### 5.2 Permissions and user experience

Before invoking an OS permission prompt, Sofia presents a contextual explanation: the exact capability, purpose, data scope, whether it is optional, duration and consequence of denial. The operating system's own permission UI remains authoritative.

Permission state is tracked separately from Sofia capability grants:
- OS permission granted does not create a Sofia capability grant.
- Sofia grant does not override an OS denial.
- A permission granted to the app does not automatically grant it to every adapter.
- Permission revocation invalidates dependent sessions and stops future access.
- One-time or while-in-use permission expiry is rechecked before use.
- Optional permission denial should leave unrelated capabilities available where possible.

## 6. Isolation and least privilege

Runtime profiles are selected according to platform support and adapter risk:
- **Platform API wrapper:** narrow host-owned code invokes a specific Android API; adapter does not receive general API access.
- **Isolated process:** separate process/UID boundary where supported, with a narrow IPC contract.
- **WASM/container:** only where a verified runtime exists and its isolation properties are measured; not assumed on Android.
- **Remote service:** allowed only through a separately reviewed connector and DGLM/SSM/RBM gates; it is not a substitute for local device access.

The runtime broker exposes narrow capability handles, not unrestricted Android Context, filesystem access, intents, shell, network sockets, package manager, sensor manager or keystore access. Binder/IPC interfaces validate caller identity, message size, schema, version, transaction ID and replay/idempotency fields. Adapter-to-adapter IPC is prohibited unless a separately granted capability and brokered interface explicitly allow it.

## 7. Resource and process supervision

Each adapter declares and is enforced against:
- maximum memory and process count;
- CPU/execution time and invocation concurrency;
- network bytes and allowed destinations;
- storage quota and retention;
- battery/thermal operating limits;
- startup, health-check and shutdown deadlines;
- queue depth and per-device command rate.

Resource & Runtime Manager / RBM owns budgets and reservations; SDR enforces host-level limits. On pressure, pause or reject optional work, reduce only within the capability contract, or stop the adapter safely. Never silently increase limits or switch to paid resources. Release reservations on all terminal paths.

## 8. Session, credential and device access

Adapters receive opaque references to short-lived sessions and credentials. They never receive raw private keys, passkey secrets, OAuth refresh tokens or general vault access. Device sessions are bound to device, adapter version, owner/session context, grant and expiry. Reconnection requires fresh validation of credential status, trust assessment and grant state.

The host must revoke active IPC handles and terminate or isolate adapter instances when:
- device or credential is revoked;
- owner session expires or is revoked;
- capability grant is suspended/revoked/expired;
- adapter digest/signature is invalidated;
- OS permission is withdrawn;
- SSM policy changes or a security incident is detected.

## 9. Failure, cancellation and recovery

- Startup failure leaves the adapter non-routable.
- Health timeout moves the runtime to DEGRADED or FAILED according to policy.
- Cancellation stops new work and requests adapter cancellation; forced termination is a last resort.
- A command already dispatched to a physical device may have an unknown outcome; runtime termination is not proof of rollback.
- Non-idempotent operations require reconciliation before retry.
- Process restart revalidates artifact, permissions, grants, trust, active sessions and queued work.
- Stale queued commands are discarded or reconciled, never replayed blindly.
- Adapter crashes are isolated; unrelated adapters and Sofia chat remain available.
- Recovery uses verified immutable artifacts and does not restore revoked grants or credentials.

## 10. Cross-platform runtime abstraction

The runtime contract remains platform-neutral. Later hosts may include iOS, Windows, Linux, macOS, embedded and vehicle environments. Each host reports actual isolation, background execution, permission, secure storage, attestation, transport and resource capabilities. Unsupported guarantees are reported as unsupported, not emulated.

A desktop companion may provide a capability unavailable to Android, but it is a separately identified, paired and trusted device with its own grants and audit trail. The Android app does not inherit desktop permissions.

## 11. Audit and privacy

Audit runtime install/stage/validate/start/ready/invoke/stop/crash/suspend/revoke transitions, policy decisions, artifact digest, runtime profile, platform version, permission state references, resource reservation, invocation correlation and normalized result. Never log secrets, raw sensor payloads, full IPC payloads, ambient audio/video or unrestricted filesystem paths containing personal data.

Runtime diagnostic collection is opt-in or policy-bounded, redacted and time-limited. Crash dumps and traces may contain sensitive data and require separate controls and retention.

## 12. Acceptance tests

1. Unverified, quarantined or revoked adapter cannot start.
2. Artifact digest/signature mismatch prevents runtime admission.
3. Model/UI cannot start arbitrary processes or access Android APIs directly.
4. Adapter receives only declared brokered capability handles.
5. OS permission denial blocks dependent capability even when a Sofia grant exists.
6. OS permission grant does not create a Sofia capability grant.
7. Permission revocation stops dependent work and invalidates handles.
8. Foreground service use matches declared type and Android policy.
9. Background scheduling reports deferrable/non-guaranteed execution honestly.
10. No hidden API, root assumption, silent permission grant or accessibility bypass is used.
11. Runtime enforces memory, CPU, network, storage and concurrency quotas.
12. Battery/thermal pressure blocks or pauses optional work safely.
13. Adapter crash does not crash Sofia Core or unrelated adapters.
14. Restart reconciles runtime state before accepting new invocations.
15. Revocation terminates sessions and prevents queued work from dispatching.
16. Timeout after physical dispatch is not treated as rollback.
17. Non-idempotent work is reconciled before retry.
18. Secrets and raw sensor content do not enter logs or crash diagnostics by default.
19. FREE_ONLY blocks unapproved paid runtime/provider/transport routes.
20. Platform capability reports never claim unsupported isolation or background behavior.

## 13. Implementation sequence

1. Freeze runtime profile, host capability and runtime session contracts.
2. Build a deterministic desktop/mock host for lifecycle and failure-injection tests.
3. Implement Android host skeleton with no device permissions and no hardware access.
4. Add adapter staging, provenance checks and process supervision.
5. Add brokered IPC and one mock adapter.
6. Add Android permission disclosure and OS permission state reconciliation.
7. Add resource limits, cancellation, crash isolation and audit.
8. Integrate one low-risk read-only Android capability behind feature flags.
9. Run security review, Android version/OEM compatibility tests and recovery drills before enabling real hardware.

No device-control feature should be marked operational until runtime code, OS behavior and acceptance tests are verified on supported devices.
