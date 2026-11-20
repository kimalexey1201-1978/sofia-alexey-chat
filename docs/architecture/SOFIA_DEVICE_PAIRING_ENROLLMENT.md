# Sofia Device Pairing & Enrollment — Architecture Specification v1

## Status and boundary

Architecture and contract specification only. This document does not implement a pairing UI, broker, cryptographic verifier, secure credential vault, registry database, permission prompt, Android service, or device adapter. It does not change `main`, the production chat, deployment settings, Cloudflare configuration, secrets, or existing device/IAM/DTM/CPR contracts.

## 1. Purpose

The Device Pairing & Enrollment flow is the owner-visible orchestration for onboarding one exact physical or virtual device into Sofia. It coordinates existing managers; it does not replace them.

Its responsibilities are to:
- present a discovered candidate without treating discovery as identity;
- authenticate the owner through IAM and bind the session to the enrollment;
- disclose the exact device identity claims, requested capabilities, operations, targets, data classes, platform permissions, external data flows, risks and resource implications;
- obtain explicit, action-bound owner consent for the association and the exact requested permission set;
- request device proof from DTM and receive its independently produced trust assessment;
- ask SDM to create/update the canonical registry record only after the required gates;
- submit capability requests to CPR, which alone records any resulting capability grants;
- report partial, blocked, rejected, expired and completed outcomes honestly.

The enrollment broker is an orchestration boundary, not a trust authority, identity provider, permission issuer, or device command executor.

## 2. Authority boundaries and control flow

The broker coordinates the following sequence:

1. **Candidate discovery (SDM/adapter):** collect minimum metadata. Candidate remains `DISCOVERED`; advertisements, names, QR payloads and proximity are untrusted.
2. **Owner authentication (IAM):** require a valid owner session with sufficient assurance for the device class and requested risk. Bind principal, session and authentication assurance to the transaction.
3. **Capability disclosure:** resolve declarations against Sofia-owned capability definitions. Display exact operations, targets, data classes, sensor access, physical side effects, platform permissions, external processors/data egress, risk tier, duration and resource limits. Unknown declarations or pricing/egress facts remain explicit unknowns.
4. **Owner decision:** capture separate decisions for device association and each capability/scope. Declining a capability must not block a lower-scope enrollment unless the association itself depends on it. No preselected broad grants.
5. **Pairing ceremony (DTM):** request a fresh single-use challenge bound to this transaction, owner session, candidate, audience, protocol and expiry. DTM validates cryptographic proof, replay state, key binding and supported attestation. The broker never validates cryptography itself and never accepts client-supplied success flags.
6. **Trust assessment (DTM):** consume the DTM-issued, time-bounded assessment. `unknown`, `untrusted`, `revoked`, expired or scope-inadequate results block the corresponding protected enrollment path. A lower-assurance manual association is possible only if policy explicitly permits it and must remain labeled as such; it cannot authorize R3 physical control or administration.
7. **Registry commit (SDM):** only after association consent and the required proof/assessment, ask SDM to persist the device and pairing metadata. SDM owns lifecycle transitions. The broker cannot set `TRUSTED` directly.
8. **Permission decision (CPR):** submit only the owner-approved subset of declared capabilities, operations, target/data scope and constraints. CPR independently validates definitions, module/version compatibility, risk ceiling and policy, then issues or refuses grants. An enrollment success does not imply that any capability grant exists.
9. **Protected use:** future operations still require TPOE planning, IAM context, DTM freshness, CPR grant, DGLM, SSM, RBM and ES. Enrollment is not a standing approval for device commands.
10. **Audit:** emit correlated, minimal events for each transition and decision. Never log raw secrets, private keys, full QR contents, sensor payloads or unnecessary personal data.

## 3. Enrollment transaction and state machine

Each enrollment has a unique immutable transaction ID, owner principal/session references, candidate device reference, exact capability-request snapshot digest, policy/contract versions, creation and expiry times, correlation ID and idempotency key.

Recommended states:
- `created`: transaction allocated; no device association.
- `candidate_selected`: owner selected one exact candidate.
- `owner_auth_required`: IAM authentication/step-up is outstanding.
- `disclosure_pending`: declarations and permission facts are being resolved.
- `awaiting_owner_consent`: owner has not yet approved the displayed association/request snapshot.
- `consent_rejected`: owner declined; no pairing challenge or registry privilege is created.
- `pairing_pending`: owner consent exists and DTM pairing ceremony is in progress.
- `proof_submitted`: device proof was submitted to DTM; not yet trusted.
- `trust_pending`: DTM assessment is outstanding.
- `trust_limited`: DTM permits only explicitly listed use classes; continue only within policy.
- `registry_pending`: SDM registry commit is outstanding.
- `permission_review_pending`: registry association is complete or limited; CPR is evaluating exact grants.
- `partially_enrolled`: device association/registration succeeded but one or more optional capability grants were declined, denied or unavailable.
- `completed`: association and all required enrollment steps completed; grants are enumerated explicitly.
- `blocked`: a mandatory security, policy, trust, compatibility or resource gate failed.
- `expired`: transaction/challenge/consent expired.
- `cancelled`: owner or authorized policy cancelled before irreversible completion.
- `revocation_pending`: a revoke/suspend request is propagating.
- `revoked`: association/credential or transaction was revoked.

Transitions are monotonic where practical and must be audit-recorded. A new attempt after expiry, replay, changed candidate identity or changed capability snapshot creates a new transaction and fresh challenge; it must not silently mutate an approved transaction.

## 4. Owner-facing disclosure and consent

Before pairing begins, present a human-readable review screen that identifies:
- exact candidate device (claimed name/class/manufacturer/model/platform and available distinguishing evidence);
- proof method and what it can/cannot verify;
- every requested capability, operation and target scope;
- data classes and whether data remains local or leaves the device;
- sensor access (microphone, camera, location, health/fitness, environmental sensors);
- physical side effects (locks, vehicle, alarms, climate, power, machinery);
- Android/OS permission prompts and limitations;
- risk tier, requested duration, call/resource limits and any cost/data-usage uncertainty;
- trust/attestation support limitations;
- optional requests that can be declined independently.

Consent is bound to the exact transaction ID, candidate device reference, normalized request digest, disclosed policy version, owner principal/session, decision, timestamp and expiry. Any change to device, capability, operation, target, data class, external processor, risk, duration or material disclosure invalidates the consent and requires a new review. UI text, model summaries and QR/device-provided descriptions are untrusted; the disclosure is assembled from validated Sofia-owned definitions and trusted adapter metadata.

Pairing consent and capability authorization are separate records and decisions. No blanket “trust this device” action may grant every current or future capability.

## 5. DTM, SDM and CPR integration contracts

### DTM
- Broker requests challenge issuance and submits proof references/payload through a protected interface.
- DTM owns challenge generation, cryptographic validation, replay protection, credential registration metadata, attestation evaluation and trust assessment.
- Broker stores only opaque references and normalized status; never receives private key material or secrets.
- A challenge is single-use, short-lived and transaction-bound. A retry gets a fresh challenge.

### SDM
- Broker submits a validated enrollment package containing candidate metadata, consent reference, DTM assessment reference, credential reference and declared capability references.
- SDM validates references and owns lifecycle transitions and registry persistence.
- Registry state must reflect the evidence: do not set `TRUSTED` when DTM says unknown or trusted-with-limits outside the allowed use classes.
- SDM returns a canonical device reference and commit result. Broker does not fabricate registry success.

### CPR
- Broker submits only the owner's approved subset, not the original broad manifest request.
- CPR evaluates each capability independently and creates a grant only after its own authorization flow.
- Grant must bind principal, module/version where applicable, capability, operations, exact device/target scope, data scope, risk ceiling, expiry and constraints.
- A denial for one optional capability does not silently widen or substitute another capability.
- A grant may be narrower than the owner's request. The broker must show the effective result.

## 6. Cancellation, recovery and revocation

- Cancellation before challenge issuance stops the transaction without device privileges.
- Cancellation after challenge issuance revokes/invalidates the outstanding challenge through DTM.
- Cancellation after credential creation or registry commit triggers the appropriate SDM/DTM/CPR suspend or revoke workflow; it must not report a clean rollback until downstream confirmations arrive.
- Lost/stolen/compromised device handling invokes DTM/SDM revocation and CPR grant invalidation, then propagates to IAM sessions, SSM caches, ES queues and adapter sessions according to the existing revocation contract.
- Recovery/re-pairing requires fresh owner authentication and a new transaction. Previous grants are not restored automatically.
- If a remote side effect or registry write has an unknown outcome, reconcile by transaction/idempotency reference before retrying. Never create duplicate device records or duplicate grants.
- Owner can inspect enrolled devices and revoke association or individual grants independently.

## 7. Reliability, idempotency and failure behavior

Every request carries transaction, correlation and idempotency references. Repeated identical requests return the prior outcome; they do not repeat pairing ceremonies or grant issuance. Changed request digest requires fresh consent and a new transaction.

Fail closed for:
- invalid/expired/revoked owner session;
- mismatched candidate, session, audience, key or transaction;
- reused/expired challenge or invalid proof;
- missing, stale, contradictory or revoked trust evidence;
- unsupported/unknown capability definition or contract version;
- disclosure/request digest mismatch;
- missing consent for any requested scope;
- failed SDM/CPR integrity or authorization checks;
- unknown resource/cost route where policy requires a known value;
- unresolved partial outcome for a non-idempotent step.

Expose stable reason codes and partial outcomes. A transport timeout is not proof that the remote operation failed. Do not blindly retry a non-idempotent operation.

## 8. Android-first and cross-platform behavior

Android is the first target. The enrollment UX must use supported Android runtime permission and secure-pairing APIs, respect nearby-device/Bluetooth permission changes, background execution limits and foreground-service requirements, and explain when the OS itself must display a permission dialog. The broker cannot silently grant OS permissions or promise background discovery when Android disallows it.

For unsupported platforms or devices, list only capabilities actually exposed by their adapters. Attestation, hardware-backed keys, secure pairing and out-of-band confirmation are capability-dependent. Unsupported evidence is reported as `not_supported`, never simulated. Later Windows, Linux, macOS, iOS, vehicle and smart-home adapters must implement the same versioned transaction semantics.

## 9. Audit and privacy

Audit events include transaction ID, state transition, actor/session reference, device reference, request digest, consent reference, challenge/assessment/credential references, registry result, grant references, reason code, policy version and timestamps. Keep payloads minimized. Never store private key material, raw biometric data, bearer tokens, full ambient audio/video, or full sensor streams in enrollment records or audit events.

Retention, deletion and export are governed by DGLM. Removing a device must also evaluate credential records, derived metadata, grants, active sessions, cached decisions and queued work; preserve only minimal audit evidence required by policy.

## 10. Acceptance tests

1. Discovery or QR scan alone never creates a paired/trusted device.
2. Invalid or expired IAM session prevents enrollment.
3. Owner sees exact device and capability disclosure before consent.
4. Consent is bound to a request digest; changing one operation or target invalidates it.
5. Declining a sensor capability does not grant it through a fallback.
6. A device cannot submit a client-side `verified=true` flag to bypass DTM.
7. Replayed, expired, wrong-device or wrong-session challenges are rejected by DTM.
8. Broker cannot issue or alter a DTM trust assessment.
9. Unknown or revoked trust blocks protected enrollment.
10. Trusted-with-limits permits only listed use classes.
11. Broker cannot write SDM lifecycle state directly.
12. Registry commit timeout is reconciled before retry; duplicate device records are not created.
13. Enrollment completion does not create a CPR grant unless CPR explicitly issues one.
14. A capability grant is narrower than or equal to the owner-approved request.
15. Revocation invalidates credentials, grants, sessions, caches, queues and adapter sessions as applicable.
16. Expired or changed enrollment requires fresh consent and challenge.
17. Android OS permission denial is reported accurately and does not get bypassed.
18. No secrets, raw keys, QR payloads or sensor content appear in prompts/logs.
19. A failed optional grant produces a truthful partial-enrollment result.
20. A successful enrollment never bypasses per-action SSM, RBM, DGLM or ES checks.

## 11. Implementation sequence

1. Define and validate transaction, consent and result contracts.
2. Implement a deterministic enrollment state machine with mock IAM/DTM/SDM/CPR adapters.
3. Add audit/idempotency and failure-injection tests.
4. Add owner-visible Android enrollment/review UI.
5. Integrate DTM challenge/proof APIs and protected credential references.
6. Integrate SDM registry commit and CPR per-capability grants.
7. Add revocation propagation, recovery and lifecycle UI.
8. Conduct security review and platform-specific testing before enabling real devices.

No stage should be described as implemented until runtime code and acceptance tests exist.
