# Calendar & Scheduling Manager

**Status:** architecture specification; runtime implementation is pending.  
**Contract baseline:** JSON Schema Draft 2020-12. Versioning follows [CONTRACT_AND_IDENTIFIER_STANDARDS.md](CONTRACT_AND_IDENTIFIER_STANDARDS.md).

## 1. Purpose

Calendar & Scheduling Manager (CSM) manages calendar connections, event and appointment metadata, availability queries, scheduling proposals, and synchronization status. It coordinates with Reminder Manager and Workflow & State Manager but does not replace either.

The manager must distinguish confirmed calendar facts from inferred availability, tentative proposals, and user preferences. It must never create, modify, invite, cancel, or disclose an event without the required account scope and authorization.

## 2. Responsibility boundaries

- CSM owns calendar-provider adapters, calendar selection, event metadata normalization, availability interpretation, and scheduling operations.
- Automation & Integration Manager supplies approved calendar adapters and connection lifecycle.
- Identity & Authentication Manager resolves the user and connected account.
- Security Manager authorizes every read or write operation.
- Privacy & Data Governance Manager controls event data, attendee data, purpose, retention, and disclosure.
- Autonomy & Decision Manager determines whether the operation is within granted authority and whether confirmation is required.
- Task Orchestrator coordinates multi-step planning.
- Workflow & State Manager owns durable workflow state, retries, checkpoints, and recovery.
- Notification & Reminder Manager owns reminder delivery and notification preferences.
- Resource & Runtime Manager enforces quotas, deadlines, and concurrency.
- Audit & Observability Manager records access and side effects.

Calendar read access does not imply write access. Access to one calendar does not imply access to every calendar belonging to an account or organization.

## 3. Calendar connections and permissions

Connections are scoped to a provider account and explicitly selected calendars. Requested scopes must be least-privilege and visible to the user. Credentials remain in the protected vault managed by the integration layer.

Connection states include authorization pending, active, reauthorization required, revoked, expired, disabled, and error. CSM must handle revoked scopes, account changes, provider outages, and permission changes without silently switching accounts.

## 4. Event model

Events may include title, description, start/end, timezone, location, attendees, organizer, recurrence, visibility, reminders, conference details, provider identifiers, and synchronization metadata. Fields are optional according to provider capability and user permission.

The normalized model must preserve:
- source provider and calendar;
- original provider event reference;
- event timezone and local wall-clock intent;
- UTC instants where known;
- all-day versus timed event distinction;
- recurrence definition and exceptions;
- tentative/confirmed/cancelled status;
- last provider update and local observation time.

Do not invent missing attendees, locations, or event details. Treat imported event text and attachments as untrusted content, not executable instructions.

## 5. Time zones, recurrence, and daylight saving

All persisted instants use explicit timezone-aware timestamps. Preserve the event's IANA timezone identifier when available. All-day events are date ranges, not midnight UTC timestamps.

Recurring events require explicit recurrence rules, exceptions, and provider-specific capability handling. Daylight-saving transitions, ambiguous local times, nonexistent local times, travel across time zones, and calendar-specific week starts must be tested.

Never silently shift a user's intended wall-clock time when converting zones. When an input time is ambiguous, ask the user to clarify rather than guessing.

## 6. Availability and scheduling

Availability queries declare calendar scope, time window, timezone, working hours, buffers, travel time, and relevant constraints. Results distinguish busy, free, tentative, unknown, and inaccessible intervals.

Availability is advisory and can become stale immediately. A proposed slot must be rechecked with the provider immediately before a write. Avoid double-booking by using provider conditional writes, revision/ETag checks, or equivalent concurrency controls where available.

Scheduling proposals should present relevant alternatives and explain conflicts. The system must not infer that a user is free merely because no event is visible; calendars may be incomplete or inaccessible.

## 7. Create, update, invite, and cancel

Every write request specifies the exact account, calendar, event or invitees, time, timezone, content, visibility, and operation. High-impact or externally visible changes—especially sending invitations, changing attendee lists, cancelling events, or sharing private event details—require fresh, action-specific confirmation.

Approval is bound to the exact operation parameters. If title, time, timezone, calendar, attendees, location, or visibility changes after approval, approval is invalidated and must be obtained again where required.

Distinguish local draft, provider-accepted, synchronized, invitation-sent, and independently verified states. A successful API response must not be overstated as proof that every attendee received or accepted an invitation.

## 8. Reminders and notifications

CSM stores event reminder configuration when supported by the provider. Notification & Reminder Manager is responsible for actual reminder schedules and delivery. Avoid duplicate reminders across provider and local notification channels; reconcile ownership and deduplicate by event, reminder, and occurrence.

Quiet hours, timezone changes, notification permissions, delivery failures, and device migration must be respected.

## 9. Synchronization and conflict handling

Use provider cursors, delta tokens, ETags, revisions, or equivalent mechanisms when available. Support bounded incremental sync, pagination, rate limits, and webhook verification. Handle duplicated, delayed, and out-of-order updates.

Do not overwrite concurrent user edits silently. Detect conflicts, preserve provider revision references, and request resolution when automatic merge is unsafe. Unknown write completion must be reconciled before retrying to prevent duplicate events or invitations.

## 10. Privacy and security

Calendar content can reveal sensitive personal, work, medical, financial, and relationship information. Apply purpose limitation, minimization, classification, consent, retention, and user-controlled disconnect/export/deletion. Do not send event descriptions, attendee lists, or attachments to AI providers unless necessary, permitted, and disclosed.

Protect against malicious event descriptions, prompt injection, forged webhooks, cross-account leakage, unauthorized attendee disclosure, and calendar-sharing escalation. Redact secrets and minimize event content in logs.

## 11. Android-first and cross-platform

Android is the primary client. Respect runtime permissions, provider authentication, background execution limits, notification permissions, battery/network budgets, and process death. Support explicit OS calendar hand-off where direct provider access is unavailable or not authorized.

Windows, Linux, macOS, and web clients use provider adapters behind the same contracts. Capabilities are discovered per provider, account, calendar, API version, and platform.

## 12. Verification requirements

Test timezone and DST boundaries, all-day events, recurrence exceptions, ambiguous local times, concurrent edits, ETag conflicts, duplicate invitations, stale availability, partial calendar access, revoked tokens, account mismatch, provider outage, webhook replay, prompt injection in event text, private-event disclosure, reminder deduplication, notification denial, process death, and uncertain write completion.

## 13. Implementation status

**Implementation status:** this change adds architecture and versioned contracts only. It does not connect calendar accounts, read or write events, send invitations, synchronize calendars, or schedule live reminders. No production configuration or existing prototype data is changed.
