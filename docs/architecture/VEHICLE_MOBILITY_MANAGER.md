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

Commands that could affect motion, steering, braking, acceleration, gear selection, immobilization while moving, or safety systems are out of scope. No remote driving or autonomous vehicle operation is permitted.

Any remote access-control or safety-relevant command requires fresh confirmation bound to the exact vehicle, operation, parameters and expiry, plus invocation-time policy enforcement. The vehicle must be in a verified safe state when required by the OEM interface. If state is stale or uncertain, deny or request user verification. A provider acknowledgement is not proof of physical completion.

## 6. Driver safety and legal boundaries

The driver remains responsible for observing road conditions, traffic laws, vehicle warnings and manufacturer instructions. The interface must not encourage interaction while driving. When motion is detected or reasonably suspected, restrict interaction to legally permitted, low-distraction voice or passenger workflows; defer complex tasks and require the vehicle to be safely parked. Do not bypass built-in driver-distraction protections.

## 7. Maintenance assistance

VMM may organize service schedules, user-entered symptoms, OEM-reported diagnostics, recalls and repair history. It may explain documentation and suggest checking an official dealer or qualified mechanic. It must not claim a definitive diagnosis from incomplete telemetry, clear fault codes, or recommend continued driving when a safety-critical warning is present. Safety warnings should direct the user to stop safely and follow the vehicle manual or qualified assistance.

## 8. Android-first and cross-platform support

Android is the primary companion platform. Vehicle integrations may use documented OEM APIs, supported Android Auto capabilities, approved Bluetooth profiles, or authorized OS hand-offs. Android Auto availability does not imply unrestricted access to vehicle controls or telemetry. Desktop and other mobile platforms use separate adapters and permission models.

## 9. Failure, reconciliation and audit

Every side-effecting operation carries an idempotency key, deadline, exact target and parameters, authority reference, policy-decision reference, and correlation context. On timeout or lost connectivity, completion is unknown until reconciled with authoritative provider state. Never blindly retry a command that may have changed vehicle security or state. Audit logs redact VIN, precise location, credentials and personal travel patterns.

## 10. Required contracts

- `vehicle-profile.schema.json`: minimal user-managed vehicle reference and supported capability references.
- `vehicle-observation.schema.json`: sourced, timestamped vehicle telemetry with freshness and uncertainty.
- `vehicle-command-intent.schema.json`: exact command proposal with risk, authority and confirmation references.
- `vehicle-maintenance-record.schema.json`: service, inspection, repair and recall records with provenance.

## 11. Runtime readiness criteria

1. Official adapter/API support and terms are verified per manufacturer, vehicle, region and account.
2. Vehicle identity and user authorization are verified without exposing secrets.
3. Capability discovery is explicit and current; unsupported operations are unavailable.
4. Security Manager authorizes every exact command at invocation time.
5. Driver-distraction and motion-state restrictions are tested.
6. Stale telemetry, timeout, replay, duplicate command and uncertain completion cases are tested.
7. Sensitive identifiers and location are protected in storage, transmission, logs and provider disclosure.
8. Independent verification distinguishes command acceptance from confirmed vehicle state.

## 12. Non-goals and current limitations

This document does not connect an OEM account, read vehicle telemetry, discover a vehicle, access Android Auto internals, execute remote commands, diagnose a vehicle, or provide roadside dispatch. It does not guarantee support for any make, model, year, country, protocol or subscription.
