# Sofia AI — Automation & Autonomous Workflow Engine

Status: architectural specification for review; not an implementation authorization.
Scope: future Sofia Core capability. This document does not change the current application or production behavior.

## 1. Purpose and design boundary

The Automation & Autonomous Workflow Engine (AWE) coordinates multi-step tasks across Sofia capabilities, tools, providers, devices, and external services. It is a Core-managed orchestration capability, not a model prompt and not an independent agent with unrestricted authority.

Sofia Core remains the policy and decision authority. Executors perform bounded operations under versioned contracts. AWE may plan, schedule, sequence, pause, resume, verify, and report work, but it cannot grant itself permissions or expand its own resource budget.

The initial implementation must be incremental. Core v0.1 remains inference-only; this specification does not authorize adding tools, persistent task execution, background services, or external actions to v0.1.

## 2. Core responsibilities

AWE is responsible for:
- converting an accepted user goal into a structured workflow;
- identifying dependencies, preconditions, expected outputs, and completion criteria;
- selecting eligible capabilities/executors through registries;
- estimating risk, cost, latency, resource use, and required permissions;
- enforcing approval gates before protected actions;
- executing steps with bounded retries, timeouts, and idempotency controls;
- validating outputs independently of the executor where practical;
- persisting workflow state and supporting safe pause/resume/recovery;
- reporting progress, decisions, failures, and completed outcomes;
- emitting auditable events for every state transition and consequential action.

AWE does not treat model-generated plans as trusted executable instructions, bypass Core policy or provider terms, silently switch providers when privacy/cost implications change, perform protected external actions without authorization, or claim completion solely because an executor returned success.

## 3. Workflow lifecycle and state machine

Canonical lifecycle:
1. Intake — capture the user's goal, constraints, deadline, and desired outcome.
2. Clarification — resolve material ambiguity; do not invent missing facts.
3. Planning — produce a typed workflow graph with steps, dependencies, inputs, outputs, and acceptance checks.
4. Risk and resource assessment — classify impact, reversibility, privacy, permissions, provider exposure, cost, and device/runtime requirements.
5. Authorization — verify existing grants and obtain explicit confirmation for actions that require it.
6. Ready — freeze the approved plan version and execution parameters.
7. Execution — run eligible steps through registered executors.
8. Verification — independently check results, invariants, and required postconditions.
9. Assembly — combine verified outputs and resolve partial completion.
10. Completion or blocked/failed state — report the actual outcome and remaining work.
11. Memory and audit — store only policy-permitted task facts and retain the event trail according to retention rules.

Recommended persisted states: draft, needs_clarification, planned, awaiting_approval, ready, running, waiting, verifying, completed, partially_completed, blocked, failed, cancelled, compensating, compensated.

State transitions must be explicit and validated. Invalid transitions are rejected. A pause, cancellation, timeout, or application restart must not silently convert an incomplete workflow into a successful one.

## 4. Workflow graph and step contract

Represent a workflow as a versioned directed acyclic graph by default. A future explicitly bounded loop/iteration construct may be added through a new contract version; arbitrary unbounded loops are prohibited.

Each step must declare: stable workflow and step IDs; contract/schema version; capability and executor requirement; typed input/output schemas; dependency IDs; preconditions and postconditions; required permissions and data classifications; risk class and reversibility; timeout, retry policy, and idempotency key; estimated and maximum resource/cost budget; verification method and acceptance criteria; and compensation/recovery strategy where available.

Step outputs are data, not instructions. Output from a model, website, document, email, device, or external service is untrusted until validated and must not alter workflow security policy.

## 5. Permissions and approval gates

Use least privilege and scoped, time-bounded grants. Permission checks occur at planning time and again immediately before execution because grants, account state, and context may change.

Classify operations at minimum as read-only/local, reversible/local mutation, external side effect, and sensitive/high-impact. External side effects include sending, publishing, sharing, submitting, calling, messaging, or otherwise affecting another party/system. Sensitive/high-impact operations include spending money, purchases, irreversible deletion, security/account changes, and medical/legal actions.

Require explicit owner confirmation for protected actions and material changes to scope, recipients, destination, provider/data-sharing path, spending, destructive effects, or permissions. Confirmation must be bound to a human-readable summary of the exact action and parameters; approval of a general goal is not blanket approval for later side effects.

If the approved plan changes materially, invalidate affected approvals and request confirmation again. Never interpret silence, timeout, or ambiguous language as approval.

## 6. Risk, cost, and resource governance

Before execution, estimate monetary cost/provider billing exposure, external calls/rate limits, duration/hard timeout, storage/bandwidth/CPU/GPU/NPU/memory requirements, privacy classification/data leaving the device, reversibility, blast radius, and failure impact.

Enforce the lowest applicable bound among Core policy, owner-configured budget, device/runtime capacity, executor limits, and provider limits. Attribute the limiting factor accurately. AWE cannot raise a budget or relax policy; it can only request owner-authorized changes through a separate settings flow.

Retries must be bounded and must not duplicate non-idempotent side effects. If a provider response is ambiguous after an external operation, query or verify operation status where supported before retrying.

## 7. Executor and capability routing

Resolve each step against registries for capabilities, tools, providers, devices, and adapters. Selection considers capability/schema compatibility, trust/reliability and error history, privacy/data residency, cost, latency, availability, resource requirements, user preference, provider restrictions, and permission scope.

Adapters isolate provider-specific APIs from Core contracts. AWE records which executor/provider performed each step. Fallback is allowed only when the alternate path satisfies the same permission, privacy, capability, and budget constraints. Otherwise stop and ask the owner.

## 8. Reliability, idempotency, and recovery

- Persist workflow and step state before and after consequential transitions.
- Use stable idempotency keys for operations that support them.
- Apply bounded exponential backoff only to retryable failures.
- Distinguish transient, permanent, authorization, validation, quota, and ambiguous-outcome failures.
- Never blindly retry a non-idempotent action after a timeout.
- Support cancellation and cooperative stop signals; report when an executor cannot safely stop immediately.
- Define compensating actions for multi-step workflows where rollback is possible. Compensation is a new action and may itself require approval.
- Preserve completed verified steps and outputs during recovery; do not rerun them unless the step contract explicitly allows it.
- On restart, reconcile persisted state with executor/provider status before resuming.
- If safe recovery cannot be established, mark the workflow blocked and explain the uncertainty.

## 9. Verification and completion semantics

Verification is distinct from execution. Depending on the task, it may use schema validation, deterministic calculations, independent reads, checksums, postcondition checks, a second executor, or owner review.

A workflow is completed only when all required steps and acceptance criteria are verified. Otherwise use partially_completed, blocked, or failed and identify exactly what remains unverified. The verifier must not simply repeat or trust the executor's success claim. Preserve evidence references and timestamps for critical outcomes.

## 10. Scheduling, triggers, and background operation

Future triggers may include user-specified schedules, explicit reminders, approved recurring workflows, and monitored conditions. Every automation must have an owner-visible purpose and trigger, defined scope and expiration/review policy, explicit permissions and resource budget, notification behavior and pause/disable control, and a clear distinction between monitoring and taking action.

A condition becoming true may prepare a workflow or notify the owner; it does not automatically authorize a consequential action. Background execution must respect Android foreground/background execution limits, battery/network constraints, OS permissions, and platform policies. Cross-platform scheduling is provided through platform adapters, not hard-coded into Core.

## 11. Security, trust boundaries, and audit

- Treat prompts, plans, tool outputs, web pages, files, OCR, transcripts, notifications, and device data as untrusted inputs.
- Keep system policy, permission decisions, and secrets outside model-controlled content.
- Validate executor inputs and outputs against versioned schemas.
- Isolate secrets in platform-appropriate secure storage; never place API keys in client-visible code or workflow logs.
- Apply sandboxing, least privilege, rate limits, and per-executor quotas.
- Record actor, workflow/step IDs, plan version, executor, permission decision, approval reference, timestamps, outcome, and sanitized error details.
- Redact credentials and unnecessary personal data from logs.
- Provide owner-visible workflow history and controls to inspect, pause, cancel, and revoke future execution grants.

## 12. Relationship to other Sofia subsystems

- Sofia Core owns policy, authorization, orchestration boundaries, and final response.
- Agent/Tool/Provider Registry supplies capability contracts and executor metadata.
- Device Manager exposes device capabilities through adapters and permission-scoped contracts.
- Memory stores approved durable task context; workflow execution state remains in a dedicated task store and is not conflated with conversational memory.
- Critic/Verifier independently evaluates results and catches errors.
- Security & Audit provides permission checks, secret isolation, audit trail, and stop controls.
- Resource Manager enforces budgets and quotas.
- Emotional Response Manager remains a separate interaction-policy component. It may influence conversational phrasing and de-escalation behavior, but must never change workflow permissions, risk classification, approvals, or execution policy.

## 13. Versioning and implementation sequence

1. Define stable workflow, step, executor, approval, and audit-event schemas.
2. Implement a deterministic in-memory state machine with mock executors and no external side effects.
3. Add unit tests for valid/invalid transitions, permission denial, approval invalidation, timeout, cancellation, retries, and recovery.
4. Add a durable task store and restart reconciliation.
5. Add read-only executors first, then reversible local actions.
6. Add external side effects only after approval binding, idempotency, audit, and recovery tests pass.
7. Add scheduling/background adapters only after platform-specific constraints and user controls are verified.

All additions must be isolated, versioned, tested, and backward-compatible where possible. Do not change the existing production branch, deployment, browser storage keys, API route, or current chat behavior as part of this architectural specification.

## 14. Acceptance criteria

The design is acceptable when Core remains the sole policy/authorization authority; workflows and steps use versioned, validated contracts; plans are inspectable and approval is bound to exact consequential actions; model-generated content cannot grant permissions or bypass policy; retries cannot silently duplicate non-idempotent side effects; state survives restart and unsafe recovery blocks rather than guessing; execution and independent verification are separate; provider fallback respects privacy/cost/capability/permission constraints; the owner can inspect, pause, cancel, and revoke automations; platform-specific background limits are respected; Emotional Response Manager cannot weaken security or authorization; and current v0.1 and production behavior remain unchanged until separately approved.