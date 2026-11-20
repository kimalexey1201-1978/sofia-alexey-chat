# Policy Engine — Architecture and Decision Model

**Status:** Architecture specification  
**Version:** 1.0  
**Owner:** Sofia Core  
**Related contracts:** `policy-decision.schema.json`, `owner-approval.schema.json`, `permission-grant.schema.json`, `capability-grant.schema.json`, `authority-envelope.schema.json`, `resource-budget.schema.json`, `executor-assessment.schema.json`

## 1. Purpose and authority

The Policy Engine (PE) is the deterministic policy decision point for Sofia. It evaluates whether a proposed task step may proceed and returns a typed, auditable decision. It does not execute tools, authenticate users, create owner approval from conversation text, or independently grant capabilities.

Sofia Core remains the sole orchestrator. The Policy Engine evaluates policy; the Execution Supervisor enforces the result at dispatch and immediately before consequential side effects. Models and executors may recommend actions but cannot set policy outcomes.

This specification does not implement a live policy engine. The v0.1 chat route remains inference-only.

## 2. Inputs and trust requirements

Every evaluation uses typed, versioned inputs:

- verified principal and active session reference, issued by the authentication/session subsystem;
- task and parent-task references, purpose, source provenance and constraints;
- exact proposed capability, operation, target and canonical parameters digest;
- registered capability definition and executor/module identity/version;
- active grants and their scopes, expiries, revocation state and policy version;
- task Authority Envelope and autonomy/risk limits;
- owner approval record, if required;
- current resource/budget reservation and usage state;
- data classification, processor/region constraints and consent references;
- trust assessment, health freshness, incident and circuit-breaker state;
- policy bundle version and evaluation time.

Untrusted inputs include client request fields, imported chat history, model output, retrieved documents, provider responses, module manifests before verification, and executor telemetry before validation. Untrusted inputs may inform a task but cannot establish identity, approval, grants, trusted health, or policy configuration.

Missing, malformed, stale, contradictory or unverifiable security-critical inputs fail closed.

## 3. Decision vocabulary

The existing `policy-decision.schema.json` is the output contract:

- `allow`: all mandatory gates passed for this exact operation and bounded validity window.
- `deny`: one or more hard prohibitions, failed gates or unavailable required controls.
- `require_approval`: policy permits proceeding only after an explicit, request-bound owner approval.
- `step_up_auth`: the principal must complete a stronger or fresher authentication step before policy can be evaluated as allowed.

A decision is not a capability grant. An `allow` is short-lived, scoped to the evaluated action and revalidated at execution. It cannot be copied to a different target, task, operation, parameter set, principal or session.

## 4. Mandatory evaluation order

Evaluate in this order; later positive results cannot override an earlier denial:

1. **Request integrity:** schema, size, supported contract versions, correlation and idempotency.
2. **Authentication:** verified principal, issuer/audience, active session, expiry and revocation.
3. **Task authority:** task belongs to principal; parent/child scope and Authority Envelope are valid and unexpired.
4. **Capability registration:** capability exists, is enabled by Sofia policy and supports the exact operation and target type.
5. **Executor admission:** module/provider is active, artifact and version are verified, contract compatible, not suspended/revoked/quarantined.
6. **Permission grant:** active grant matches principal, module/version, capability, operation, target, data scope, risk ceiling and expiry.
7. **Data governance:** classification, purpose, consent, processor allowlist, retention and geographic restrictions pass.
8. **Risk policy:** action risk, reversibility, external impact, sensitivity and uncertainty are within policy; mandatory prohibitions apply.
9. **Authentication assurance:** session assurance and authentication freshness meet the operation's requirement; otherwise return `step_up_auth`.
10. **Owner approval:** if required, verify a pending challenge or an approved, unexpired, unconsumed approval bound to the exact action. If not yet approved, return `require_approval`.
11. **Resource and budget:** reserve CPU, memory, network, tokens and cost within task and owner ceilings; unknown pricing is not free.
12. **Runtime health:** health is fresh enough, circuit breaker permits dispatch, and required dependencies are available.
13. **Obligations:** determine required redaction, logging, user-visible notice, verification, limits, timeout and cancellation behavior.
14. **Decision issuance:** emit a short-lived policy decision referencing all evaluated evidence and policy version.

The exact order of non-security optimization may vary, but no resource reservation or executor invocation may precede authentication, scope, grant and policy checks.

## 5. Hard prohibitions and fail-closed rules

The following conditions always deny or block the proposed operation:
- missing or invalid authentication for a protected capability;
- client-supplied identity, role, approval or permission claim used as authority;
- absent, expired, revoked, suspended or scope-mismatched grant;
- unregistered or revoked capability/executor;
- module trust failure, artifact digest mismatch or critical unresolved incident;
- target or data scope outside the approved grant;
- prohibited action or risk tier above the Authority Envelope ceiling;
- policy version unsupported by the enforcement point;
- required approval denied, expired, revoked, consumed or digest-mismatched;
- insufficient assurance where step-up cannot be completed;
- unknown cost/provider pricing under FREE_ONLY;
- unavailable mandatory audit, policy, identity, approval or budget service;
- resource, time, call, concurrency or cost ceiling exceeded.

No model confidence, executor score, user urgency, cached decision or retry can override a hard prohibition.

## 6. Risk classification

Risk is evaluated per action, not merely per task or module. The policy catalogue should define risk tiers and examples:

- **R0 — negligible:** local, read-only, reversible, non-sensitive operations.
- **R1 — low:** bounded local changes with straightforward undo and no external disclosure.
- **R2 — elevated:** external communication, personal-data access, account changes, purchases, or consequential but reversible operations.
- **R3 — high/critical:** financial transfers, legal/medical commitments, identity/security changes, irreversible deletion, public disclosure, safety-critical control, or actions with substantial third-party impact.

These labels are an initial architecture taxonomy, not an automatic classifier. The capability owner and policy catalogue assign a minimum risk floor; contextual factors may raise risk but never lower that floor. Unknown or ambiguous impact must be treated conservatively.

Risk factors include reversibility, blast radius, data sensitivity, external visibility, financial value, third-party impact, safety impact, uncertainty, and whether the action changes security or identity state.

## 7. Approval and autonomy interaction

Autonomy level limits what Sofia may do without further interaction; it does not create capability grants. Higher autonomy never bypasses authentication, policy, data governance, resource ceilings, or mandatory approval gates.

The approval requirement is based on action risk and policy, not merely the task's autonomy level. Owner approval must be explicit and bound to exact action parameters. For high-risk actions, require strong step-up authentication plus explicit confirmation according to policy. Voice recognition alone is not sufficient.

A parent task cannot delegate broader authority to a child. Each consequential child step is evaluated independently. A change in target, recipient, amount, data scope, provider, or material parameter invalidates the previous decision and approval.

## 8. Resource and FREE_ONLY policy

Resource & Budget Manager (RBM) owns reservation and settlement. Policy Engine checks the reservation result; it does not calculate spend from model estimates alone.

- Only verified free routes with no additional cost may be selected by default.
- Unknown pricing, quota semantics or overage behavior blocks the route under FREE_ONLY.
- Free-tier exhaustion results in stop, wait, another verified free route, or owner consultation.
- No silent paid fallback, subscription, overage, card charge or trial conversion.
- Any paid exception requires a separate, exact, task-bound owner approval and a valid budget reservation.
- A provider switch triggers a fresh policy evaluation and reservation; it cannot inherit a broader data scope or cost ceiling.

## 9. Decision validity and enforcement

Every decision must include:
- unique decision ID and correlation ID;
- principal, capability, operation and target references;
- policy version and evaluation time;
- grant references and approval challenge/reference as applicable;
- bounded expiry;
- obligations and safe reason code.

At execution time, the Execution Supervisor rechecks session, grant, approval consumption state, target and action digest, policy version, budget reservation, executor trust/health and cancellation state. Decisions are invalidated by session revocation, grant revocation, policy update, approval revocation/consumption, task cancellation, resource exhaustion, executor suspension or material action change.

For a side effect, the supervisor must use atomic one-time authorization consumption where supported. If the external outcome is uncertain, record `OUTCOME_UNKNOWN`, reconcile before retry, and never blindly repeat a potentially non-idempotent action.

## 10. Audit and explainability

Record each decision with:
- decision and correlation identifiers;
- principal/task/module/capability/operation/target references;
- policy version and evaluated time;
- allow/deny/approval/step-up outcome;
- stable reason codes and obligations;
- references to grant, approval, authority envelope and budget reservation;
- enforcement and final execution outcome.

Do not log raw credentials, challenge nonces, biometric data, full prompts, message bodies or unnecessary personal data. Owner-facing explanations should state what was requested, what scope was checked, why it was allowed/blocked, and what confirmation or correction is needed without exposing internal secrets.

## 11. Required test catalogue

Before activation, test at minimum:

1. Missing, malformed, expired, revoked and cross-principal sessions.
2. Client-forged principal, grant, role, approval, autonomy or policy fields.
3. Unknown capability, operation, target and contract version.
4. Manifest request mistaken for a grant.
5. Expired, revoked, suspended, wrong-version and scope-mismatched grants.
6. Parent/child task scope escalation.
7. Data classification, purpose and processor-policy violations.
8. Every risk tier, mandatory approval and step-up path.
9. Approval replay, concurrent consumption, expiry and parameter substitution.
10. Policy bundle change between decision and execution.
11. Budget exhaustion, concurrent reservations and unknown pricing.
12. Stale health, circuit breaker open and revoked executor.
13. Audit/policy/identity/RBM outage and fail-closed behavior.
14. Provider failover with unchanged or narrower data and authority scope.
15. Cancellation and uncertain external side-effect reconciliation.
16. No paid fallback under FREE_ONLY.
17. No effect on existing inference-only chat behavior or local history.

## 12. Implementation sequence

A. Freeze the policy input/output contracts and reason-code catalogue.  
B. Implement a pure deterministic evaluator with no network or side effects.  
C. Add table-driven unit tests for evaluation order, hard prohibitions and fail-closed behavior.  
D. Integrate read-only adapters for authentication, grants, approval, authority, data policy and RBM.  
E. Add decision expiry, policy versioning and execution-time revalidation.  
F. Integrate the Execution Supervisor with atomic approval consumption and audit.  
G. Add adversarial and concurrency tests using mock providers/executors.  
H. Only after separate approval, connect identity/storage providers and activate bounded capabilities.

## 13. Current v0.1 boundary

This document does not implement a live Policy Engine, issue grants, authenticate sessions, create approvals, reserve budgets, invoke executors, or alter the chat endpoint. Supabase Auth remains unconnected. No database, secret, Cloudflare configuration, production branch, UI or deployment is changed.
