# Location & Navigation Manager

**Status:** architecture specification; runtime implementation is pending.  
**Contract baseline:** JSON Schema Draft 2020-12. Schema and interface versioning follows [CONTRACT_AND_IDENTIFIER_STANDARDS.md](CONTRACT_AND_IDENTIFIER_STANDARDS.md).

## 1. Purpose

The Location & Navigation Manager (LNM) provides privacy-controlled access to location context, route planning, navigation hand-off, geofences, and location-aware workflows. It serves Android first and supports other platforms and vehicle systems only through their documented capabilities and permissions.

Location is sensitive data. The manager must operate on a specific declared purpose, minimum necessary precision, limited duration, and explicit user permission. It must never imply that a location fix or route is exact when its accuracy, age, or source does not support that claim.

## 2. Responsibility boundaries

- Device & Sensor Data Manager owns sensor capture sessions, raw observations, provenance, and sensor permission enforcement.
- LNM requests and consumes only purpose-authorized location observations; it does not bypass the sensor manager.
- Knowledge & Search Manager may resolve place information and provide sourced points of interest.
- Task Orchestrator and Workflow & State Manager coordinate multi-step travel workflows and durable state.
- Automation & Integration Manager connects approved map, transit, ride, calendar, and vehicle providers.
- Device Integration Gateway owns device and vehicle command channels.
- Security Manager authorizes access and consequential actions.
- Privacy & Data Governance Manager enforces consent, classification, retention, and disclosure.
- Autonomy & Decision Manager sets authority and confirmation requirements.
- Resource & Runtime Manager bounds background work, battery, network, and provider quotas.
- Audit & Observability Manager records access decisions and actions without unnecessarily retaining precise coordinates.

LNM does not independently authorize movement, unlock vehicles, start engines, pay fares, book rides, or share a user's live location.

## 3. Location sources and quality

Supported sources may include OS location services, GNSS/GPS, network-derived location, user-selected map points, approved wearable/device providers, and authorized vehicle telemetry. Every observation records source, capture time, reported accuracy, coordinate reference system, and whether it is measured, user-entered, provider-derived, or inferred.

Consumers must evaluate:
- age and freshness;
- horizontal accuracy and uncertainty;
- source trust and spoofing indicators where available;
- permission scope and capture purpose;
- whether the observation is foreground or background;
- whether precision is necessary for the requested task.

Do not silently convert stale or coarse data into a precise current location. If the quality is insufficient, request a refresh or ask the user to select/confirm a location.

## 4. Permission and consent model

Permissions are purpose-specific and scoped by duration, precision, foreground/background mode, and recipient. Prefer approximate location unless precise location is required for the task. Live sharing requires an explicit recipient, start time, end time, and revocation path.

Permission denial, revocation, OS restriction, or unavailable location services must produce a clear unavailable state. No hidden continuous tracking or covert location collection is permitted.

## 5. Geocoding and place resolution

Address-to-coordinate and coordinate-to-address resolution use approved providers with explicit data disclosure and provider selection policies. Provider output is untrusted external data and must be validated. Preserve the distinction between a user-entered address, a provider-resolved result, and a device-measured position.

Ambiguous place names must be disambiguated rather than silently selecting a destination. Results should include source, freshness, confidence/quality, and relevant alternatives.

## 6. Route planning

Route requests declare origin, destination, travel mode, departure/arrival constraint, accessibility requirements, avoidances, and routing preferences. Modes may include walking, cycling, driving, public transit, and supported multimodal combinations.

Route results include provider, route alternatives, estimated distance and duration, calculation time, traffic/transit freshness, warnings, and assumptions. Estimates are not guarantees. Dynamic conditions require refresh and clear indication of last update.

Accessibility options, tolls, ferries, restricted roads, parking, charging stops, and vehicle constraints are included only when supported by provider data. Missing data must be identified, not invented.

## 7. Navigation hand-off and vehicle integration

Turn-by-turn guidance should normally be handed off to an approved navigation application or supported vehicle interface. LNM may present route context and receive progress/status when the provider permits it.

Vehicle commands are outside ordinary navigation authority. Any command affecting vehicle movement, locks, engine, safety systems, or physical access requires a separately approved device capability, strict identity and proximity checks where applicable, and action-specific confirmation. Never assume a connected car exposes a safe or authorized command API.

## 8. Geofences and location-triggered automation

Geofences are bounded, user-visible rules with center/region, radius or polygon, entry/exit/dwell condition, active schedule, expiration, source requirements, and notification/automation policy.

A geofence event is only a trigger to evaluate a workflow. It does not itself authorize downstream actions. Recheck consent, current policy, freshness, and action authority at execution time. Avoid excessive precision, rapid oscillation, battery-draining polling, and sensitive inferences about other people.

## 9. Live location sharing

Sharing is opt-in, recipient-specific, time-bounded, visible, and revocable. Show who can see the location, the precision being shared, last update time, and when sharing ends. A failed stop/revocation operation must be surfaced clearly and retried safely; never claim sharing has stopped without confirmation.

## 10. Reliability and safety

Handle GPS loss, tunnel/urban-canyon drift, stale fixes, spoofing indicators, provider outages, network loss, route changes, and OS process termination. Navigation instructions must not override road signs, traffic laws, or the driver's attention. Do not encourage interaction with a screen while driving; use safe audio/hands-free modes where supported.

Emergency routing or safety-critical advice must not rely solely on an unverified location or route estimate. Provide clear uncertainty and appropriate emergency-service hand-off where relevant.

## 11. Android-first and cross-platform requirements

Android implementation must respect runtime permissions, approximate/precise location choices, foreground-service declarations and notifications, background location restrictions, battery optimization, scoped storage, and process death. Background updates must be justified by a user-visible feature and policy.

Windows, Linux, macOS, web, wearables, and vehicle platforms use adapters behind the same contracts. Capability discovery is mandatory; unsupported device access must be reported rather than simulated.

## 12. Verification requirements

Test permission denial/revocation, approximate versus precise access, stale and inaccurate fixes, source disagreement, mocked/spoofed location indicators, provider data disclosure, ambiguous geocoding, route freshness, traffic/transit outage, geofence boundary oscillation, background restrictions, process death, battery/network budgets, live-sharing expiry/revocation, recipient mismatch, vehicle capability restrictions, audit minimization, and deletion/retention behavior.

## 13. Implementation status

**Implementation status:** this change adds architecture and versioned contracts only. It does not access device location, run background tracking, calculate live routes, create geofences, share location, connect maps, or control a vehicle. No production configuration or existing prototype data is changed.
