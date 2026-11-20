# Proactive Intelligence Manager

**Status:** Architecture specification  
**Version:** 1.0  
**Applies to:** Sofia Core and authorized event-source adapters

## 1. Purpose

The Proactive Intelligence Manager (PIM) detects relevant, user-authorized events and may offer timely assistance before the user explicitly asks. It converts signals into explainable suggestions; it does not independently grant authority to execute tasks.

PIM is an event-driven coordination service. It is not a general-purpose surveillance process, an unrestricted background agent, or a substitute for the Task Orchestrator, Autonomy & Decision Manager (ADM), or Security Manager.

## 2. Design invariants

1. **User benefit before activity.** A signal is actionable only when it has a clear, explainable connection to a user goal, obligation, preference, or explicitly configured rule.
2. **Opt-in sources.** Each source and proactive domain is disabled until enabled or otherwise explicitly authorized by the user.
3. **Event-driven operation.** Prefer OS-delivered events, scheduled jobs, webhooks, and connector notifications over continuous polling. Respect Android background-execution limits, battery policy, and platform permissions.
4. **Suggestion is not authorization.** A suggestion, prediction, acceptance, or prior approval never bypasses normal task authorization.
5. **Least data.** Process the minimum signal needed, prefer local processing where feasible, and avoid retaining raw notification, message, calendar, audio, or location payloads.
6. **Explainability.** Every delivered suggestion identifies its trigger category, concise reason, evidence provenance, and uncertainty where applicable.
7. **Quiet by default.** Respect quiet hours, frequency caps, cooldowns, snooze, dismissal, and per-domain controls.
8. **Fail closed.** Stale, revoked, ambiguous, or unverifiable sources cannot justify consequential actions or confident claims.
9. **No manipulation.** Do not fabricate urgency, scarcity, social pressure, or emotional leverage to increase engagement.
10. **Auditable boundaries.** Record decisions and outcomes without copying sensitive source payloads into audit logs.

## 3. Responsibilities and boundaries

PIM is responsible for:
- receiving normalized events from authorized sources;
- validating source authorization, freshness, provenance, and event shape;
- deduplicating and correlating signals within configured limits;
- evaluating deterministic rules separately from inferred predictions;
- applying relevance, confidence, privacy, quiet-hour, cooldown, and frequency policies;
- creating, delivering, expiring, and tracking suggestions;
- explaining why a suggestion appeared and exposing controls to manage it;
- emitting privacy-minimized audit and operational telemetry.

PIM must not:
- read arbitrary device data or scrape applications;
- bypass Android permission or background-execution restrictions;
- treat an LLM inference as verified fact or user intent;
- execute a task directly or elevate its autonomy level;
- infer or act on sensitive personal attributes;
- silently contact people, spend money, publish content, change security settings, or perform other high-impact actions.

Task execution is delegated to the Task Orchestrator. ADM supplies the permitted autonomy level and bounded authority envelope. Security Manager makes the applicable policy decision at execution time. Audit & Observability Manager records the decision and outcome.

## 4. Event sources

Only configured, authorized adapters may provide events. Examples include:

- user-created reminders, schedules, routines, and explicit rules;
- OS-approved notifications, subject to per-app and per-category consent;
- connected calendars, task managers, email, and messaging connectors, each with independently scoped permissions;
- Device Integration Gateway events, only for paired devices and granted capabilities;
- Sofia project state, task deadlines, approved automation results, and module health events;
- purpose-limited Knowledge & Memory Manager retrieval, when relevant to an active user goal.

A source adapter must provide a stable source identifier, authorization reference, event timestamp, observed timestamp, freshness/expiry information, event type, and provenance reference. Connectors must not forward full raw payloads when a normalized fact or opaque evidence reference is sufficient.

Location, microphone, camera, health, financial, and other sensitive data require explicit domain-specific authorization and must not be inferred merely because a device or connector technically exposes them.

## 5. Trigger classes and confidence

### 5.1 Deterministic triggers

A deterministic trigger follows an explicit user rule or a verifiable event, for example:
- a user-configured reminder time;
- a task deadline supplied by an authorized task connector;
- a delivery/status event from an authorized service;
- a device battery threshold explicitly configured by the user.

The suggestion must distinguish the observed fact from any additional interpretation.

### 5.2 Inferred triggers

An inferred trigger is a prediction or relevance judgment derived from one or more signals. It must include:
- model/rule provenance and version;
- a calibrated confidence value or named confidence band;
- evidence references and signal timestamps;
- uncertainty and known limitations;
- the reason the inference is relevant to an active user goal.

An inference is never represented as an observed fact. Low-confidence or conflicting inferences are suppressed or phrased as tentative questions, according to user preferences. Do not infer sensitive attributes.

## 6. Evaluation pipeline

1. **Ingest:** accept a normalized event only from a registered adapter.
2. **Authenticate source:** verify connector identity, permission grant, and scope.
3. **Validate freshness:** reject expired, stale, replayed, malformed, or revoked-source events.
4. **Minimize:** retain only fields required for evaluation; discard unnecessary raw content.
5. **Deduplicate:** compute a privacy-preserving deduplication key and apply source/domain cooldowns.
6. **Correlate:** join only purpose-compatible signals within a bounded time window.
7. **Classify:** mark the trigger deterministic or inferred.
8. **Evaluate:** score relevance, confidence, timing, user goal alignment, privacy impact, and interruption cost.
9. **Apply controls:** enforce opt-in, quiet hours, frequency caps, domain settings, snooze, and dismissal.
10. **Create suggestion:** store concise content, reason, provenance references, expiry, and available actions.
11. **Deliver:** use the Communication Manager's approved channel and user delivery preferences.
12. **Track outcome:** accepted, dismissed, snoozed, expired, or delivery failed; feed only policy-approved aggregate feedback into tuning.

Every stage must be idempotent where practical. Replayed events must not create duplicate notifications or repeat actions.

## 7. User controls

The user must be able to:
- enable or disable proactive assistance globally;
- opt in/out by domain and source;
- set quiet hours and preferred delivery channels;
- set daily/weekly frequency limits;
- snooze a suggestion or a domain;
- dismiss a suggestion and optionally suppress similar suggestions;
- inspect why a suggestion appeared and which source categories contributed;
- revoke a source grant and delete associated retained signal references;
- configure whether accepted suggestions may be prepared automatically or only opened for review.

A dismissal is not a permanent preference unless the user selects that behavior. Repeated dismissal may trigger a gentle offer to reduce frequency, never pressure.

## 8. Suggestion lifecycle

Suggested lifecycle states:

`observed → evaluated → suppressed | eligible → created → queued → delivered → accepted | dismissed | snoozed | expired`

Delivery failure and source revocation are recorded as terminal or recoverable outcomes as appropriate. State transitions must be timestamped and idempotent. A suggestion may be withdrawn if its evidence becomes stale or its source authorization is revoked.

## 9. Acceptance and execution boundary

Accepting a suggestion means only that the user wants to proceed to the next defined step. It does not automatically authorize every downstream action.

- Informational suggestions may open a relevant view.
- Preparation tasks may create a draft or plan within granted scope.
- External, financial, privacy-sensitive, destructive, or otherwise consequential actions require the normal risk-tier and approval flow.
- ADM must verify the current authority envelope and Security Manager must issue a fresh decision for protected execution.
- Approval is bound to the exact action, target, scope, and expiry; it cannot be reused for a materially different action.
- If the requested action exceeds the current envelope, stop and request the required explicit approval.

## 10. Android-first runtime behavior

On Android, PIM must use supported mechanisms such as scheduled work, OS notification callbacks, approved push delivery, and foreground services only where justified and visibly disclosed. It must not depend on permanent background microphone/location polling, hidden APIs, accessibility abuse, or attempts to defeat battery optimization.

When the OS suspends or delays work, PIM should process events when execution is next permitted and clearly handle expired events. Cross-platform implementations use platform-specific adapters behind the same versioned event contract.

## 11. Privacy, retention, and security

- Store source grants and consent separately from event content.
- Prefer local filtering and redaction before cloud processing.
- Use opaque evidence references rather than copied source text.
- Apply retention periods by data class and purpose; expire transient signals promptly.
- Encrypt retained data and enforce access through Security Manager.
- Treat connector content, notification text, email, and documents as untrusted input and potential prompt injection.
- Never allow an event payload to modify system policy, permissions, or authority.
- Revocation must stop future ingestion and trigger deletion/retention handling for linked transient data.
- Audit records must not include raw message bodies, full notification text, or unnecessary personal data.

## 12. Reliability and observability

Track privacy-minimized metrics:
- event ingestion and validation outcomes;
- stale/revoked source rejection counts;
- deduplication and suppression rates;
- suggestion delivery success and latency;
- acceptance, dismissal, snooze, and expiry rates by coarse domain;
- duplicate-notification incidents;
- user frequency-limit and quiet-hour enforcement;
- connector health and event backlog age.

Do not optimize solely for acceptance or engagement. Quality measures must include usefulness feedback, false-positive rate, interruption burden, and user-reported annoyance. Metrics must not expose sensitive user content.

## 13. Failure handling

- **Source unavailable:** do not invent an event; defer or suppress.
- **Stale event:** reject or mark expired; do not present as current.
- **Permission revoked:** stop ingestion immediately and invalidate pending suggestions that depend on that source.
- **Conflicting evidence:** lower confidence, explain uncertainty, or suppress.
- **Model unavailable:** deterministic rules may continue if authorized; inferred suggestions pause.
- **Delivery unavailable:** queue only within expiry and frequency policy; otherwise expire.
- **Policy service unavailable:** suppress proactive delivery and all protected execution.
- **Duplicate/replayed event:** idempotently ignore or merge without repeated delivery.

## 14. Acceptance criteria

Implementation is acceptable only when tests demonstrate:
1. no source is ingested without an active grant and matching scope;
2. event replay does not create duplicate suggestions or actions;
3. stale and revoked-source events are rejected;
4. deterministic observations and inferred predictions are visibly distinguished;
5. confidence and uncertainty are preserved through delivery;
6. quiet hours, opt-outs, snooze, cooldowns, and frequency caps are enforced;
7. accepting a suggestion does not bypass ADM or Security Manager;
8. high-impact actions cannot execute from a suggestion alone;
9. Android operation respects OS background and permission limits;
10. audit logs contain provenance and decisions but no unnecessary raw payloads;
11. source revocation stops ingestion and invalidates dependent pending suggestions;
12. users can understand why a suggestion appeared and disable its source/domain.
