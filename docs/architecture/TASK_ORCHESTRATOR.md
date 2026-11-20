# Sofia AI Task Orchestrator — Foundation v1

## Status and purpose

This document defines the central orchestration service. It is a design contract, not a claim that a production orchestrator is already implemented. The current application and production branch remain unchanged.

The Task Orchestrator converts an owner request or trusted system event into a bounded execution plan, selects eligible capabilities/modules, coordinates dependencies and runtime resources, and verifies outcomes. It is not itself an authority source: it cannot grant permissions, authenticate the owner, bypass policy or manufacture tool results.

## 1. Architectural position

The Orchestrator coordinates, but does not replace:

- **IAM:** establishes principal and authentication context.
- **Security Manager:** makes authorization decisions and enforces grants.
- **Module/Capability Registry:** provides validated module metadata and capability contracts.
- **Device Manager:** exposes registered device adapters and device capability state.
- **Resource & Runtime Manager:** admits work, assigns budgets and manages task lifecycle.
- **Audit & Observability Manager:** records decisions, transitions, outcomes and failures.
- **Provider adapters:** execute bounded model, translation, speech, vision or external-service requests.

All calls to protected capabilities pass through the Security Manager's policy enforcement boundary.

## 2. Non-negotiable invariants

1. The owner request is the goal; model-generated plans are proposals, not authority.
2. No task executes without a valid principal/session context appropriate to its risk.
3. Every protected step is authorized immediately before execution, using current policy and grant state.
4. The Orchestrator never widens permissions or treats module declarations as granted access.
5. Only validated, active, compatible modules and capabilities may be selected.
6. Every step has bounded inputs, outputs, timeout, retry policy and resource budget.
7. Consequential side effects require approval bound to the exact canonical action and target.
8. Untrusted content remains data; it cannot alter identity, policy, grants or confirmation state.
9. External side effects use idempotency keys and reconciliation before retry.
10. Plans are observable, cancellable and recoverable where semantics permit.
11. Unknown dependencies, ambiguous intent and unsupported operations fail safely.
12. The owner can inspect what the Orchestrator intends to do and what it actually did.

## 3. Request intake and normalization

Normalize incoming requests into a typed task request containing:
- requester principal/session references;
- user goal and interaction modality;
- task category and risk estimate;
- required capabilities and data classes;
- constraints, deadline and resource preferences;
- confirmation requirements;
- correlation ID and provenance references.

Preserve the original user intent and provenance. Do not silently convert an ambiguous request into a high-impact action. Ask a focused clarification when a missing parameter changes the target, cost, recipient, privacy exposure or irreversible effect.

## 4. Planning model

Represent an execution plan as a directed acyclic graph (DAG) of bounded steps. Each step declares:
- step ID and dependency IDs;
- capability and eligible module constraints;
- typed input/output contract references;
- resource budget reference and timeout;
- risk tier and approval requirement;
- idempotency and retry semantics;
- expected side effect and verification method;
- compensation or recovery strategy where available.

Reject cyclic dependencies, missing contracts, undeclared side effects, unbounded loops and plans exceeding global limits. Plans must be versioned and carry a digest so that approval and audit refer to the exact plan revision.

## 5. Capability and module selection

Select candidates from the validated registries using:
- capability contract and version compatibility;
- module lifecycle state and provenance/trust status;
- platform/device availability;
- permission and data-classification requirements;
- quality, reliability, latency, privacy and cost constraints;
- current health, quotas and resource budget;
- owner preferences and configured provider policy.

Do not route solely by model preference or module self-rating. If no eligible candidate exists, explain the missing capability rather than selecting an untrusted substitute.

## 6. Execution protocol

For each step:

1. Confirm dependencies completed and inputs satisfy the declared schema.
2. Resolve current owner/session and module identity context.
3. Request a fresh policy decision from Security Manager for the exact capability, operation, resource and purpose.
4. If approval or step-up is required, pause and obtain the action-bound owner response.
5. Ask Resource & Runtime Manager to admit the step and issue its budget.
6. Emit the required audit event before a protected side effect when policy requires durable pre-action evidence.
7. Invoke the adapter through the approved execution boundary with a bounded, typed request.
8. Validate output against the declared contract; never trust free-form claims of success.
9. Verify external side effects using an independent read-back or receipt where feasible.
10. Record outcome and release resource reservations.

A policy decision, approval or resource reservation expires and must be re-evaluated if the step materially changes or waits beyond its validity window.

## 7. Risk, approval and change control

Classify steps using the Security Manager's risk catalogue. Unknown actions default to the restrictive tier. Approval must display the exact action, destination/target, relevant amount or scope, and expected consequence. Any material change invalidates approval.

A plan-level approval may cover multiple steps only when the complete plan is deterministic, bounded, fully displayed and explicitly approved as a whole. Otherwise use per-step approval.

## 8. Failure, retry and compensation

- Retry only errors classified as transient and only within declared limits.
- Use exponential backoff with jitter and a bounded attempt count.
- Never blindly retry a non-idempotent external action.
- Before retrying after timeout, reconcile whether the side effect already occurred.
- If a step fails, stop dependent steps; continue independent branches only if the plan's failure policy explicitly permits it.
- Use compensation only when a tested compensating action exists and is itself authorized.
- Do not claim rollback when an external side effect cannot be reversed.
- Preserve partial completion and clearly report completed, failed, skipped and uncertain steps.

## 9. Cancellation and emergency stop

Owner cancellation stops admission of new steps immediately. In-flight operations receive cancellation signals; the Orchestrator waits for safe termination or reports that an external operation may still complete. Emergency stop takes precedence, blocks new protected work and triggers the Security Manager's revocation controls. Queued work is reauthorized before any later resumption.

## 10. Checkpointing and recovery

Persist only the minimum state needed to resume: plan version/digest, completed step references, validated outputs or secure references, pending dependencies, idempotency keys, authorization references and resource/runtime state. Protect checkpoints at rest. On restart, revalidate session, grants, module status, policy version, deadlines and external side effects before continuing.

## 11. Concurrency and prioritization

Use Resource & Runtime Manager priority classes and budgets. P0/P1 work must not be starved by background tasks. Enforce per-module and per-provider concurrency limits, fairness within a priority class and global task quotas. Parallelize only independent DAG branches and only when doing so does not alter user-visible ordering or safety.

## 12. Audit and user transparency

Record request intake, plan digest, candidate selection rationale, policy decisions, approval references, resource admission, step transitions, adapter invocation references, output validation, side-effect verification, retries, cancellation and final summary. Do not log secrets or unnecessary private payloads.

For owner-facing status, distinguish:
- planned;
- waiting for approval;
- running;
- completed and verified;
- completed but not independently verified;
- partially completed;
- failed;
- cancelled;
- outcome uncertain.

## 13. Acceptance tests

1. A model-generated plan cannot execute a protected capability without a current Security Manager decision.
2. A revoked grant blocks the next step, even if the plan was previously approved.
3. Changing a protected step's target invalidates its approval.
4. Untrusted webpage/OCR/audio content cannot add steps with authority or suppress confirmation.
5. An inactive, quarantined or incompatible module is never selected.
6. Invalid input/output contracts stop the affected step.
7. Timeouts do not cause duplicate non-idempotent external actions.
8. Restart recovery rechecks authorization and reconciles uncertain side effects.
9. Owner cancellation stops queued work and safely signals in-flight work.
10. Resource pressure defers or reduces eligible tasks without bypassing policy.
11. Audit records link all steps to one correlation ID and exact plan digest.
12. Partial completion is reported accurately; no fabricated success or rollback claim.

## 14. Implementation boundary

The Orchestrator exposes versioned request, planning, execution, cancellation, checkpoint and status APIs. It must depend on the shared contracts and registries rather than hard-code provider-specific behavior. Platform-specific execution adapters remain behind the same policy and audit boundaries.
