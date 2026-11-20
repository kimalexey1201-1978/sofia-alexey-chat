# Sofia Core v0.1 — Implementation Readiness & Verification Gate

**Status:** acceptance baseline for the transition from architecture to implementation.  
**Branch:** `core/v0.1-minimal-cycle`.  
**Scope:** controlled development only; this document does not authorize production deployment, merge to `main`, secrets changes, Cloudflare changes or paid services.

## 1. Purpose

This gate defines when Sofia's architecture preparation is sufficiently complete to begin building the executable Core v0.1 vertical slice. It prevents a documentation milestone from being mistaken for a tested implementation milestone.

There are four distinct maturity states:
- **SPECIFIED:** responsibility, boundaries, data flow and failure behavior are documented.
- **CONTRACTED:** machine-readable interfaces and representative payloads exist and validate.
- **IMPLEMENTED:** executable code exists behind a controlled interface.
- **VERIFIED:** automated tests, security checks, compatibility checks and required practical tests pass for the stated scope.

A component may be specified without being contracted, implemented or verified. Status must be reported per component and per capability, not as a single vague project percentage.

## 2. Entry criteria for implementation

The architecture-to-implementation gate passes only when:

1. Component ownership and non-overlapping authority are documented.
2. The v0.1 vertical slice and explicit exclusions are frozen.
3. Required contracts are identified, versioned and validated against Draft 2020-12.
4. Contract references, enums, identifiers and compatibility rules have been checked across modules.
5. Security, privacy, data lifecycle and FREE_ONLY constraints are represented in the implementation plan.
6. Existing prototype behavior and regression tests are inventoried.
7. Migration boundaries preserve the current chat API, frontend behavior, localStorage keys and production deployment.
8. Every v0.1 requirement has an acceptance test or a documented reason why it is deferred.
9. Development uses mock/synthetic fixtures by default; live providers are optional and never required for baseline tests.
10. No unresolved decision blocks the chosen vertical slice.

A decision that is irrelevant to the first slice may remain open, but must be recorded with its future dependency and must not be silently assumed.

## 3. Minimum executable Sofia Core v0.1 vertical slice

The first slice should prove a small, end-to-end, deterministic cycle without attempting full autonomy:

1. Receive the existing chat request through a compatibility adapter.
2. Validate request shape, role, message limits and content bounds.
3. Construct a server-owned system instruction; client input cannot override it.
4. Build a bounded task/request context without accessing unauthorized sources.
5. Select a registered mock provider through a minimal provider interface.
6. Invoke provider with timeout, cancellation and bounded output.
7. Normalize success, validation failure, timeout and provider failure into stable result types.
8. Independently validate response structure and output limits.
9. Return the existing OpenAI-compatible response contract.
10. Preserve frontend history and retry behavior.
11. Emit minimal correlation-aware audit/diagnostic events without logging secrets or full private content.
12. Stop safely on policy, quota or provider uncertainty.

This slice is not an autonomous agent system. It does not include external tool execution, mail, calendar, device control, proactive monitoring, durable memory learning, voice or background operation.

## 4. Required test layers

### 4.1 Contract tests
- Parse every schema using Draft 2020-12.
- Validate valid and invalid fixtures.
- Reject unknown properties where contracts are strict.
- Check references, enums, required fields, bounds, date/time formats and version metadata.
- Verify producer output validates against consumer input.
- Test backward compatibility and explicit major-version rejection.

### 4.2 Unit tests
- Input validation and prompt boundary.
- Provider interface and registry selection.
- Timeout, cancellation and retry classification.
- Error normalization and secret redaction.
- Output validation and size limits.
- Deterministic state transitions and idempotency where applicable.

### 4.3 Integration tests
- Worker → Core → mock provider → normalized result → Worker response.
- Legacy request/history compatibility.
- Malformed input, oversized body, missing provider configuration and provider failure.
- Timeout and abort behavior.
- CORS behavior as browser policy only, never treated as authentication.
- Correlation identifiers and audit events.

### 4.4 Regression tests
- Existing chat sends and receives text.
- Existing chat history remains readable and persists under current keys.
- Avatar behavior remains intact.
- Retry reuses the correct request snapshot and does not duplicate user messages.
- Errors are not appended as assistant conversation content.
- In-flight controls remain consistent.
- Existing response rendering remains compatible.

### 4.5 Security and privacy tests
- Client-supplied system prompt cannot override server-owned instructions.
- No secrets in client bundles, responses, logs or audit payloads.
- No external call without an explicit provider selection and allowed configuration.
- Unauthorized principal cannot access owner-scoped data once IAM is introduced.
- Revoked/expired grants are rejected.
- Prompt injection in retrieved content cannot alter policy or permissions.
- FREE_ONLY blocks unknown, paid, overage and paid-fallback routes before invocation.
- Sensitive output is withheld when PAOM cannot establish a permitted route.
- Deletion and revocation invalidate dependent records and pending work.

### 4.6 Resource and reliability tests
- Bounded request size, concurrency, execution time and output size.
- Predictable behavior on rate/quota exhaustion.
- No unbounded retries or recursive task expansion.
- Cancellation releases resources and stops downstream work.
- Outcome-unknown side effects are reconciled before retry.
- Optional subsystem failure does not crash ordinary chat.

### 4.7 Platform and compatibility tests
- Worker runtime compatibility and supported APIs.
- Frontend browser compatibility.
- Android minimum/target SDK and permission lifecycle.
- Process death, Doze, offline/online transition and battery restrictions for background-capable features.
- Bluetooth/nearby, scoped storage, notifications and foreground service rules for relevant device capabilities.
- Real device tests before enabling hardware-specific behavior.

## 5. CI quality gates

A change is eligible for integration only when:
- formatting/lint checks pass where configured;
- unit, contract, integration and regression tests pass;
- no critical/high security finding remains unresolved for the changed scope;
- schema compatibility checks pass;
- dependency and secret scans pass where configured;
- build artifacts are reproducible;
- test results identify commit SHA, runtime version and test scope;
- failed or skipped checks are visible and never reported as passing.

A green CI result proves only the checks actually run. It does not prove production readiness, provider compliance, Android hardware compatibility or security beyond the tested scope.

## 6. Compatibility matrix

Maintain an explicit matrix with rows for:
- existing frontend ↔ Worker response contract;
- Worker ↔ Sofia Core request/result contract;
- Sofia Core ↔ provider adapter;
- TPOE ↔ task/plan contracts;
- ES ↔ module manifest and execution contracts;
- ES ↔ CPR/SSM/RBM/DGLM decisions;
- Event Bus ↔ DESSM/RTCSAM event contracts;
- RTCSAM ↔ KRE context/evidence contracts;
- Memory Manager ↔ MIV memory verification contracts;
- PIAM ↔ TPOE/PAOM/event contracts;
- Device Manager ↔ DTM/DCB/Android Host contracts;
- Communication Gateway ↔ connector/webhook contracts.

For each pair record producer version, consumer version, adapter/migration version, test evidence, status and known limitations.

## 7. Required implementation sequence

**Phase A — Baseline and regression**
- Capture current branch commit and source inventory.
- Run existing tests without modifications.
- Record exact baseline test results.
- Verify the production branch remains untouched.

**Phase B — Core vertical slice**
- Implement only the minimum Core orchestration path and provider adapter boundary.
- Use mock provider fixtures by default.
- Preserve the existing Worker and frontend compatibility.
- Add contract, unit, integration and regression tests.

**Phase C — Security prerequisites**
- Implement authenticated principal/session validation before owner-specific data or privileged actions.
- Add capability/permission decisions and resource gates before external tools.
- Add audit, data-purpose and deletion/revocation controls before persistent integrations.

**Phase D — Controlled capability integration**
- Add one low-risk executor behind ES and a brokered capability adapter.
- Add independent verification and failure containment.
- Expand only after acceptance tests and security review.

**Phase E — Android host**
- Build the Android host and runtime lifecycle behind stable contracts.
- Validate permissions, sandbox, resource limits and OS scheduling behavior on target devices.
- Add wearables/devices only through registered, trusted adapters.

Voice, proactive assistance, multi-agent routing, self-development and autonomous long-running tasks remain later gated capabilities.

## 8. Definition of done for the first implementation milestone

Sofia Core v0.1 is ready for a controlled implementation milestone only when:
- the minimum vertical slice runs locally or in a non-production test environment;
- mock-provider end-to-end tests pass;
- existing chat regression tests pass;
- request and response contracts are preserved;
- timeout, cancellation and error paths are tested;
- no secret or paid dependency is required;
- architecture boundaries are enforced in code, not merely described;
- the exact limitations are documented;
- a rollback path exists;
- no production deployment has occurred without separate approval.

The phrase “we are building Sofia's brain” should be used only after this milestone begins with executable Core code and test evidence. “Ready to build” means the gate is satisfied; it does not mean the Core is already implemented.

## 9. Release and owner approval boundaries

This readiness gate does not grant permission to:
- merge into `main`;
- deploy to Cloudflare or GitHub Pages;
- modify production environment variables or secrets;
- connect real email, messaging, calendar, payment or device accounts;
- perform external side effects;
- enable continuous microphone/camera/sensor collection;
- spend money or use paid services.

Those actions require their own explicit authorization and safety gates. The owner's current authorization covers autonomous completion of architecture work in the development branch only.

## 10. Current status at document creation

Based on the inspected development-branch architecture and prototype records:
- the text chat prototype and several Core/Worker/provider pieces exist;
- many security, memory, orchestration, device, integration and proactive subsystems are specified but not implemented;
- several contract families exist and need a full automated cross-contract validation pass;
- the current Worker lacks authenticated owner identity/session validation;
- browser chat history remains in localStorage;
- provider data handling and quota/spend controls require implementation and verification;
- live device, Android lifecycle, connector and voice compatibility tests have not been completed.

Therefore, **the project is not yet at the real implementation-readiness gate for the full Sofia assistant.** The next work is to complete the machine-checked architecture/contract baseline and identify the smallest safe v0.1 implementation slice. This is a precise status statement, not a failure of the project.

## 11. Status reporting format

Every progress report should separate:
- **Specified:** documented architecture and contracts.
- **Implemented:** code committed and source path.
- **Tested:** exact command/suite, commit SHA and result.
- **Compatibility-checked:** producer/consumer/platform pair and evidence.
- **Deployed:** environment and deployment identifier, only if explicitly authorized.

Never convert a design decision into a claim of implementation or a passing test.
