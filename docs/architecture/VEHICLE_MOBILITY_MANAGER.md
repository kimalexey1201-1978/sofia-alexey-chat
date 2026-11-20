# Vehicle & Mobility Manager

Status: architecture specification; runtime integration is pending.
Module ID: `sofia.mobility.vehicle`
Contract baseline: `1.0.0`

## 1. Purpose

Vehicle & Mobility Manager (VMM) provides a normalized layer for user-authorized vehicle information and mobility workflows: vehicle profiles, supported telemetry, maintenance records, trip/charging context, and carefully bounded vehicle commands where an official, permitted interface exists.

It is not a vehicle control system, autonomous-driving system, emergency response system, or replacement for the driver's judgment. Features depend on the vehicle, model year, market, subscription, API, hardware, network and user permissions.

## 2. Ownership boundaries

- VMM owns vehicle-domain profiles, maintenance history, normalized vehicle observations, and mobility-specific intent.
- Device Integration Gateway owns device sessions and command transport.
- Automation & Integration Manager owns OEM, fleet, charging-network, roadside-assistance and map-provider adapters.
- Location & Navigation Manager owns location observations, routing and navigation hand-off.
- Travel & Trip Manager owns multi-day trip itineraries and booking workflows.
- Financial & Expense Manager owns expense and budget records.
- File & Document Manager owns uploaded manuals, registration documents and service invoices.
- Security Manager authorizes every protected operation.
- Autonomy & Decision Manager bounds task authority; vehicle profiles and routines never grant authority.
- Audit & Observability Manager records decisions and outcomes with sensitive data redaction.

Cross-module interaction uses registered capabilities and versioned contracts only.

## 3. Vehicle identity and data provenance

A vehicle profile is a user-managed reference, not proof of legal ownership. VIN, registration identifiers, precise location, driver identity and account tokens are sensitive and must be restricted, minimized, encrypted, and excluded from ordinary logs and prompts. Store references to protected secrets/documents, not raw credentials or unnecessary identifiers.

Each observation must preserve source, timestamp, units, freshness, confidence and whether it is OEM-reported, device-estimated, user-entered or inferred. Inference must never be presented as authoritative vehicle telemetry.

## 4. Read-only capabilities

Where supported and authorized, adapters may expose:
- odometer and service interval;
- fuel or battery state and charging status;
- tire-pressure or diagnostic indicators;
- vehicle lock/door/window status;
- location or last-seen status, only with explicit purpose and consent;
- maintenance and service history.

Stale, delayed, unavailable or conflicting telemetry must be labeled. A dashboard warning or fault code must not be dismissed or cleared by Sofia.

## 5. Command safety

Vehicle commands are opt-in and capability-specific. Remote lock/unlock, climate preconditioning, horn/lights, charging controls, and similar functions may be supported only through documented official interfaces and applicable authorization.

Commands that directly control steering, braking, throttle/acceleration, gear selection, immobilization while moving, or safety systems are out of scope. No remote driving or autonomous vehicle operation is permitted. A narrowly scoped exception is permitted for voice requests to the vehicle's own factory cruise-control or adaptive-cruise-control interface, but only when the manufacturer exposes a documented, authorized control capability for the exact vehicle and market. Sofia may request enable, cancel, resume, or set a target speed only within the vehicle's declared limits and only when the vehicle itself reports that the feature is available. Sofia must never emulate button presses, inject low-level vehicle-bus messages, override driver monitoring, bypass interlocks, or force activation when the vehicle rejects the request.

Any remote access-control or safety-relevant command requires fresh confirmation bound to the exact vehicle, operation, parameters and expiry, plus invocation-time policy enforcement. The vehicle must be in a verified safe state when required by the OEM interface. If state is stale or uncertain, deny or request user verification. A provider acknowledgement is not proof of physical completion.

## 6. Cruise-control voice interaction

The driver may issue concise commands such as “Sofia, enable cruise control”, “set cruise speed to 90 km/h”, “resume cruise control”, or “cancel cruise control”. The voice layer must bind the request to the authenticated driver session, distinguish it from bystander speech where supported, and parse speed with an explicit unit. If the requested speed is ambiguous, outside the OEM-reported permitted range, or the vehicle state is stale/unknown, Sofia must not send the command and must ask for clarification or report unavailability.

The vehicle's native cruise-control system remains solely responsible for sensing, speed regulation, braking/acceleration behavior, following distance, and all safety interlocks. Sofia is only a request interface. The vehicle must confirm whether the request was accepted; Sofia must report “requested”, “accepted”, “active”, “rejected”, or “unverified” accurately and must not equate command transmission with activation. The driver must continue to supervise the road and remain ready to take over. Driver attention, hands-on requirements, road/weather limitations, and legal restrictions follow the vehicle manual and applicable law. Adaptive cruise control is not autonomous driving.

## 7. Temporary rental-vehicle sessions

When Sofia encounters a vehicle that is not already bound to a confirmed profile, it must ask the user whether the vehicle is personally owned, rented, borrowed, or otherwise temporarily used before creating or connecting a profile. Proximity, Bluetooth discovery, a rental booking, or another person's device must never be treated as proof of ownership or authorization. The user may also state the vehicle type explicitly before connection.

A rental session is a temporary, purpose-limited association between the authenticated user, one vehicle profile, and one declared rental period. It must:
- be explicitly started by the user and bound to the selected vehicle, authenticated principal, consent record, and declared start/end time;
- discover capabilities separately for the actual vehicle, model year, market, adapter, account entitlement, OS permission, and connection method;
- use only user-approved, documented connection paths: Bluetooth pairing, supported Android Auto projection/OS hand-off, or an official OEM/rental-provider API with valid delegated authorization;
- distinguish projection/media/navigation from read-only telemetry and command capabilities. Bluetooth or Android Auto pairing alone never implies access to telemetry or vehicle controls;
- request only the minimum capability grants required for the current task. Unsupported capabilities remain unavailable; Sofia must not bypass rental-provider access controls, use another person's account, request the user's rental password, emulate hidden UI controls, or inject vehicle-bus messages;
- require setup and permission changes while safely parked. While moving, limit interaction to legally permitted, low-distraction assistance; defer pairing, profile changes, and complex configuration;
- keep rental tokens in protected secret storage by reference only, never in logs, prompts, ordinary profile fields, or repository files;
- apply the same OEM-only restrictions and exact invocation-time authorization to any vehicle command. Cruise-control requests are available only where the exact vehicle exposes a documented OEM capability; native vehicle safety systems remain authoritative;
- expire automatically at the declared end time and support explicit early termination. On termination, revoke delegated tokens where supported, close the device session, purge ephemeral session data and temporary credentials, and prompt the user to remove the phone from the rental infotainment's paired-device list when safe;
- never erase the vehicle's complete infotainment history or data belonging to another renter. Any optional cleanup of the user's own call history or recent destinations must be a separately explained, user-confirmed action through a supported interface;
- retain no rental location history, routes, or observations beyond the declared purpose and retention period. Any personal trip note retained beyond session expiry requires separate user choice and consent.

If the vehicle is unknown, Sofia asks: “Is this your vehicle, or is it rented/borrowed?” It does not initiate pairing or request credentials until the user answers and the required authorization checks pass. If the answer is uncertain, the session remains unconnected.

Session states are `proposed`, `awaiting_user_classification`, `awaiting_consent`, `ready_to_connect`, `active`, `ending`, `ended`, `expired`, and `failed`. State transitions are audited. A lost connection does not silently extend the rental period. Reconnection requires a still-valid session, fresh capability discovery, and current authorization.

Required contract: `vehicle-rental-session.schema.json`, defining temporary ownership/use classification, bounded session lifetime, connection method, consent and principal references, capability grants, and protected secret references. This is an architecture contract only; it does not implement pairing, OEM connectivity, or rental-provider integration.

## 8. Driver safety and legal boundaries

The driver remains responsible for observing road conditions, traffic laws, vehicle warnings and manufacturer instructions. The interface must not encourage interaction while driving. When motion is detected or reasonably suspected, restrict interaction to legally permitted, low-distraction voice or passenger workflows; defer complex tasks and require the vehicle to be safely parked. Do not bypass built-in driver-distraction protections.

## 9. Maintenance assistance

VMM may organize service schedules, user-entered symptoms, OEM-reported diagnostics, recalls and repair history. It may explain documentation and suggest checking an official dealer or qualified mechanic. It must not claim a definitive diagnosis from incomplete telemetry, clear fault codes, or recommend continued driving when a safety-critical warning is present. Safety warnings should direct the user to stop safely and follow the vehicle manual or qualified assistance.

## 10. Android-first and cross-platform support

Android is the primary companion platform. Vehicle integrations may use documented OEM APIs, supported Android Auto capabilities, approved Bluetooth profiles, or authorized OS hand-offs. Android Auto availability does not imply unrestricted access to vehicle controls or telemetry. Desktop and other mobile platforms use separate adapters and permission models.

## 11. Failure, reconciliation and audit

Every side-effecting operation carries an idempotency key, deadline, exact target and parameters, authority reference, policy-decision reference, and correlation context. On timeout or lost connectivity, completion is unknown until reconciled with authoritative provider state. Never blindly retry a command that may have changed vehicle security or state. Audit logs redact VIN, precise location, credentials and personal travel patterns.

## 12. Required contracts

- `vehicle-rental-session.schema.json`: temporary rental/borrowed vehicle session with bounded lifetime, consent, principal and capability grants.
- `vehicle-profile.schema.json`: minimal user-managed vehicle reference and supported capability references.
- `vehicle-observation.schema.json`: sourced, timestamped vehicle telemetry with freshness and uncertainty.
- `vehicle-command-intent.schema.json`: exact command proposal with risk, authority and confirmation references.
- `vehicle-cruise-control-request.schema.json`: voice-originated cruise-control request, explicit speed units, OEM capability and vehicle-state preconditions.
- `vehicle-maintenance-record.schema.json`: service, inspection, repair and recall records with provenance.

## 13. Runtime readiness criteria

1. Official adapter/API support and terms are verified per manufacturer, vehicle, region and account.
2. Vehicle identity and user authorization are verified without exposing secrets.
3. Capability discovery is explicit and current; unsupported operations are unavailable.
4. Security Manager authorizes every exact command at invocation time.
5. Cruise-control commands are limited to the OEM's declared interface and permitted operating envelope; no low-level actuator control or interlock bypass is possible.
6. Driver-distraction and motion-state restrictions are tested.
7. Stale telemetry, timeout, replay, duplicate command and uncertain completion cases are tested.
8. Sensitive identifiers and location are protected in storage, transmission, logs and provider disclosure.
9. Independent verification distinguishes command acceptance from confirmed vehicle state.

## 14. Non-goals and current limitations

This document does not connect an OEM account, read vehicle telemetry, discover a vehicle, access Android Auto internals, execute remote commands, diagnose a vehicle, or provide roadside dispatch. It does not guarantee support for any make, model, year, country, protocol or subscription.
