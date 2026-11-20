# Smart Environment Manager

Status: architecture specification; runtime integration is pending.
Module ID: `sofia.environment.smart`
Contract baseline: `1.0.0`

## 1. Purpose and scope

Smart Environment Manager (SEM) coordinates user-authorized smart-home and building-environment experiences: lighting, climate, shades, plugs, selected appliances, environmental sensors, and named scenes. It provides a normalized domain layer without binding Sofia Core to a particular manufacturer, hub, radio protocol, or cloud service.

SEM is optional and capability-driven. A device is usable only when a supported adapter, documented API/protocol, valid account/device authorization, and required platform permissions are available. It does not promise universal compatibility.

## 2. Architectural boundaries

- Device Integration Gateway owns device sessions and the transport-level command channel.
- Automation & Integration Manager owns provider adapters, connection metadata, triggers, and integration invocation.
- SEM owns environment-specific intent, scene composition, device grouping, state interpretation, and safety constraints.
- Security Manager authorizes each exact protected operation at invocation time.
- Autonomy & Decision Manager supplies bounded task authority; a scene or routine never grants authority by itself.
- Workflow & State Manager owns durable multi-step workflows and recovery.
- Notification & Reminder Manager owns user notifications.
- Privacy & Data Governance Manager controls purpose, consent, classification, retention, and disclosure.
- Audit & Observability Manager records decisions, commands, outcomes, and uncertainty with privacy-aware redaction.

No module may bypass these boundaries by calling a vendor endpoint or device directly.

## 3. Supported capability classes

Adapters may declare capabilities such as:
- read state and availability;
- set bounded lighting parameters;
- set climate target within device- and policy-defined safe bounds;
- operate shades or curtains;
- switch approved low-risk outlets/appliances;
- activate or deactivate preconfigured scenes;
- read environmental measurements such as temperature, humidity, and air quality.

Capability declarations are specific to adapter, device model, firmware, account, region, and API version. Unsupported or ambiguous capabilities are unavailable, not guessed.

## 4. Safety and authority model

Risk is evaluated per operation, not by device category alone.

- Read-only observations require purpose-limited access and applicable consent.
- Low-impact reversible changes may be eligible for a user-configured bounded routine, if Security Manager policy explicitly permits it.
- Door locks, gates, garage doors, alarms, access-control systems, cameras/microphones, ovens, heaters, cooking appliances, water valves, and other safety/security-sensitive controls require stricter policy and fresh action-specific confirmation where applicable.
- Disabling security, unlocking an entry, opening a garage/gate, or operating a potentially hazardous appliance must never be inferred from a vague phrase, model suggestion, scene name, or unverified speaker.
- Emergency stop and manual physical controls take precedence. Sofia must not obstruct or disable them.
- A lost connection, stale state, conflicting telemetry, expired grant, uncertain device identity, or unavailable verifier fails closed for protected actions.
- A command acknowledgement is not proof that the physical state changed. The result must be independently read back when supported; otherwise report the outcome as unverified.

## 5. Scenes and routines

A scene is a versioned, user-owned collection of typed operations with explicit target devices, parameter bounds, preconditions, and failure behavior. Scene execution is expanded into individual invocations; each invocation is independently authorized. A scene cannot contain hidden or dynamically injected actions.

Routines may be time-, event-, or sensor-triggered only when the user explicitly enables them, defines scope and limits, and can inspect, pause, revoke, or delete them. Triggers are signals to evaluate a workflow, never authority to perform an action. Replayed events are deduplicated and checked against current consent and policy.

## 6. Privacy and sensing

Presence, occupancy, camera, microphone, and behavioral data are sensitive by default. Collect only the minimum data needed for a declared purpose, prefer local processing when supported, expose capture/processing state, and apply short retention by default. Do not infer that a person is the owner merely because a sensor detects presence. Do not perform covert recording, facial identification, or bystander profiling.

## 7. Device and protocol integration

Adapters may use documented vendor APIs, supported hubs, standard protocols, or approved OS/platform integrations. Protocol support is conditional on hardware, firmware, network topology, credentials, regional availability, and user permissions. Secrets remain in a protected credential vault and never enter prompts, client storage, ordinary logs, or repository files.

## 8. Android-first and cross-platform behavior

The primary companion experience is Android-first. Device discovery, local-network access, Bluetooth, background execution, notifications, and nearby-device permissions must follow Android version-specific rules and user-visible consent. Other desktop/mobile platforms may be supported through separate adapters and permission models. Background operation is best-effort and subject to OS limits; critical safety functions must not depend on Sofia running.

## 9. Failure handling and reconciliation

Every side-effecting command carries an idempotency key, deadline, target identity, exact capability and parameters, authority reference, policy-decision reference, and correlation context. On timeout or connection loss, completion is unknown until reconciled with provider/device state. Do not blindly retry non-idempotent or safety-sensitive commands. Partial scene execution must be reported per operation; automatic compensation is allowed only when separately authorized and safe.

## 10. Required contracts

- `environment-device.schema.json`: normalized device identity, capabilities, provenance, and availability.
- `environment-state-observation.schema.json`: timestamped device/sensor state with freshness and confidence.
- `environment-command-intent.schema.json`: exact operation and bounded parameters for authorization and execution.
- `environment-scene.schema.json`: user-owned, versioned scene definition with explicit operations and preconditions.

## 11. Acceptance criteria before runtime integration

1. Every adapter publishes a signed/verified capability manifest and exact supported contract versions.
2. Device identity, ownership, connection, firmware, and capability are validated before execution.
3. Security Manager authorizes each exact operation at the enforcement point.
4. Fresh confirmation is bound to the target device, operation, parameters, and expiry for protected actions.
5. Sensor provenance, timestamps, freshness, uncertainty, and consent are preserved end-to-end.
6. Idempotency, deadlines, cancellation, partial failure, reconciliation, and emergency-stop behavior are tested.
7. Privacy, bystander protection, Android permission, and data-retention tests pass.
8. Independent verification distinguishes provider acknowledgement from confirmed physical state.

## 12. Non-goals and current limitations

This specification does not implement device discovery, vendor connections, local-network control, Bluetooth/Zigbee/Thread/Matter adapters, routines, sensor capture, or physical actuation. It does not certify any particular device or protocol. No smart-home account, credential, or device has been connected by this document.
