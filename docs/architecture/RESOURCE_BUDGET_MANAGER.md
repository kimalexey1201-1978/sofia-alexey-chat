# Sofia AI Resource & Budget Manager — Architecture Specification v1

## Status and boundary
Architecture specification only. No live quota, billing, reservation or runtime enforcement is implemented. v0.1 remains inference-only. No production deployment, Cloudflare setting, secret or `main` change.

## 1. Purpose and separation of duties
Resource & Budget Manager (RBM) protects cost, availability and device resources. Sofia Core owns orchestration; RBM owns accounting and admission limits; Security Manager decides authorization; Execution Supervisor enforces reservations and runtime ceilings. A resource reservation is not an authorization grant, and an authorization decision is not a reservation. Both are required where policy says so.

## 2. Resource dimensions
Track independently: financial spend and currency; provider calls and input/output tokens; CPU and wall-clock time; memory and temporary/persistent storage; network destinations, bytes and request rate; active tasks, concurrency, queue depth, steps and retries; Android battery/thermal/storage/background constraints where permissioned and available; data/attachment/export volume. Every dimension has a unit, scope, measurement source, reset policy and hard maximum. Unknown usage is never zero.

## 3. Budget scopes and inheritance
Apply simultaneous ceilings at owner, device, task, module/version, provider, capability and invocation levels. The effective limit is the strictest applicable ceiling. Child tasks may receive a smaller delegated budget but cannot mint or enlarge one. Hard limits stop admission/execution. Soft warnings never silently authorize overspend.

## 4. Reservation lifecycle
1. Estimate bounded usage with source and confidence.
2. Validate policy, parent ceilings, available balance, currency and reset window.
3. Atomically reserve the maximum permitted amount before costly execution.
4. Obtain Security Manager authorization separately.
5. Meter actual usage outside the module.
6. Reconcile actual usage and release unused reservation.
7. Record minimal usage metadata.
8. If cost is unknown, retain a bounded pending reservation; never settle as zero.
Reservations are unique, idempotent, task-bound and time-bounded. Atomic accounting prevents concurrent tasks spending the same balance.

## 5. Monetary accounting
Use integer minor currency units, never floating-point money. Store ISO currency code, estimate/actual distinction, pricing source/version and timestamp. Do not convert currencies without an explicit FX source, timestamp and rounding policy. If provider cost is not measurable, use a conservative configured maximum or deny. A free model is not assumed to make all routing and infrastructure costs free.

## 5A. Owner-controlled free-only operating policy

The default and required operating mode is `FREE_ONLY`: Sofia may use only explicitly approved platforms, providers, models, services and tiers that incur **zero additional charge to the owner**. This is an owner policy, not a budget that the system may spend at its discretion.

- The allowlist must identify the approved provider/platform and the specific free tier or plan. A provider being generally described as “free” is not sufficient.
- Free-tier quotas, rate limits, token limits and usage caps still apply. RBM reserves and meters those non-monetary resources; exhaustion means stop, wait, or ask the owner. It never silently upgrades the plan.
- Paid APIs, subscriptions, premium models, paid add-ons, paid infrastructure, billable overages and any route that could create an additional charge are blocked by default. Automatic paid fallback, card-on-file charging, trial-to-paid conversion and “pay as you go” are prohibited unless the owner has explicitly approved the exact case.
- If a task cannot be completed within the approved free options, Sofia must pause **before making the potentially billable call** and explain to the owner: what requires payment, why the free alternatives are insufficient, the provider/platform, estimated maximum charge, currency, pricing basis, task scope and approval expiry.
- Only the owner can approve that proposed expense. A system rule, model recommendation, provider response, existing free-tier access or RBM reservation is not owner approval. Silence, prior approval for another task, or a generic “continue” does not authorize a new charge.
- Approval is explicit, informed, task-bound and limited to the named provider/service, purpose, maximum amount and currency, billing period/expiry, and any relevant data-sharing scope. If the price or scope changes, Sofia must ask again. No approval means no paid execution.
- After owner approval, RBM may reserve the approved maximum amount; Security Manager must still independently authorize the underlying action. Neither approval replaces the other. If either gate denies, is missing, expires or returns an unknown result, execution does not proceed.
- If actual or projected cost may exceed the approved cap, stop before exceeding it and return to the owner for a new decision. Never split a charge or task to evade the cap.

This policy governs every executor and every route, not only model inference. It must be enforced outside the model by RBM/provider routing and the Execution Supervisor; a prompt or architecture document alone is not enforcement.

## 6. Admission decisions
RBM returns one of:
- `RESERVE` — reservation granted within all ceilings;
- `DENY_BUDGET` — hard budget/quota exhausted;
- `DEFER_CAPACITY` — temporary capacity unavailable;
- `REQUIRE_OWNER_BUDGET_APPROVAL` — task needs a limit increase or paid resource;
- `UNKNOWN_USAGE` — cost/usage cannot be safely bounded.
Scheduling may consider priority, deadline, fairness and device state, but priority never bypasses hard limits or authorization.

## 7. Provider routing and failover
Before routing, reserve provider cost, enforce provider allowlist and data-egress policy, minimize context, verify provider suitability for the data class, and enforce per-provider/global limits. Failover requires a fresh estimate, reservation and policy check. It cannot send more data, exceed the task ceiling or silently switch from free to paid. If no compliant provider fits, stop and inform the owner.

## 8. Model usage controls
Bound input/output tokens, total task tokens, provider calls, context size, retries and tool-loop iterations. Model cannot request unlimited context or retry expansion. Summarization/truncation must preserve safety constraints; material loss of task fidelity must be disclosed.

## 9. Android-first device constraints
Respect Android OS background limits, battery/thermal signals when available and permissioned, memory pressure, network state and storage. Unknown or stale telemetry is not healthy-by-default. Long-running work should checkpoint safely; foreground work must use appropriate user-visible OS mechanisms. Never promise indefinite hidden background execution. Other platforms report actual controls; unsupported controls are not simulated.

## 10. Quotas and circuit breakers
Enforce request rates, concurrency, queue depth, provider calls/tokens, task steps/retries/deadlines, per-module CPU/memory/network/storage, data/export limits and financial daily/monthly caps. Circuit breakers stop admission during repeated failures; bounded probes may test recovery but do not override permissions. Abnormal consumption can suspend a module for review.

## 11. Budget changes
Only an authenticated owner or explicitly authorized administrator policy may change owner-level limits. A model, provider, module or task cannot raise its own budget. An increase request specifies amount, currency, scope, reset period, purpose, cost basis and expiry. Approval binds to the exact proposed change; after approval RBM updates the limit and the task is reevaluated. Budget approval does not authorize the underlying action.

## 12. Privacy and usage records
Record reservation/invocation IDs, pseudonymous principal, task, module/provider, resource dimension/quantity/unit, estimate/actual/pending status, currency/amount, measurement source/time, policy version and outcome. Do not log prompts, message bodies, credentials, raw audio/video or unrelated personal data.

## 13. Failure handling
RBM outage blocks new costly or resource-intensive protected execution. Unknown usage requires conservative caps or denial. Delayed settlement remains pending and bounded. Hard-limit exhaustion stops safely. Ambiguous external side effects must be reconciled before retry. Never fall back to an unapproved paid provider or broader scope.

## 14. Acceptance tests
1. Concurrent tasks cannot reserve more than remaining owner budget.
2. Child task cannot raise parent/owner ceiling.
3. Module cannot change its limits or self-report unlimited usage.
4. Unknown pricing is conservatively reserved or denied, never zero.
5. Integer minor-unit accounting avoids floating-point errors.
6. Unused reservation is released only after reconciliation.
7. Uncertain charges remain bounded and pending.
8. Provider failover requires a new reservation and preserves task ceiling.
9. Free-to-paid switch is blocked absent explicit policy and owner approval.
10. Token, retry, step and concurrency limits are enforced outside model.
11. Unknown device state is not treated as healthy.
12. Hard limit stops execution without silent downgrade.
13. Budget approval binds to exact amount, currency, scope and expiry.
14. Usage logs contain no prompts, credentials or protected bodies.
15. RBM outage does not corrupt chat history.
16. Repeated overconsumption can suspend one module without disabling others.

## 15. Implementation sequence
A — contracts for policy, reservation, usage event and admission decision.
B — pure integer accounting engine with atomic reservation/settlement tests.
C — Execution Supervisor metering integration.
D — provider pricing/usage adapters and failover accounting.
E — Android resource adapter with actual OS capability reporting.
F — owner budget visibility, alerts, approval-bound changes and audit.
G — mock-provider non-production validation; preserve chat/storage; no production activation without separate explicit approval.

## 16. Current v0.1 boundary
This document does not implement live financial budgets, token metering, atomic reservations, billing reconciliation, device telemetry or runtime quota enforcement. The existing v0.1 chat endpoint remains inference-only. Do not claim provider spend is currently blocked by these design rules.
