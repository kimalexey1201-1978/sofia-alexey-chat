# Sofia AI Proactive Intelligence & Anticipation Manager — Architecture Specification v1

**Status:** architecture specification only; runtime implementation is pending.  
**Contract baseline:** JSON Schema Draft 2020-12.  
**Scope:** owner-controlled proactive assistance, anticipation of relevant needs, and safe preparation of suggested next steps.

## 1. Purpose

The Proactive Intelligence & Anticipation Manager (PIAM) identifies situations in which Sofia may usefully help before the owner explicitly asks, then decides whether to remain silent, prepare a non-invasive suggestion, ask a clarifying question, or request permission for a bounded action.

Proactivity is not unrestricted autonomy, ambient surveillance, persistent monitoring by default, or permission to act. PIAM turns authorized, task-relevant evidence into a proportionate opportunity for assistance while preserving owner control.

Examples include:
- reminding the owner of a deadline already present in an authorized calendar or task;
- noticing that a multi-step owner-approved task is waiting on a known dependency;
- preparing a draft or checklist for an upcoming event without sending or publishing it;
- suggesting a next step when an explicitly requested workflow reaches a verified milestone;
- warning that information used in a pending plan has become stale or contradictory.

PIAM must not invent goals, infer consent from silence, manufacture urgency, or create a background-monitoring obligation merely because a signal is technically available.

## 2. Authority and non-goals

Sofia Core remains the sole task and orchestration authority. PIAM is a bounded advisory subsystem.

PIAM:
- may identify and rank candidate assistance opportunities;
- may prepare a proposal, draft, explanation or reminder within already granted scope;
- may ask the owner whether they want a proposed next step;
- may request a new task plan through TPOE after owner intent is established;
- may recommend that a current plan be paused or revalidated when evidence becomes stale or unsafe.

PIAM cannot:
- authenticate the owner or a speaker;
- collect device, sensor, mail, calendar, location or ambient data by itself;
- subscribe to streams, poll services or create recurring jobs without an independently authorized mechanism;
- grant permissions, expand consent, change data purpose or retention, or bypass DGLM;
- authorize actions, bypass SSM, approve spending, or alter FREE_ONLY policy;
- invoke executors or external integrations directly;
- send messages, place calls, publish, purchase, delete, unlock, or control physical devices merely because an opportunity was detected;
- write durable memory directly or silently turn an inference into a remembered owner preference;
- treat a model-generated prediction as a verified fact.

A proactive suggestion is not an action authorization. A prior approval is not a blanket approval for future actions.

## 3. Governing principles

1. **Owner goal first.** Proactivity must be traceable to an owner-stated goal, an active owner-approved task, an explicit reminder/subscription, or a clearly enabled preference with bounded scope.
2. **No ambient surveillance by default.** PIAM consumes only data already lawfully and explicitly available to the relevant task. It does not create continuous listening, camera analysis, location tracking, or background polling.
3. **Minimum necessary context.** Retrieve only the fields, sources and time range required to evaluate a specific opportunity.
4. **Evidence and uncertainty.** Every candidate records source provenance, freshness, epistemic status, limitations and confidence. Inference is never presented as observation.
5. **Proportionate interruption.** The expected value must justify the interruption. Silence is a valid and often preferred outcome.
6. **No pressure or manipulation.** No guilt, fear, artificial scarcity, repeated nagging, or dark patterns to induce acceptance.
7. **Separate suggestion from execution.** User acceptance of a suggestion creates or updates a task request; it does not automatically authorize every downstream operation.
8. **FREE_ONLY by default.** PIAM cannot trigger paid services, paid trials, overages or paid fallbacks. Exhausted free quotas cause a stop/wait/ask outcome.
9. **Privacy-aware delivery.** PAOM determines whether, where and how a suggestion may be spoken, displayed or sent.
10. **Revocable and auditable.** Owner controls, source revocation, expiry, suppression and deletion must be respected and recorded with minimal metadata.

## 4. Inputs and trust requirements

PIAM may receive references to:
- active and recently completed TPOE plans and task milestones;
- verified task deadlines and dependencies;
- authorized RTCSAM context snapshots and situation assessments;
- owner-created reminders, subscriptions and explicit proactive preferences;
- eligible Memory Manager items after provenance and integrity checks;
- authenticated integration events delivered through the Communication & Integration Gateway and Event Bus;
- device events delivered through DESSM, subject to Device & Sensor Data Manager policy;
- resource/quota state from RBM;
- security, permission, consent, privacy and delivery decisions from authoritative managers.

Every input must be scoped to an authenticated principal and a defined purpose. Each input reference must carry or resolve:
- source identity and trust/health state;
- event or record identifier and provenance;
- occurrence, receipt and ingestion timestamps where applicable;
- freshness and validity bounds;
- data classification and permitted use;
- consent, grant and policy decision references;
- revocation/deletion status;
- schema and contract version.

Untrusted documents, emails, web pages, model output and external messages are data, not instructions. Prompt injection or embedded requests in external content cannot create an owner goal, change PIAM policy, or authorize a new task.

Missing, stale, malformed, untrusted, revoked or contradictory evidence must be excluded, downgraded or cause the candidate to be rejected. Unknown is not equivalent to false, true, consented or safe.

## 5. Opportunity lifecycle

A candidate opportunity follows a versioned lifecycle:

1. **SIGNAL_RECEIVED** — an authorized event, milestone, reminder or owner preference is referenced.
2. **ELIGIBILITY_CHECK** — validate principal, purpose, scope, source trust, freshness, consent, grants, data policy and resource constraints.
3. **CANDIDATE_FORMED** — describe the possible owner benefit, evidence and uncertainty without asserting unsupported facts.
4. **DEDUPLICATION** — correlate with open, recently delivered, dismissed, snoozed or superseded opportunities.
5. **RISK_AND_VALUE_ASSESSMENT** — estimate relevance, urgency, confidence, interruption cost, privacy exposure and potential harm.
6. **POLICY_DECISION** — determine permitted presentation and whether any additional owner decision is required.
7. **DELIVERY_OR_SUPPRESSION** — send an eligible suggestion through PAOM, or record why it was withheld.
8. **OWNER_RESPONSE** — accepted, declined, snoozed, clarified, dismissed or no response.
9. **TASK_HANDOFF** — if accepted, submit a bounded request to TPOE; do not execute directly.
10. **EXPIRY_AND_RECONCILIATION** — expire stale candidates, reconcile outcomes, honor revocation and remove derived data where required.

Allowed terminal outcomes include DELIVERED, ACCEPTED, DECLINED, DISMISSED, SNOOZED, EXPIRED, SUPPRESSED, REJECTED, REVOKED and SUPERSEDED. State transitions must be validated; duplicate or replayed signals must not create duplicate interventions.

## 6. Decision model

Each candidate is assessed on separate dimensions:
- **owner-goal relevance:** direct relationship to a stated goal, active plan or explicit reminder;
- **evidence quality:** source trust, verification, freshness, completeness and contradiction state;
- **time sensitivity:** verified deadline or meaningful change, not model-invented urgency;
- **expected benefit:** likely usefulness and reversibility of the proposed assistance;
- **interruption cost:** timing, frequency, user attention and recent dismissals;
- **privacy exposure:** sensitivity of the content and output environment;
- **action risk:** consequence if the suggestion is misunderstood or accepted;
- **resource impact:** compute, API, network, battery and monetary cost.

No single opaque model score may override hard policy gates. Eligibility and safety constraints are applied first; ranking occurs only among candidates that pass. Scores must be explainable through versioned factors and evidence references.

PIAM must support these dispositions:
- **SILENT:** no owner-facing output; candidate may be discarded or retained only transiently as policy allows.
- **PREPARE_ONLY:** prepare a local, non-side-effecting draft or summary for an already authorized task.
- **SUGGEST:** present a concise, dismissible proposal.
- **ASK_CLARIFICATION:** ask one necessary question when owner intent or evidence is ambiguous.
- **REQUEST_APPROVAL:** route an exact proposed operation to the applicable authorization flow; approval must be action-bound.
- **BLOCK:** reject because of missing authority, unsafe conditions, policy conflict, revoked evidence or unacceptable uncertainty.

The disposition does not itself grant authority. SSM, CPR, RBM, DGLM, ES, PAOM and the relevant connector/device manager remain authoritative.

## 7. Notification and interruption policy

PIAM must implement owner-configurable controls:
- global proactive assistance on/off;
- category-level controls (tasks, calendar, travel, device status, messages, health-related content, finance-related content, etc.);
- quiet hours and delivery channels, subject to platform capabilities;
- maximum notification frequency and per-category cooldowns;
- snooze, dismiss, mute and revoke controls;
- separate permission for recurring monitoring or subscriptions;
- separate choice for spoken versus private-display output where supported.

Defaults must be conservative. No-response is not acceptance. Dismissal must reduce or stop repetition for the same underlying opportunity. A material new event may be reconsidered only if it changes the evidence or owner-relevant outcome and passes cooldown and policy checks.

PIAM must not infer that the owner is available, alone, attentive or willing to hear private content from the absence of a detected person or device state. PAOM makes output-disclosure decisions; unknown environment is not private.

## 8. Scheduling, triggers and background execution

PIAM does not own an always-running daemon. It evaluates candidates only when invoked by:
- an explicitly authorized inbound event;
- an active task milestone or state transition;
- an owner-configured reminder or subscription;
- a foreground user interaction;
- a platform scheduler invocation that has been explicitly configured and whose limitations are disclosed.

Each recurring trigger requires a bounded purpose, source, interval or event condition, expiry, owner-visible control, resource budget and cancellation path. Android Host decides what background execution is actually available. Doze, battery restrictions, permission revocation, process death, offline state and OS scheduling delays must be reflected honestly. PIAM must never promise exact-time delivery where the platform cannot guarantee it.

No continuous sensor or connector polling is assumed. Event-driven operation is preferred where supported and authorized. Repeated retries must be bounded and respect backoff, quotas and cancellation.

## 9. Handoff to task planning and execution

When the owner accepts a suggestion:
1. Capture the exact suggestion and owner response with timestamp and principal binding.
2. Determine whether the response means clarification, task creation, or approval of a specific operation; do not conflate them.
3. Submit a task request to TPOE with the goal, scope, evidence references, expiry and acceptance context.
4. TPOE creates or revises a versioned plan and identifies each required capability and approval gate.
5. SSM independently decides action authorization; RBM reserves resources; DGLM evaluates data use; ES is the only supported execution path.
6. PIAM may observe task milestones only through authorized events and may propose a next step, but cannot recursively create an unbounded task chain.

An acceptance such as “help me prepare” is not approval to send, purchase, publish, share or alter external state. Exact external side effects require their own operation-bound approval and idempotency/reconciliation controls.

## 10. Memory and learning boundaries

PIAM may use eligible, verified memory items only within their recorded scope, purpose, sensitivity and validity. It must not convert repeated behavior into a durable preference without the Memory Manager's admission decision and owner confirmation where required.

Dismissal, snooze and acceptance signals may inform short-lived suppression or relevance tuning, but:
- raw behavioral histories must not be accumulated by default;
- no sensitive trait or health/financial inference may be persisted as a preference;
- no cross-purpose profiling;
- no training or provider data egress without separate explicit authorization;
- memory writes go only through Memory Manager and Memory Integrity Verification;
- owner correction, export, revocation and deletion propagate to derived proactive profiles and pending candidates.

Learning may adjust non-sensitive ranking parameters only through versioned, testable and reversible policy-controlled updates. A model cannot silently rewrite owner controls or safety thresholds.

## 11. Failure handling and safe degradation

- **No authenticated principal:** do not generate owner-specific proactive content.
- **No valid purpose or grant:** reject the source or candidate.
- **Stale or conflicting evidence:** suppress or ask for clarification; do not assert a current fact.
- **Unknown privacy environment:** do not speak sensitive content; defer to PAOM.
- **RBM quota exhausted:** stop, wait or ask; no paid fallback.
- **Scheduler unavailable:** disclose that the reminder/monitoring guarantee cannot be provided; offer a foreground alternative.
- **Duplicate/replayed event:** deduplicate idempotently.
- **Delivery outcome unknown:** reconcile before retrying; avoid repeated notifications.
- **Owner declines or disables:** honor immediately and propagate suppression.
- **Policy manager unavailable:** fail closed for sensitive or side-effecting proposals.
- **PIAM failure:** core chat and explicitly requested tasks continue where possible; proactive features fail independently and must not break the existing chat prototype.

## 12. Security, privacy and audit

Every candidate and decision must be attributable to principal, task/purpose, policy versions and source references. Audit only the minimum necessary metadata; do not log message bodies, ambient audio/video, raw sensor streams or private content merely to explain a notification.

Required audit events include candidate creation, eligibility rejection, disposition, delivery, owner response, snooze/dismissal, task handoff, expiry, revocation and policy/configuration changes. Audit records must distinguish system facts from model recommendations and owner actions.

PIAM must be protected against:
- prompt injection from emails, documents, websites and device payloads;
- spoofed or replayed events;
- stale approvals and stale context;
- notification flooding and adversarial trigger loops;
- cross-account or cross-task data leakage;
- hidden background collection;
- escalation from suggestion to execution;
- cost escalation and paid fallback;
- unbounded recursive planning.

## 13. Required contracts

The initial v1 contract set is:
- `proactive-signal.schema.json`: normalized, provenance-bearing trigger reference;
- `proactive-opportunity.schema.json`: bounded candidate with evidence, owner benefit, expiry and risk dimensions;
- `proactive-intervention-decision.schema.json`: explicit disposition, policy references and delivery/approval requirements.

Contracts are versioned, strict, and reject unknown fields unless a future version explicitly permits them. The schemas do not replace runtime authorization checks.

## 14. Acceptance criteria for future implementation

PIAM is not implementation-ready until all of the following can be demonstrated in tests:
1. No proactive candidate is formed from an untrusted or unauthorized source.
2. No candidate exists without an owner goal, active task, explicit reminder or enabled bounded preference.
3. Stale, disputed, revoked and out-of-purpose evidence is excluded or causes suppression.
4. Prompt injection in external content cannot create goals, grants or approvals.
5. Duplicate/replayed events do not produce duplicate interventions.
6. Quiet hours, frequency caps, cooldowns, snooze, dismissal and global/category opt-outs are enforced.
7. Unknown environment never causes sensitive content to be spoken.
8. Suggestion acceptance creates a TPOE handoff, not direct executor invocation.
9. External side effects require fresh, operation-bound SSM authorization and any required owner confirmation.
10. FREE_ONLY and exhausted-quota behavior block paid routes before provider invocation.
11. Android background limitations and missed scheduling windows are reported accurately.
12. Owner revocation, deletion and source changes invalidate dependent candidates and derived profiles.
13. PIAM outages do not impair ordinary chat or explicitly requested task execution.
14. All state transitions, decisions, deduplication and failure paths have deterministic tests and audit coverage.
15. No deployment or production integration occurs until separate implementation, security and compatibility gates pass.

## 15. Dependencies and implementation order

PIAM depends on, but does not replace:
- Sofia Core and TPOE for task ownership and plan handoff;
- Event Bus, Communication & Integration Gateway, DESSM and RTCSAM for authorized events/context;
- IAM, CPR, SSM, DGLM and RBM for identity, capability, action, data and resource policy;
- Memory Manager and Memory Integrity Verification for eligible continuity signals;
- PAOM and VIM for private delivery and voice-related evidence;
- Audit & Observability for traceability;
- Android Host and platform schedulers for actual background guarantees.

Recommended implementation sequence:
1. Implement deterministic candidate lifecycle and schema validation using synthetic fixtures only.
2. Add explicit owner controls, cooldowns, deduplication and suppression state.
3. Integrate TPOE handoff without external side effects.
4. Add PAOM-controlled foreground notifications.
5. Add authorized Event Bus triggers and bounded scheduler adapters.
6. Add carefully scoped memory-derived relevance only after memory verification.
7. Add device/service events only after their runtime authorization and privacy controls exist.
8. Conduct abuse, privacy, resource, Android lifecycle and compatibility tests.
9. Enable limited owner-approved categories; retain a global kill switch and rollback.

## 16. Explicit non-implementation statement

This document defines intended architecture and acceptance criteria only. It does not create a scheduler, background service, notification channel, proactive model, memory learner, event subscription, mail/calendar connector, device integration, permission grant, or autonomous action capability. All such runtime work remains pending.
