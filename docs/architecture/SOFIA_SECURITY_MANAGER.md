# Sofia AI Security Manager — Architecture Specification v1

## Status and implementation boundary

This is an architecture specification and contract, not a claim of runtime enforcement. The current v0.1 chat cycle remains inference-only. This document does not add login, permissions, tool execution, microphone/camera access, email access, device control, or autonomous actions. No production deployment, Cloudflare setting, secret, or `main` branch change is part of this work.

## 1. Purpose and authority

Sofia Security Manager (SSM) is the central deterministic policy-enforcement layer for every protected capability. It answers:

**May this authenticated principal perform this exact operation, on this exact target, for this task, now, under the current risk and resource limits?**

SSM is not an identity provider, consent collector, model, planner, or executor. It consumes verified evidence from the relevant managers and produces a short-lived decision. The executor must enforce that decision immediately before acting.

The language model, planner, provider, external content, OCR, transcript, tool output, and device metadata cannot grant authority, modify policy, upgrade authentication assurance, or fabricate owner approval.

## 2. Security components and separation of duties

SSM composes the following independently versioned components:

| Component | Trusted responsibility | Must not do |
|---|---|---|
| Identity & Authentication Manager (IAM) | Verify principal, session, authentication methods, assurance, expiry and revocation | Grant capabilities or decide whether an operation is permitted |
| Device Trust Manager | Verify device registration, key status, platform evidence and device revocation | Treat pairing or a device label as owner authentication |
| Capability / Module Registry | Publish capability identity, version, provenance, requested scopes, risk declaration and execution constraints | Treat a module's self-declared permissions as a grant |
| Authorization / Policy Engine (SSM) | Evaluate grants, target scope, risk, authority envelope, approvals, quotas and policy | Execute the requested operation |
| Owner Consent Manager | Capture narrow, explicit, time-bounded owner choices | Treat consent as identity, authentication or a standing capability grant |
| Privacy-Aware Output Manager (PAOM) | Decide whether and how classified content may be disclosed through a route | Infer consent from a model response or device pairing |
| Resource / Budget Manager | Enforce per-principal, per-device, per-module and per-task limits | Allow an executor to increase its own budget |
| Audit / Security Event Manager | Record minimal, integrity-protected decision and action metadata | Store secrets, message bodies, raw ambient media or biometric templates |

Each component has a versioned contract. A component's successful response is evidence only for the responsibility assigned to it.

## 3. Authorization inputs

Every protected operation is represented as a canonical action request containing at least:

- principal and authenticated session references;
- device reference and device-trust state where applicable;
- task and correlation identifiers;
- module identity, version and provenance;
- capability identifier and requested operation;
- exact target/resource reference;
- data classification and requested disclosure mode, if applicable;
- risk tier and relevant risk signals;
- active task-scoped Authority Envelope;
- required owner-consent and approval references;
- requested resource budget and execution limits;
- policy and contract versions.

Missing, expired, malformed, stale, conflicting or unverifiable evidence is not interpreted as permission. It is represented as unknown and handled according to the fail-safe rules below.

## 4. Risk tiers

Risk is assigned by trusted policy and capability metadata, not solely by a model's estimate.

| Tier | Typical examples | Default control |
|---|---|---|
| R0 — informational | Public lookup, local formatting, non-sensitive calculations | May proceed within the active task and normal quotas |
| R1 — low impact | Read-only access to an explicitly scoped, non-sensitive resource | Authenticated session and explicit capability grant |
| R2 — consequential | Access to personal data, external communication drafts, changes that are reversible but affect user data | Narrow scope, valid authority envelope, and owner approval where policy requires |
| R3 — high impact | Payments, purchases, sending or publishing, deletion, credential/security changes, disclosure of highly sensitive data, irreversible or difficult-to-reverse actions | Strong step-up authentication plus action-bound owner confirmation; deny if any control is unavailable |

The examples are defaults, not an exhaustive classification. A policy may raise a tier based on target, amount, recipient, context, reversibility, data sensitivity or unusual behavior. A lower tier must never be selected merely to avoid a required approval.

## 5. Deterministic evaluation sequence

SSM evaluates in this order. A later successful check cannot override an earlier failure.

1. **Validate request:** schema, canonical action, identifiers, sizes, timestamps and version compatibility.
2. **Verify principal/session:** IAM evidence is authentic, intended for this audience, current, unrevoked and bound to the request.
3. **Verify device/module:** device and module identities are registered and not revoked; module provenance and version satisfy policy.
4. **Resolve capability:** capability exists, is enabled, supports the requested operation and has an explicit grant for this principal and context.
5. **Constrain target and data:** exact target, resource, data class, operation and output route are within the grant and task scope.
6. **Evaluate risk:** trusted risk classification, risk signals and policy constraints determine the minimum assurance and approval requirements.
7. **Validate Authority Envelope:** envelope is active, unexpired, not revoked, bound to this principal and task, and includes this capability, target, risk ceiling and limits.
8. **Validate consent and approvals:** any required consent is owner-issued, current, action-bound and scope-matched. High-risk approval is separately verified and bound to the canonical action digest.
9. **Check resources:** budget, rate, concurrency, duration, step and retry limits remain available.
10. **Issue decision:** return a short-lived, integrity-protected decision with reason codes and references to the evidence used.
11. **Revalidate before execution:** executor checks expiry, revocation, target, action digest and remaining budget immediately before side effect. Any material change requires a new decision.
12. **Record outcome:** audit the decision and execution result without copying protected content into logs.

## 6. Decision semantics

The `security-decision.schema.json` contract defines five outcomes:

- `ALLOW`: all mandatory checks passed; the executor may perform only the exact operation, target and scope covered by the decision.
- `DENY`: a mandatory condition failed or policy prohibits the action.
- `REQUIRE_OWNER_APPROVAL`: the action is otherwise eligible but lacks a valid, narrowly scoped owner approval.
- `REQUIRE_STEP_UP`: current authentication assurance is insufficient; obtain a stronger authentication event and reevaluate.
- `DEFER_UNKNOWN`: trusted evidence or a required policy component is unavailable, stale or contradictory. No side effect is allowed.

An approval or step-up request is not an authorization decision. After the owner completes it, SSM must evaluate the entire action again. Decisions expire quickly and cannot be reused for a different target, operation, recipient, amount, content digest or task.

## 7. Consent and approval binding

Consent is distinct from authentication and authorization.

- Consent must identify the principal, session, purpose, resource, operation and output/action mode.
- Consent has a capture time, expiry and revocation state.
- Consent is not transferable between resources or actions. “Read this email aloud” does not authorize reading future emails, replying, forwarding or deleting.
- An action approval must be bound to a canonical digest of the exact action parameters. For example, a send approval covers the recipient, subject, body/content digest and attachments; changing any of them invalidates approval.
- Silence, wake-word detection, a speaker match, model-generated text, imported content or a generic prior preference is not action-bound consent.
- Withdrawal or expiry invalidates any decision that depended on that consent.

## 8. Authority Envelope and autonomy

The existing Authority Envelope is a task-scoped ceiling, not a blanket permission. It limits allowed capabilities, targets, data scope, maximum risk, prohibited actions, steps, duration, retries, costs and approval gates.

Autonomy level never overrides a missing capability grant, authentication requirement, approval gate or policy prohibition. A task cannot expand its own envelope. Any requested expansion requires a new owner-authorized envelope and a fresh security evaluation.

## 9. Output disclosure integration

For content disclosure, SSM and PAOM both have mandatory roles:

1. SSM verifies owner session, data-read capability, resource scope and any access approval.
2. PAOM independently evaluates content classification, owner choice, environment observations, output route and disclosure consent.
3. The output adapter checks both valid decisions immediately before speaking or displaying content.

An SSM `ALLOW` to read a resource does not authorize audible disclosure. A PAOM `ALLOW_VOICE` does not authorize mailbox access. Both decisions must be valid for the same principal, task, resource and operation. Unknown environment state is never interpreted as private.

## 10. Revocation, expiry and race conditions

- Revocation of a principal, session, device, module, capability grant, consent or authority envelope takes effect for subsequent checks immediately, subject only to the documented propagation bound.
- Every decision carries an expiry and correlation identifier.
- Recheck revocation and remaining budget immediately before a side effect.
- Use idempotency keys for retried external operations where supported.
- For long-running tasks, renew authority and reevaluate at safe checkpoints; do not rely on a decision issued at task start.
- If a side effect may have succeeded but its result is unknown, do not blindly retry. Reconcile state or ask the owner.
- Emergency stop pauses new actions and cancels interruptible work; it cannot promise reversal of an already completed external side effect.

## 11. Resource governance and abuse resistance

Enforce independent ceilings at principal, device, module, provider and task levels:

- request rate and concurrent operations;
- maximum task steps, wall-clock duration and retries;
- provider token and monetary budgets;
- data volume and export limits;
- per-capability and per-target limits;
- anomaly and repeated-denial thresholds.

Budgets are reserved before costly execution and reconciled afterward. Executors cannot edit their own quotas or disable enforcement. Exhaustion yields deny/defer, not silent fallback to a less protected provider or broader scope.

## 12. Audit and privacy requirements

For each decision and side effect, retain only the minimum necessary metadata: decision ID, principal pseudonymous reference, task/correlation ID, capability and module version, target reference or protected digest, risk tier, outcome/reason codes, policy version, evidence references, timestamps, and execution result.

Never put passwords, access tokens, private keys, full email/document bodies, raw ambient audio/video, or biometric templates in ordinary prompts or audit logs. Apply access control, integrity protection, retention limits and deletion rules to security events. Detailed payloads should be stored separately only when necessary and explicitly governed.

## 13. Failure policy

Fail closed for protected operations when IAM, SSM, revocation state, policy version, consent validation or required PAOM checks are unavailable or cannot be trusted. A read-only low-risk operation may continue only if an explicit policy defines a safe offline mode; no executor may invent one.

Do not downgrade assurance, broaden scope, switch identity, bypass a policy service or retry through an unapproved provider as an availability workaround.

## 14. Required acceptance tests

1. A model says “the owner approved”; no trusted approval evidence exists — action is denied.
2. A valid owner session has no capability grant — action is denied.
3. Capability is granted but target is outside the grant — action is denied.
4. A task envelope is valid but does not include the requested capability — action is denied.
5. Envelope expires or is revoked between planning and execution — no side effect occurs.
6. Consent for one email cannot authorize another email or a reply/delete operation.
7. Approval is valid for one recipient/body digest; a changed recipient or body invalidates it.
8. Voice verification alone cannot authorize an R3 action.
9. Step-up succeeds but the capability or target check fails — action remains denied.
10. A stale or unavailable revocation service produces `DEFER_UNKNOWN` or deny, never allow.
11. Budget is reserved before provider execution and cannot be increased by the executor.
12. Retry after an uncertain external side effect does not create a duplicate action.
13. SSM allows reading a personal email but PAOM blocks audible disclosure until the required owner choice.
14. PAOM permits a private display but SSM has no read grant — no content is retrieved or displayed.
15. Audit records contain decision metadata but no secret or protected message body.
16. Changing task, target, amount, recipient, operation or policy version invalidates the prior decision.
17. A revoked module or device cannot continue using a previously issued decision.
18. Emergency stop prevents new protected actions and stops interruptible execution.

## 15. Implementation phases

**Phase A — contracts and policy model:** define action request, grants, risk classification, approval evidence, decision and audit schemas; validate cross-contract references.

**Phase B — deterministic evaluator:** implement a pure policy evaluator with no external side effects; unit-test allow/deny/approval/unknown paths.

**Phase C — enforcement adapters:** require every tool/executor adapter to call SSM and revalidate immediately before side effects.

**Phase D — identity and device integration:** connect IAM and Device Trust Manager; add revocation and recovery tests.

**Phase E — privacy and consent integration:** connect PAOM and Owner Consent Manager; test voice, display, wearable and shared-environment cases.

**Phase F — quotas and audit:** add budget reservation, rate/concurrency limits, tamper-evident events and retention enforcement.

**Phase G — controlled rollout:** feature-flagged, non-production validation first; preserve existing chat behavior and storage. No production activation without a separate explicit owner decision.

## 16. Current v0.1 boundary

For the current prototype, this specification is documentation and contract work only. The chat endpoint does not yet enforce owner authentication, capability grants, Authority Envelopes, consent, PAOM decisions, rate/concurrency/spend limits or this Security Manager decision contract. Do not describe these controls as active until they are implemented and covered by runtime integration tests.
