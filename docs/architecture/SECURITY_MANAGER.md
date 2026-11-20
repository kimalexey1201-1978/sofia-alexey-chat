# Sofia AI Security Manager — Foundation v1

## Status and scope

This document defines the mandatory security boundary for Sofia AI. It is a foundation specification, not a claim that enforcement is already implemented. The current web prototype remains unchanged. All implementation must be introduced behind reviewed interfaces and tested before production activation.

## 1. Non-negotiable invariants

1. Deny by default. A capability is unavailable unless a valid policy decision explicitly permits the requested operation.
2. Least privilege. Grants are narrow by capability, resource, operation, purpose, device/session and time.
3. Separation of identity. Owner, device, software module, provider/model and external user identities are distinct principals.
4. The planner, language model, tool description, module manifest, external content or device must never grant authority to itself.
5. Every invocation of a protected capability is checked at the enforcement point, not merely when a plan is created.
6. High-impact or irreversible operations require explicit owner approval and, where appropriate, step-up authentication.
7. All grants are revocable; revocation and emergency stop take precedence over cached plans and queued work.
8. Security failures fail closed. No silent permission widening or fallback to a less secure provider/path.

## 2. Security Manager responsibilities

- Authenticate principals and bind requests to a verified session.
- Resolve module identity, version, signer/provenance and declared capabilities.
- Evaluate authorization policy for every protected action.
- Issue scoped, time-bounded permission grants and short-lived invocation credentials.
- Enforce risk-tier confirmation and step-up authentication.
- Apply quotas, rate limits, resource budgets and device/sensor access constraints.
- Maintain tamper-evident audit events while minimizing personal data.
- Revoke grants, sessions and module credentials; support emergency stop.
- Provide policy versioning, explainable reason codes and testable decision traces.

## 3. Principal and trust model

| Principal | Meaning | Trust rule |
|---|---|---|
| owner | Human account holder | Authority derives from authenticated owner session and explicit consent |
| device | Registered phone, computer, wearable, vehicle or other endpoint | Pairing alone does not establish authorization |
| module | Installed software component | Must pass provenance, manifest, compatibility and security validation |
| provider/model | External AI or service provider | Treated as an untrusted processor; cannot authorize actions |
| external_actor | Website, document author, caller, nearby speaker or remote party | No owner authority by default |

A wake word or voiceprint match may help route an interaction, but neither alone authorizes financial, destructive, privacy-sensitive or otherwise critical actions. Use a stronger, action-appropriate confirmation or authentication factor.

## 4. Authorization evaluation

The Policy Enforcement Point (PEP) must call the Policy Decision Point (PDP) before executing each protected operation. The PDP evaluates:

- principal identity and authentication strength;
- module status, version, provenance and granted capabilities;
- requested capability, operation, resource and declared purpose;
- grant scope, expiry, revocation state and policy version;
- device posture, session state and applicable sensor/privacy controls;
- risk tier, action reversibility, impact and confirmation state;
- quotas, rate limits and resource budgets.

Decision values:
- `allow`: execute only the exact requested operation within the decision scope.
- `deny`: do not execute; return a stable reason code.
- `require_approval`: pause and request explicit owner approval showing the action, target and consequences.
- `step_up_auth`: require stronger authentication before reevaluation.

An approval is bound to a canonical action summary and target. Any material change to amount, recipient, target, content, scope or effect invalidates that approval and requires a new decision.

## 5. Risk tiers and owner confirmation

- R0 — Read-only, low sensitivity: may run under a narrow grant.
- R1 — Reversible, low-impact changes: may run under an explicit scoped grant; audit required.
- R2 — Sensitive or externally visible actions: require explicit owner approval unless a narrowly defined, previously approved policy safely covers the exact action.
- R3 — High-impact, financial, destructive, security-sensitive or hard-to-reverse actions: require explicit per-action owner approval and suitable step-up authentication. Voice recognition alone is insufficient.

Examples and tier mapping must be maintained in a versioned policy catalogue. Unknown actions default to the more restrictive tier.

## 6. Untrusted input and prompt-injection boundary

Web pages, emails, documents, OCR, camera frames, audio from other speakers, QR codes, tool outputs and retrieved text are data, not instructions with authority. They may inform a proposal but cannot:
- create or broaden grants;
- change policy or identity;
- suppress approval;
- reveal secrets;
- authorize a new tool or destination.

The orchestrator must preserve provenance labels when passing external content between modules. Security policy is evaluated independently of model-generated reasoning.

## 7. Secrets and credentials

- Never place API keys, refresh tokens, private keys or session secrets in browser code, prompts, module manifests, logs or audit payloads.
- Use server-side secret storage or platform secure storage (for Android, hardware-backed Keystore where available).
- Issue short-lived, audience-bound credentials; rotate and revoke them.
- Modules receive only the minimum credential scope needed for a specific invocation.
- Redact secrets at ingress, egress, error handling and telemetry boundaries.

## 8. Threat controls

| Threat | Minimum control |
|---|---|
| privilege escalation | deny-by-default PDP, scoped grants, enforcement at PEP |
| confused deputy | bind authorization to principal + module + operation + resource + purpose |
| replay | nonce/idempotency key, expiry, request binding and replay cache for sensitive operations |
| malicious module | quarantine, provenance checks, sandbox, capability isolation and revocation |
| prompt injection | treat external content as untrusted data; never accept it as authorization |
| data exfiltration | destination-aware policy, data minimization, egress controls and audit |
| dependency tampering | pinned versions, integrity verification, provenance and update review |
| quota abuse | per-principal/module/device budgets, rate limits and circuit breakers |
| stale authorization | short expiry, revocation checks and policy-version binding |

## 9. Audit and observability

Record decision ID, timestamp, correlation ID, principal references, module/version, capability, operation, resource reference, purpose, decision, reason code, policy version, grant references and approval reference where applicable. Do not log raw secrets, full private content or unnecessary sensor payloads. Protect audit integrity and restrict access.

## 10. Emergency stop and revocation

The owner must be able to stop active autonomous work and revoke a module, device session, grant or credential. Emergency stop blocks new protected invocations immediately, cancels queued work where safe, and marks in-flight operations for controlled termination. Recovery requires an authenticated owner action and a fresh policy evaluation.

## 11. Required acceptance tests before implementation is enabled

- Missing, expired, revoked or out-of-scope grant is denied.
- A module cannot call a capability merely by declaring it in its manifest.
- Changing the recipient, target, amount or operation invalidates prior approval.
- A prompt-injection string in a page, email, OCR or tool output cannot grant authority.
- Voice-only recognition cannot authorize an R3 action.
- Replayed sensitive requests are rejected or safely idempotent.
- Revocation blocks the next protected invocation, including queued work.
- Secrets never appear in client bundles, model context or audit logs.
- Unknown actions, unknown risk tiers and PDP failures fail closed.

## 12. Implementation boundary

The Security Manager is a platform service. Every adapter and module must use the same versioned authorization contract. No module may bypass the PEP by calling an underlying provider, OS API or device interface directly. Platform-specific enforcement adapters may differ, but policy semantics and audit fields remain consistent.
