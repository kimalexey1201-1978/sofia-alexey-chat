# Sofia AI Task Planning & Orchestration Engine — Architecture Specification v1

## Status and boundary
Architecture specification only. No runtime planner, scheduler, task graph executor, autonomous loop, multi-agent orchestration or plan persistence is implemented by this document. The current v0.1 chat cycle remains inference-only. No production deployment, Cloudflare setting, secret, `main` branch or existing chat/storage behavior is changed.

## 1. Mission and authority
The Task Planning & Orchestration Engine (TPOE) converts an owner request into a bounded, inspectable plan and coordinates its progress through Sofia Core and approved execution components.

Sofia Core remains the single orchestration authority. Planner models and executor modules are replaceable advisory/worker components; they do not own the task, grant authority, alter policy, raise budgets or approve their own results.

The engine must:
- clarify the desired outcome and success criteria;
- decompose work into explicit, dependency-linked steps;
- identify required information, capabilities and trusted executors;
- estimate time, resource use and uncertainty;
- identify risk, privacy, data-egress and owner-approval gates;
- schedule only steps whose dependencies and gates are satisfied;
- monitor progress and verify outputs;
- recover safely, replan within the original authority, or ask the owner;
- provide a final result with evidence and incomplete items clearly identified.

## 2. Separation of responsibilities
- **Sofia Core:** owns task state, plan approval policy, orchestration decisions and final response.
- **Knowledge & Reasoning Engine:** helps analyze task requirements, evidence, dependencies and assumptions; its conclusions are not permissions.
- **Planner adapter/model:** proposes a plan; cannot execute tools, approve spending or modify owner policy.
- **Capability & Permission Registry:** identifies eligible modules/capabilities and current grants.
- **Identity & Authentication Manager:** supplies authenticated principal/session context.
- **Security Manager:** independently authorizes each protected operation.
- **Resource & Budget Manager:** reserves and meters resources; default owner policy remains `FREE_ONLY`.
- **Execution Supervisor:** is the sole invocation path for executor modules and brokered side effects.
- **Critic/Verifier:** independently validates plans, step outputs and final results.
- **Audit & Observability Manager:** records plan revisions, decisions, gates and outcomes with minimal data.
- **Data Governance & Memory Managers:** control data use, purpose, retention and any approved memory writes.

A plan is an intention and dependency map, not an authorization token. A plan step cannot cause an external side effect unless the normal grant, authority-envelope, Security Manager, RBM and Execution Supervisor gates independently pass.

## 3. Task lifecycle and state machine
Canonical lifecycle:
1. **ACCEPTED** — request captured with principal/session and correlation identifiers.
2. **CLARIFYING** — resolve ambiguity, constraints, target outcome and success criteria.
3. **ANALYZING** — inspect authorized context, files, evidence and dependencies.
4. **PLANNED** — versioned plan created with assumptions, risk, estimates and gates.
5. **AWAITING_OWNER_APPROVAL** — only when a material decision requires explicit owner input.
6. **READY** — plan or relevant steps have all prerequisites satisfied.
7. **RUNNING** — eligible steps dispatched through Execution Supervisor.
8. **VERIFYING** — outputs checked independently against acceptance criteria.
9. **BLOCKED** — missing permission, approval, dependency, evidence, capacity or resource.
10. **REPLANNING** — plan revision proposed after changed conditions or failed step.
11. **PAUSED** — owner or policy pauses work; no new side effects.
12. **CANCELLING** — cancellation propagated and in-flight outcomes reconciled.
13. **COMPLETED** — all required success criteria verified.
14. **PARTIALLY_COMPLETED** — some deliverables verified, others explicitly incomplete.
15. **FAILED** — task cannot safely proceed or required success criteria failed.
16. **CANCELLED** — cancellation confirmed; unresolved external effects remain separately marked.

State transitions must be validated; no direct jump from accepted to completed. A timeout or lost response does not imply cancellation or success. If an external side effect may have occurred, mark its outcome unknown and reconcile before retrying.

## 4. Plan representation
A plan is a versioned directed acyclic graph (DAG) of steps:
- stable plan/task IDs, version and correlation ID;
- owner goal and measurable acceptance criteria;
- step IDs, descriptions, type, dependencies and ordering constraints;
- required capabilities, candidate executor IDs/versions and fallback policy;
- input/output references and schemas, not embedded secrets;
- risk tier, data classification, purpose and external recipients;
- time/resource estimates with basis and confidence;
- hard limits, deadline, retry/cancellation policy;
- owner approval gates and exact decision requirements;
- verification method and expected evidence;
- checkpoints, rollback/compensation strategy where supported;
- final completion criteria and unresolved risks.

Cycles are invalid. A plan must be deterministic enough to audit and resume; unordered parallel steps must have no hidden dependency.

## 5. Planning procedure
1. Parse owner intent; preserve explicit constraints and distinguish preferences from requirements.
2. Define observable completion criteria and what counts as a partial result.
3. Identify missing information and ask the single most consequential clarification before committing to a plan.
4. Retrieve only relevant, authorized project/memory/source context.
5. Decompose into atomic steps with explicit inputs, outputs and dependencies.
6. Map each step to registered capabilities; reject undeclared or untrusted executors.
7. Classify data, risk and side effects; identify approval and consent gates.
8. Estimate resource/time bounds and confidence; include provider pricing and tier checks.
9. Apply the strictest limits from owner, device, task, module, capability and provider scopes.
10. Check feasibility under `FREE_ONLY`; if a paid resource is necessary, stop and ask the owner before any paid call.
11. Run plan validation: DAG acyclicity, dependency closure, capability compatibility, budget feasibility, policy coverage, deadline and recovery review.
12. Persist a plan version and expose a concise summary for owner approval when required.
13. Dispatch only eligible ready steps.

## 6. Autonomy and approval model
Use task-scoped autonomy levels, constrained by the Authority Envelope and policy:
- **A0 — advise only:** analyze and propose; no external side effects.
- **A1 — bounded internal work:** read approved inputs, calculate, draft and prepare artifacts in authorized workspace; no external send/publish/payment/destructive actions.
- **A2 — pre-authorized low-risk execution:** perform only explicitly allowlisted operations within exact task, target, resource and expiry limits.
- **A3 — multi-step execution with checkpoints:** continue across dependent steps only while authority remains valid; pause at configured approval gates.
- **A4 — prohibited by default:** broad, open-ended autonomy or self-expanding authority. It is unavailable unless separately designed, reviewed and explicitly enabled by owner policy.

Autonomy level never overrides Security Manager, capability grants, consent, RBM, privacy policy or platform permissions. Each step inherits the narrowest applicable authority. Child steps cannot widen scope, target, data access, autonomy, deadline or budget.

Owner approval is required where policy demands it, including paid resources, new processors/data egress, sensitive disclosures, account changes, publishing/sending, destructive actions and irreversible operations. Approval must bind to the exact step/action, target, data scope, provider, maximum cost/currency if applicable, and expiry. A plan-level “yes” is not blanket approval for unspecified later side effects.

## 7. Free-only resource policy
The default execution policy is `FREE_ONLY`:
- only explicitly approved zero-additional-cost providers, plans and tiers may be selected;
- free-tier quotas, token/rate caps and infrastructure constraints remain enforced;
- no silent paid fallback, paid overage, subscription activation or trial conversion;
- unknown pricing is not treated as zero;
- if a paid resource is essential, pause before the call and present provider, purpose, exact task step, estimated maximum charge, currency, pricing basis, data sent and approval expiry to the owner;
- only the owner may approve that exact expense; RBM reservation and Security Manager authorization remain separate gates;
- if approval is absent, expired or scope-mismatched, the step is blocked and the plan must use a free alternative or report inability to proceed.

## 8. Scheduling and concurrency
Schedule only steps whose dependencies are verified complete and whose policy gates are satisfied. Parallelize only independent steps with isolated inputs/outputs and separate resource reservations. Enforce:
- global and per-module concurrency limits;
- per-task deadlines and execution budgets;
- fair scheduling and priority without bypassing hard limits;
- device battery, thermal, network and Android background constraints when permissioned and available;
- bounded queues and backpressure;
- cancellation and checkpoint boundaries.

Unknown or stale device/resource telemetry must not be treated as healthy. Do not promise hidden indefinite background execution.

## 9. Execution, checkpoints and verification
For every dispatched step:
1. create a canonical task-bound Execution Request;
2. validate exact module artifact/version and capability grant;
3. validate Authority Envelope and fresh Security Manager decision;
4. reserve RBM resources;
5. invoke only through Execution Supervisor;
6. revalidate authorization and approval immediately before each side effect;
7. validate result schema, provenance, classification and resource usage;
8. run independent step-specific verification;
9. persist checkpoint and audit references;
10. release unused reservation after reconciliation.

A step is not complete because a module returned “success”. It is complete only when its output meets declared acceptance criteria and verification passes. Outputs are untrusted until validated.

## 10. Failure, retry and compensation
Classify failure as transient, permanent, policy-denied, resource-denied, verification-failed, cancelled or outcome-unknown.
- Retry only idempotent operations or operations with verified idempotency keys.
- Recheck permissions, authority, budget and provider route for every retry.
- Never retry a send/payment/delete/publish action blindly after timeout.
- Use compensation only when explicitly supported, authorized and safe; compensation is a new side effect requiring its own authorization.
- On repeated failure, stop the affected branch and assess whether independent branches can continue safely.
- Preserve partial verified outputs and clearly report unfinished work.
- Do not hide failures or silently downgrade acceptance criteria.

## 11. Replanning and change control
Replanning is allowed when new evidence, changed dependencies, resource limits, executor health or owner instructions materially affect feasibility.
- Create a new immutable plan version; retain prior version and reason for change.
- Revalidate DAG, capabilities, privacy, data egress, estimates, approvals and budgets.
- Preserve completed verified steps only if their outputs remain valid and policy-compatible.
- Revoke or invalidate obsolete pending steps and approvals.
- A replan cannot increase authority, budget, data scope or risk ceiling.
- Material scope/target/cost/processor changes require fresh owner approval.
- If no safe plan remains, pause and explain the blocker.

## 12. Observability and owner control
Owner-facing status should show:
- current task state and plan version;
- completed, running, blocked and pending steps;
- verified deliverables and evidence references;
- resource reservation/actual usage and free/paid tier;
- approvals requested, granted, denied or expired;
- risks, assumptions, errors and unresolved external outcomes;
- next planned action and cancellation/pause control.

Audit metadata should include actor, plan version, step, module/version, grant/authority/decision refs, reservation, timestamps, outcome and verification status. Do not log prompts, credentials, private file contents or raw media.

## 13. Memory and learning boundaries
Only durable project milestones, owner-confirmed decisions and validated procedures may be proposed for memory. Proposed plans, temporary assumptions, unverified outputs and failed attempts remain task/working state unless explicitly approved for another purpose. Plan completion does not automatically authorize a memory write; Memory Manager and its verification/governance gates still apply.

## 14. Failure behavior
- Planner unavailable: ask owner or use a deterministic simple plan only where safe; never invent a plan as already approved.
- Security/RBM/ES unavailable: do not dispatch protected steps.
- Critic unavailable: do not mark high-impact outputs verified.
- Unknown provider price: block route.
- Owner approval missing: pause at gate.
- Cancellation with unknown external outcome: reconcile before retry.
- Plan store unavailable: do not start multi-step side effects that require resumability.
- No failure may corrupt existing chat history, canonical memory or project artifacts.

## 15. Acceptance tests
1. Plan is a DAG; cycles, missing dependencies and duplicate step IDs are rejected.
2. No step dispatches before dependencies and gates pass.
3. Plan is not treated as permission; every protected step has fresh SSM authorization.
4. Child steps cannot widen parent authority or budget.
5. Paid provider is blocked under `FREE_ONLY` before invocation.
6. Paid approval binds to exact provider, task step, amount, currency, purpose and expiry.
7. Unknown price is blocked, not treated as free.
8. Parallel steps reserve independent resources and respect concurrency ceilings.
9. Module success without independent acceptance verification does not complete a step.
10. Timeout/outcome-unknown side effects are reconciled before retry.
11. Replan creates a new version and invalidates stale approvals.
12. Replan cannot silently change scope, target, processor, data egress or cost.
13. Cancellation propagates and reports unresolved external effects.
14. Partial completion preserves verified outputs and exposes incomplete steps.
15. Planner/model cannot issue grants, approve expenses or alter security policy.
16. Owner can inspect, pause and cancel task execution within platform limits.
17. Plan and audit records omit secrets, prompts and private payloads.
18. Memory promotion requires separate Memory Manager approval and verification.
19. Android resource constraints and background limits are honored.
20. Existing v0.1 chat and storage behavior remain unchanged.

## 16. Implementation sequence
A — add versioned task-plan, plan-step and orchestration-decision contracts.
B — implement deterministic plan validator (DAG, limits, gate closure, authority inheritance).
C — implement task/step state machine and persistent checkpoints.
D — integrate RBM, SSM, Capability Registry and Execution Supervisor.
E — add scheduling, bounded parallelism, cancellation and idempotent retry controls.
F — integrate Critic/Verifier, audit events and owner-facing status controls.
G — add model-assisted planning behind deterministic validation and strict approval gates.
H — run adversarial tests for authority expansion, paid fallback, prompt injection, side-effect replay, plan tampering and recovery before production activation.

## 17. Current boundary
This document is a design specification only. It does not implement task planning, scheduling, multi-step execution, autonomy or background work. Existing v0.1 chat remains unchanged.
