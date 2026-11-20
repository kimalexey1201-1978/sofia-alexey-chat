# Notification & Reminder Manager

**Status:** architecture specification; runtime implementation is pending.  
**Contract baseline:** JSON Schema Draft 2020-12. Schema documents use `schema_version`; public interfaces use `contract_version`, following [CONTRACT_AND_IDENTIFIER_STANDARDS.md](CONTRACT_AND_IDENTIFIER_STANDARDS.md).

## 1. Purpose and boundaries

The Notification & Reminder Manager (NRM) plans, schedules, routes, delivers, and tracks user-facing notifications and reminders across supported Sofia clients and devices. It provides a unified policy-controlled service for one-time reminders, recurring schedules, workflow alerts, proactive suggestions, and delivery receipts.

The NRM is not an authority source. A reminder to perform an action does not authorize that action. Notifications do not bypass Identity & Authentication, Security Manager, Autonomy & Decision Manager, Privacy & Data Governance, Resource & Runtime, Workflow & State, or Device Integration policies.

The manager separates:
- **Schedule:** when a notification becomes eligible.
- **Notification:** the content and intent to communicate.
- **Delivery attempt:** a platform/channel-specific attempt.
- **Receipt:** evidence of delivered, displayed, read, dismissed, or failed state where the platform provides it.

Delivery to a device is best-effort unless a channel explicitly provides stronger receipt semantics. The system must not claim a notification was seen merely because it was queued or sent.

## 2. Notification classes and priority

Notification classes include:
- user-created reminders;
- workflow/task status and approval requests;
- security and account alerts;
- device and integration status;
- proactive suggestions that the user has opted into;
- system maintenance and recovery notices.

Priority is policy-bounded (for example, low, normal, high, critical). A producer cannot self-assign critical priority to bypass quiet hours or user preferences. Critical delivery exceptions must be narrowly defined, justified, audited, and never used for marketing or routine reminders.

## 3. Scheduling and recurrence

Schedules support one-time and recurring delivery, including calendar-based recurrence, interval recurrence, start/end boundaries, timezone, and daylight-saving-time behavior.

Requirements:
- Store canonical instants in UTC and retain the intended IANA timezone for user-facing calendar schedules.
- Define behavior for daylight-saving gaps and repeated local times; never silently shift a reminder without a documented policy.
- Recurrence definitions are bounded and validated. Limit maximum occurrence count, schedule horizon, and frequency to prevent accidental notification floods.
- Persist schedule state and next-fire time; do not rely on an in-memory timer as the only record.
- Use deterministic idempotency keys for each occurrence so scheduler restarts do not create duplicate notifications.
- Recalculate future occurrences when timezone rules change, preserving the user's stated local-time intent where possible.
- A schedule's end date, occurrence limit, or explicit cancellation terminates future instances.

Relative phrases such as “tomorrow morning” must be resolved using the user's confirmed locale/timezone and an explicit interpretation before a consequential schedule is committed if ambiguity remains.

## 4. Quiet hours, preferences, and escalation

User preferences govern channel selection, sound/vibration, previews, categories, quiet hours, frequency caps, and accessibility presentation.

Quiet hours are evaluated using the recipient's configured timezone. Routine reminders and proactive suggestions are deferred or silently grouped during quiet hours. Only explicitly authorized critical categories may override quiet hours, and every override is auditable.

Escalation (for example, retrying another channel) is opt-in or explicitly configured for the notification class. It must respect channel permissions, privacy, cost, and user preferences. Do not repeatedly escalate a notification merely because a read receipt is unavailable.

## 5. Delivery channels and device capabilities

Channel adapters may include in-app notifications, Android notifications, web push, email, SMS, wearable surfaces, vehicle interfaces, and supported smart displays. Availability depends on installed adapters, platform APIs, user grants, connectivity, device capability, and regional/service constraints.

The manager must:
- query registered device/channel capabilities rather than assume universal support;
- request only minimum required permissions;
- respect Android notification runtime permission and OS background execution limits;
- use platform-supported scheduling and push mechanisms;
- avoid hidden or perpetual background services;
- provide channel-specific payload minimization and preview redaction;
- avoid sending restricted data to a channel that cannot protect it;
- record adapter and delivery state without claiming user attention.

A device being registered does not imply every channel is enabled. Revocation or disconnection disables future delivery to that endpoint and triggers cleanup of queued sensitive payloads where required.

## 6. Privacy and content rendering

Notification content is classified before routing. Sensitive content should default to a generic lock-screen preview (for example, “You have a reminder”) with details available only after authentication in the app.

The manager applies purpose limitation, consent, retention, deletion, and data minimization rules to notification content and delivery metadata. Do not include credentials, full private messages, sensitive health details, or raw sensor data in push payloads unless explicitly necessary, authorized, and supported by the channel's protection level.

External channel providers receive only the minimum information required for delivery. Provider disclosures and cross-border transfer requirements are governed by Privacy & Data Governance.

## 7. Reliability, deduplication, and failure handling

Use durable scheduling records and an outbox/inbox pattern integrated with Event Bus. Delivery is at-least-once where the adapter supports retry; clients and adapters must deduplicate using notification and occurrence IDs.

Track separate states such as scheduled, due, queued, sending, sent, delivered, displayed, read, dismissed, deferred, failed, expired, and cancelled. A channel may not support all states; unsupported receipt states remain unknown rather than inferred.

Retries are bounded with exponential backoff and jitter, deadlines, per-channel quotas, and circuit breakers. Permanent failures (invalid endpoint, revoked permission, unsupported payload) are not retried indefinitely. Provider timeouts may leave delivery outcome unknown; reconcile before retrying where duplicate delivery could be harmful.

Backpressure and frequency caps prevent a noisy producer or faulty schedule from flooding the user or exhausting quota. Batch/coalesce low-priority notifications where appropriate without losing their underlying reminder records.

## 8. User control and lifecycle

Users can create, inspect, edit, snooze, pause, resume, and cancel reminders, subject to ownership and authorization checks. Changes to recurring schedules apply prospectively unless the user explicitly requests otherwise.

Every reminder has an owner, purpose, schedule, timezone semantics, status, and retention policy. The manager must make active schedules discoverable and provide a clear way to disable categories or channels.

Snoozing creates a new bounded due time; it does not mutate the original occurrence history. Repeated snoozes are limited by policy to prevent runaway schedules. A cancelled schedule cannot create future occurrences.

## 9. Event and workflow integration

The manager consumes authorized events such as workflow waiting/approval, completion, failure, and deadline events. It emits lifecycle events for scheduled, due, delivery attempted, delivered/failed, deferred, read/dismissed (when available), and cancelled notifications.

Events are facts, not commands. An approval-request notification only informs the user; approval must occur through an authenticated, action-bound approval flow. Clicking a notification opens a deep link that is re-authorized by the destination; possession of the link or notification ID is not authority.

## 10. Observability and audit

Record schedule changes, policy decisions, channel selection, delivery attempts, deferrals, retries, provider errors, permission revocations, and available receipts. Use correlation IDs to connect notifications to workflows/tasks. Avoid storing notification bodies in operational logs; retain minimal diagnostic data.

Audit records must distinguish queued, sent, provider-acknowledged, device-delivered, displayed, and user-read states. Delivery receipts are accepted only from authenticated channel/device adapters and validated against notification identity.

## 11. Android-first and cross-platform behavior

Android is the primary mobile target. The implementation must use Android-supported notification channels, runtime permission flows, WorkManager/AlarmManager or other appropriate OS mechanisms according to exact timing needs and platform policy. Exact alarms require applicable permission and justification; do not assume they are universally available.

On Windows, Linux, macOS, web, wearables, vehicles, and smart-home endpoints, delivery uses registered adapters and declared capabilities. If a channel is unavailable, the manager reports the limitation and follows the user's configured fallback; it does not silently invent another destination.

## 12. Verification requirements

Tests must cover timezone and daylight-saving transitions, recurring schedule bounds, scheduler restart and duplicate firing, quiet hours, critical overrides, snooze/cancel races, permission revocation, offline delivery, provider timeout with unknown outcome, retries and deduplication, frequency caps, channel fallback, payload redaction, consent revocation, deletion/retention, forged receipts, deep-link authorization, and Android process death/background restrictions.

Property-based tests should assert that a schedule cannot generate occurrences after cancellation/expiry, routine notifications never bypass quiet hours, sensitive payloads never route to an insufficient channel, and receipt states are never inferred without evidence.

## 13. Integration and implementation status

The intended flow is: authorized schedule/request or Event Bus fact -> NRM validation and policy check -> durable schedule/outbox -> due-time scheduler -> preference/privacy/channel selection -> channel adapter -> authenticated receipt/reconciliation -> audit and lifecycle event.

**Implementation status:** this document defines the architecture only. No scheduler, notification database, Android notification adapter, push provider, recurrence engine, preference UI, or automated tests are implemented by this change. No production configuration or deployment is changed.
