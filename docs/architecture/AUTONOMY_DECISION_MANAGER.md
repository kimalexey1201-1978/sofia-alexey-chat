# Autonomy & Decision Manager

**Status:** Architecture specification; not an implementation claim.  
**Contract baseline:** v1  
**Purpose:** govern when Sofia may act independently, when it must ask, and how decisions are bounded, verified and audited.

## 1. Purpose and governing principle

The Autonomy & Decision Manager (ADM) defines the authority envelope for autonomous behavior. It converts user-approved goals and system policy into bounded decision permissions. It does not give a language model unrestricted authority.

Autonomy is a controlled operating mode, not a global on/off switch. Every action remains subject to identity, policy, capability, resource, lifecycle and audit controls. The model may propose goals, plans and actions; it cannot grant itself permissions, expand its own authority or treat inferred intent as approval.

## 2. Separation of responsibilities

- **Task Orchestrator:** decomposes goals into executable steps and coordinates execution.
- **ADM:** determines the permitted autonomy level, constraints, approval gates and stop conditions for a task or action.
- **Security Manager:** makes authoritative allow/deny decisions for operations and permission grants.
- **Identity & Authentication Manager:** establishes who is requesting or approving an action and the required assurance level.
- **Module/Device/Communication managers:** expose only validated capabilities through approved contracts.
- **Resource & Runtime Manager:** enforces compute, time, network, battery and other budgets.
- **Audit & Observability Manager:** records decisions, approvals, execution and verification evidence.

ADM cannot override a denial from Security Manager or a platform/OS restriction.

## 3. Autonomy levels

Use explicit, task-scoped levels. The numeric labels are policy identifiers, not an assertion that every action at a level is inherently safe.

- **A0 — Observe:** read only explicitly authorized context; no external side effects.
- **A1 — Recommend:** analyze and propose options; no external side effects.
- **A2 — Prepare:** create drafts, plans or reversible local preparations; external execution remains gated.
- **A3 — Execute bounded routine:** perform pre-approved, low-risk, reversible actions within a narrowly defined scope, budget, target set and time window.
- **A4 — Supervised multi-step:** execute an approved plan with checkpoints; consequential or out-of-scope steps require fresh approval.
- **A5 — Restricted high-impact:** no general autonomous execution. Each high-impact action requires explicit, fresh, action-specific authorization and stronger authentication where policy requires it.

A task may operate at different levels for different steps. The least-authority level required by each step is used. User preferences may lower autonomy but cannot raise it above policy limits.

## 4. Risk tiers and autonomy are independent

Risk tier describes impact; autonomy level describes permitted operating mode. They must not be collapsed into one score.

- R0: informational/read-only.
- R1: low-impact, reversible.
- R2: consequential or externally visible.
- R3: high-impact, safety/security/financial/legal/physical access or difficult-to-reverse.

Policy maps each capability and context to required autonomy, identity assurance, approval and verification. An R3 action is never made safe merely by assigning a high autonomy level or by being included in a model-generated plan.

## 5. Authority envelope

Every autonomous task must have an explicit authority envelope containing:
- requesting principal and authentication context;
- approved goal and task scope;
- allowed capability IDs and target resources;
- autonomy ceiling and risk constraints;
- permitted data scope and purpose;
- maximum duration, steps, retries and resource budget;
- financial or transaction limits where relevant;
- allowed time window and geographic/device constraints where applicable;
- prohibited actions and mandatory approval gates;
- stop conditions, expiry and revocation reference.

No implicit expansion is allowed. If the task encounters a new recipient, device, account, data class, cost, irreversible action or capability outside the envelope, pause and request authorization.

## 6. Decision protocol

For each proposed action:
1. identify the action, target, expected effects and reversibility;
2. classify capability, risk tier and data sensitivity;
3. verify task scope and authority-envelope coverage;
4. confirm module/device/channel lifecycle and compatibility;
5. obtain a fresh Security Manager decision;
6. check identity assurance and required owner approval;
7. reserve resource budget and check deadlines;
8. execute only through an approved adapter or capability contract;
9. verify outcome independently where possible;
10. record decision, evidence, state and any deviation.

A model confidence score is not an authorization signal. Missing information, ambiguous targets or conflicting evidence must result in clarification or a safe stop.

## 7. Approval and delegation

Approvals are scoped, time-limited, non-transferable and bound to the exact action parameters, target, amount/data scope and operation ID. A material change invalidates the approval.

Delegation to a module, provider or sub-agent grants only the minimum capability and budget required for the assigned step. Delegated work cannot create further delegation unless explicitly allowed by policy. Revocation propagates to delegated credentials and active tasks.

Voice recognition or wake-word detection alone cannot approve high-impact actions. Use step-up authentication or an explicit confirmation channel according to the risk policy.

## 8. Monitoring, checkpoints and stop conditions

Long-running tasks must expose progress, current step, next intended action, resource use and pending approvals. Define checkpoints before external side effects and irreversible transitions.

Stop or pause when:
- scope or authority expires;
- identity or device trust changes;
- a permission is revoked or policy denies an action;
- a target or amount becomes ambiguous;
- a required dependency becomes unavailable or revoked;
- resource, time, cost or retry budget is exceeded;
- verification fails or unexpected side effects occur;
- the user requests cancellation or emergency stop.

Emergency stop must not depend on model cooperation. It must block new dispatch and trigger safe cancellation/draining through the Orchestrator.

## 9. Verification and accountability

Distinguish planned, attempted, accepted, completed and independently verified outcomes. Sending a request is not proof that an external action completed. Use provider receipts, device state checks, transaction identifiers or independent observations where supported.

If verification is unavailable, report the result as unverified. Never fabricate success. Preserve evidence references and explain material uncertainty to the user.

## 10. Learning and policy adaptation

ADM may recommend improved workflows from observed outcomes, but it cannot silently increase autonomy or weaken safeguards. Changes to autonomy profiles, risk mappings, approval rules or authority envelopes require versioned policy review and authorized approval. Maintain rollback to the prior policy revision.

## 11. Privacy and transparency

Use only data necessary for the approved task. Tell the user what the system intends to do, what it has done and what remains pending. Do not expose private context to a delegated module unless required and authorized. Record policy decisions and approvals without logging secrets or unnecessary sensitive payloads.

## 12. Acceptance criteria

- Every autonomous task has a bounded, expiring authority envelope.
- Model proposals cannot grant permissions or override policy.
- Risk tier and autonomy level are evaluated independently.
- High-impact actions require fresh, action-specific approval.
- Changed parameters invalidate prior approval.
- Delegated modules receive least-privilege, revocable authority.
- Scope, time, cost, resource and retry limits are enforced.
- Emergency stop blocks new dispatch independently of model output.
- Outcomes distinguish attempted, completed and verified.
- Unverified outcomes are never reported as confirmed success.
- Autonomy policy changes are versioned, reviewed and auditable.
- Ambiguous or out-of-scope actions pause for clarification.

**Implementation note:** this document defines the intended control model. It does not claim that autonomous execution or approval enforcement is already implemented.
