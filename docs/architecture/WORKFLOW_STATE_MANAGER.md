# Workflow and State Manager

**Status:** architecture specification; runtime implementation is pending.  
**Contract baseline:** JSON Schema Draft 2020-12. Schema documents use `schema_version`; public interfaces use `contract_version`, following [CONTRACT_AND_IDENTIFIER_STANDARDS.md](CONTRACT_AND_IDENTIFIER_STANDARDS.md).

## 1. Purpose and boundaries

The Workflow and State Manager (WSM) owns durable lifecycle state for multi-step workflows and long-running tasks. It coordinates state transitions, waits, deadlines, pause/resume, cancellation, checkpoints, recovery, and compensation tracking.

It does not replace Sofia Core, Task Orchestrator, Security Manager, Identity & Authentication Manager, Resource & Runtime Manager, Event Bus, or the independent verifier. The Task Orchestrator plans and dispatches work; WSM persists and validates workflow lifecycle. The Event Bus communicates lifecycle facts asynchronously. Immediate request/response operations remain synchronous where appropriate.

A workflow definition describes an allowed process. A workflow instance is one execution of that definition. A transition is a validated state change. A checkpoint is a recoverable snapshot/reference, not proof that external side effects did or did not occur.

## 2. State model

The canonical lifecycle states are:
- `created`: instance recorded but not yet eligible to execute;
- `ready`: prerequisites satisfied and eligible for scheduling;
- `running`: one or more authorized steps are executing;
- `waiting`: blocked on an event, timer, approval, resource, or external dependency;
- `paused`: explicitly or policy-driven suspended state;
- `succeeded`: all required terminal conditions met;
- `failed`: execution terminated unsuccessfully;
- `cancelled`: cancellation accepted and no further cancellable work should start;
- `compensating`: approved compensating actions are being tracked;
- `compensated`: required compensations completed;
- `expired`: workflow deadline/TTL elapsed before successful completion.

Terminal states are `succeeded`, `failed`, `cancelled`, `compensated`, and `expired`. A terminal state is immutable except for separately recorded administrative annotations or a new linked workflow; never rewrite historical execution to conceal an outcome.

Allowed transitions are definition- and policy-constrained. Examples include created->ready, ready->running, running->waiting, waiting->ready, running->paused, paused->ready, running->succeeded/failed, and running->cancelled. Compensation is a distinct, explicitly authorized path. A transition not declared by the workflow definition or lifecycle policy MUST be rejected.

## 3. Definitions and instances

Definitions are versioned, immutable after publication, and include:
- stable workflow type and definition version;
- owner module and allowed initiators;
- initial state and allowed transition graph;
- step references and dependency rules;
- input/output schemas and data classification;
- timeout, deadline, retry and resource policies;
- pause, cancellation and compensation semantics;
- checkpoint and recovery requirements;
- retention and privacy requirements.

An instance pins the exact definition version used at creation. Updating a definition does not silently mutate active instances. Migration of a running instance requires an explicit, versioned migration plan, compatibility checks, audit evidence, and rollback strategy.

## 4. Transition protocol and concurrency

Every state change is a compare-and-swap operation against the expected current state and monotonically increasing revision. The runtime validates:
1. authenticated initiator and tenant/principal scope;
2. current authorization and required approval;
3. allowed source->target transition;
4. expected revision and transition idempotency key;
5. prerequisites, deadlines, resource budget, and cancellation state;
6. required durable side-effect/outbox records.

A successful transition atomically persists the new state, revision, transition record, and corresponding outbox event where the storage architecture supports a transaction. If atomic cross-system commit is unavailable, use a durable outbox/inbox and reconciliation process; do not claim distributed exactly-once semantics.

Concurrent workers use leases with expiry and fencing tokens. A stale worker whose lease/fencing token is no longer current cannot commit state or publish a completion as authoritative. Lease expiry triggers reconciliation, not an assumption that the prior external action did not happen.

## 5. Waiting, timers, and approvals

Waiting instances declare a typed wait condition, correlation key, deadline, and allowed resume event types or approval sources. Event Bus delivery is deduplicated; the WSM validates the event against the wait condition and current policy before resuming.

Timers use persisted deadlines and scheduler wake-ups, not in-memory sleeps as the sole source of truth. Clock values are UTC; runtime should tolerate delayed timer delivery and re-check the deadline on wake.

Approval waits bind to a specific action, data scope, risk tier, requester, expiry, and approver authority. An approval is not reusable for a materially changed action. Model-generated content or an event payload cannot create approval or raise authority.

## 6. Pause, resume, and cancellation

Pause prevents new steps from starting and requests cooperative suspension of cancellable in-flight steps. It does not guarantee that an already-issued external operation can be stopped.

Resume revalidates current policy, permissions, consent, definition compatibility, resource budgets, and dependency state. Revoked permissions or consent remain revoked.

Cancellation is a request followed by an observed outcome. The manager records whether work was stopped, completed before cancellation, or requires reconciliation. Cancellation cannot reverse an irreversible completed side effect. Where defined and authorized, compensation is represented as explicit steps and tracked through `compensating` and `compensated` states.

## 7. Retries, idempotency, and side effects

Retry policy is step-specific and bounded. Use exponential backoff with jitter, maximum attempts, deadlines, and fault-isolation policies. Retry only when the failure classification and operation semantics permit it.

Every step that may cause an external side effect must declare an idempotency strategy and reconciliation behavior. A timeout or worker crash produces an `unknown` outcome until checked against the external system or a durable operation record. Never blindly retry a non-idempotent payment, message, device command, or other consequential operation.

## 8. Checkpoints and recovery

Checkpoints are created at declared safe boundaries and include workflow/definition identity, revision, completed-step references, pending work, relevant state references, integrity metadata, and creation time. Minimize sensitive data; prefer encrypted references to copying large payloads.

Recovery procedure:
1. load the latest valid checkpoint and transition journal;
2. verify integrity, definition compatibility, permissions, consent, and retention;
3. inspect leases and reconcile any in-flight/unknown side effects;
4. reconstruct only durable state;
5. resume from a safe boundary or enter failed/manual-review state;
6. emit an auditable recovery event.

A checkpoint is not permission to replay actions. Recovered workflows re-check current authorization and policies. If integrity or compatibility cannot be established, fail closed and require review.

## 9. Security, privacy, and audit

- WSM accepts lifecycle operations only from authenticated, authorized callers.
- A workflow definition cannot grant its owner permissions or bypass Security Manager decisions.
- Inputs, events, tool outputs, and restored checkpoint data are untrusted until validated.
- Every transition records actor, reason code, previous/new state, revision, correlation/causation IDs, timestamp, and policy decision reference.
- Sensitive values are classified, minimized, encrypted at rest/in transit, access-controlled, and retained/deleted under Privacy & Data Governance rules.
- Audit records are append-only under the audit subsystem; operational state may be compacted only without destroying required evidence.
- Administrative force-transition is disabled by default; if later introduced, it requires narrowly scoped privilege, reason, dual control for high impact, and immutable audit evidence.

## 10. Android and cross-platform behavior

Android execution may be interrupted by process death, Doze, battery restrictions, connectivity loss, or OS scheduling. Persist state before yielding, use platform-compliant scheduled work, and reconcile on the next permitted execution window. Do not rely on a permanently running service.

The same workflow contracts and transition semantics apply across Android, web, Windows, Linux, and macOS; platform-specific schedulers and storage adapters may differ.

## 11. Verification requirements

Tests must cover valid/invalid transition graphs, revision conflicts, duplicate commands/events, lease expiry and fencing, process crashes at every persistence boundary, timer delays, approval expiry, pause/resume/cancel races, retries, unknown external outcomes, compensation, checkpoint corruption, definition migration, permission/consent revocation, retention/deletion, and recovery under Android process death.

Property-based/state-machine tests should assert that terminal states cannot silently reopen, stale workers cannot commit, unauthorized transitions never persist, and recovery never duplicates non-idempotent effects.

## 12. Integration and implementation status

The intended flow is: authenticated request/event -> WSM transition validation -> durable state/journal + outbox -> Task Orchestrator scheduling -> step execution -> result/event -> validated next transition. All consequential step execution still passes through Security Manager and applicable approval gates.

Introduce WSM incrementally behind the existing API Gateway using the Strangler Pattern. Preserve the current chat UI, history, and local storage keys during later migration.

**Implementation status:** this document and its contracts define the design only. No workflow database, state machine runtime, scheduler, lease service, checkpoint store, recovery worker, or tests are implemented by this change. No production configuration or deployment is changed.
