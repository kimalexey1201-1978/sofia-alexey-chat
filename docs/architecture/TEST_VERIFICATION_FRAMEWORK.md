# Test & Verification Framework

Status: architecture specification; implementation is pending.
Applies to: Sofia Core, all modules/adapters, API Gateway, Android Runtime and cross-platform runtimes.
Baseline: preserve the existing prototype and use the Strangler Pattern. This document does not claim that any test suite, CI gate, security control or runtime capability is already implemented.

## 1. Purpose and governing rules

The framework provides repeatable evidence that a change satisfies its versioned contract, security policy, reliability objectives and user-visible behavior. It is independent from the component being tested wherever practical.

Governing rules:
- A passing unit test is not proof of system-level safety.
- Documentation, schemas and plans do not close implementation audit findings.
- A test result is valid only for the exact source revision, build inputs, environment and test-suite version recorded with it.
- Critical controls require negative tests: prove that prohibited behavior is denied, not merely that permitted behavior works.
- Test failures, missing evidence, skipped mandatory tests, unverifiable build inputs and unknown outcomes block the relevant release gate.
- Test infrastructure must not silently grant permissions, change autonomy level, or bypass production policy.
- Secrets, private user content, raw voice recordings and personal data must not be copied into test artifacts unless strictly necessary, explicitly authorized and protected.

## 2. Verification layers

### L0 — Static and repository checks
Formatting, linting, type checks, dependency and license review, secret scanning, schema syntax, schema compatibility, configuration validation and unsafe-pattern checks.

### L1 — Unit tests
Isolated deterministic tests for policy evaluation, authority checks, routing, validation, budget accounting, lifecycle transitions, memory retention rules, redaction and error handling. External services are replaced with controlled fakes.

### L2 — Contract tests
Validate producer and consumer behavior against the versioned JSON Schemas in `contracts/v1`. Include valid, invalid, boundary, unknown-field, missing-field, enum and version-compatibility cases. A schema being syntactically valid does not prove runtime conformance.

### L3 — Integration tests
Exercise real module boundaries and adapters with test credentials and isolated test accounts. Cover API Gateway, provider adapters, persistence, audit event delivery, update/recovery flows and device gateway boundaries.

### L4 — End-to-end and regression tests
Verify user workflows through the existing prototype and, as migration proceeds, through the new runtime. Preserve existing chat history and avatar behavior. Migration tests must verify backup, import, rollback and no duplicate/lost records.

### L5 — Security and abuse tests
Authentication and authorization bypass, role/prompt injection, client-supplied policy manipulation, CSRF/origin handling, replay, privilege escalation, rate-limit bypass, quota exhaustion, oversized payloads, malformed JSON, secret leakage, log leakage, path traversal and public asset exposure. Include adversarial tests against tool invocation and autonomy boundaries.

### L6 — Reliability and resilience tests
Timeouts, cancellation, retries, jitter, circuit breakers, bulkheads, provider outages, partial responses, duplicate delivery, idempotency, storage failures, clock skew, stale permissions, interrupted updates and unknown completion states. Verify fail-closed behavior where required.

### L7 — Platform and hardware tests
Android tests on supported API levels and representative physical devices. Validate runtime permissions, foreground-service restrictions, background execution, battery impact, audio routing, microphone behavior, Bluetooth/headset paths, camera/OCR permissions, storage access, memory pressure and process death. Emulator results do not replace required physical-device tests. Desktop platform claims require their own platform evidence.

### L8 — Human factors and voice tests
Evaluate wake-word false accepts/rejects, owner speaker verification, diarization, overlap, noise, reverberation, voice separation and segment-level clarification. Include multi-speaker scenarios where bystanders continue speaking while the owner's command is present. Bystander speech alone must not cancel an owner's command. If a segment cannot be recovered, request only that segment again. Voice match alone must never authorize high-impact actions.

## 3. Audit traceability

Every audit finding must map to one or more executable tests and evidence artifacts. Initial mapping:

| Audit ID | Required verification focus |
| --- | --- |
| A-01 | Unauthenticated API requests are rejected; authenticated identity is bound to the request. |
| A-02 | Per-principal and global rate limits, quotas and spend caps are enforced under concurrency and bypass attempts. |
| A-03 | Strict request schemas reject malformed, unsupported and policy-manipulating input. |
| A-04 | Body, message count, message size and nesting limits are enforced before expensive processing. |
| A-05 | Independent deadlines, timeouts, cancellation and unknown-completion handling behave as specified. |
| A-06 | Module boundaries, versioned contracts and lifecycle rules are tested; no hidden dependency on a monolith. |
| A-07 | Android runtime permission, lifecycle, background and device integration behavior is tested on target devices. |
| A-08 | Memory authorization, retention, deletion, encryption and migration are verified; browser storage is not treated as authoritative memory. |
| A-09 | Independent verification, immutable evidence and regression suites are present and exercised. |
| A-10 | Deployment asset allow-list and public-root exposure are tested against the actual built artifact and deployed configuration. |
| A-11 | Secret binding presence is verified through deployment-safe checks; secret values are never printed or stored in evidence. |

An audit item remains open until the required implementation, test coverage, evidence and review are complete. A specification or passing mock test alone cannot close it.

## 4. Test data and environments

- Separate local, CI, staging and production environments; production data is not a default test fixture.
- Use synthetic identities, messages, audio and device records wherever possible.
- Provider tests use isolated credentials with minimal scopes and strict spending limits.
- Test secrets are injected at runtime from the CI secret store and are never committed.
- Keep fixtures deterministic and versioned. Record random seeds when randomness is part of a test.
- Redact tokens, credentials, personal identifiers and sensitive payloads before logs or artifacts are persisted.
- Production smoke tests must be read-only unless a separately approved, reversible test action is explicitly defined.

## 5. Evidence and provenance

Each test run records:
- unique run ID and UTC start/end times;
- repository, branch, exact commit SHA and working-tree state;
- suite ID/version and test layer;
- runtime, OS, device model/API level where applicable;
- build toolchain and dependency-lockfile digest;
- environment identifier (never secret values);
- counts for passed, failed, skipped and blocked tests;
- structured failure summaries and artifact references;
- verifier identity/type and verification timestamp.

Evidence must be tamper-evident. Where supported, generate SHA-256 digests for build outputs, test reports and dependency manifests. Do not treat a digest as proof that the artifact itself is safe.

## 6. Independent verification

The component author must not be the sole verifier for high-risk changes. Verification should use a separate test process, independent policy assertions and, for security-critical releases, a reviewer who did not author the change. The verifier checks the exact candidate commit and confirms that the evidence refers to that same commit.

A model-generated explanation or self-assessment is not independent evidence. Model output may help propose test cases, but test execution and gate decisions must be deterministic and auditable.

## 7. Release gates

- G0 — Change intake: scope, owner, risk tier, affected contracts and audit IDs recorded.
- G1 — Static quality: mandatory static checks and schema validation pass.
- G2 — Component correctness: unit and contract tests pass.
- G3 — System correctness: required integration, regression and migration tests pass.
- G4 — Security and resilience: mandatory abuse, security and fault-injection tests pass.
- G5 — Platform qualification: required Android/device/desktop matrix passes for the claimed platforms.
- G6 — Independent review: evidence provenance, unresolved findings, rollback and recovery plans reviewed.
- G7 — Release authorization: explicit authorized human approval for the target environment and change set.

A gate may be marked not applicable only with a recorded rationale and authorized reviewer. A skipped or inconclusive mandatory test is not a pass. No automatic progression from a passing test to deployment is permitted.

## 8. Prototype-preservation and migration requirements

The current web prototype remains the baseline during gradual migration. Regression coverage must preserve:
- existing chat interaction and `POST /api/chat` behavior unless a versioned migration is approved;
- browser history under `sofia-chat-v3`;
- avatar data under `sofia-avatars-v1`;
- current UI behavior and accessible fallback paths.

Any storage migration requires a recoverable backup, integrity comparison, idempotent import and tested rollback. Browser localStorage is treated as a presentation/cache layer, not authoritative long-term memory.

The existing Worker must eventually be tested to reject client-supplied system/developer policy messages and to enforce server-owned instructions. This is a remediation target, not a claim about current behavior.

## 9. Android toolchain baseline for future implementation

When the Android project is introduced, carry forward the corrected compatibility baseline from the prior engineering review:
- Kotlin 2.2.0;
- Android Gradle Plugin 8.7.3;
- Gradle 8.14.7;
- JDK 17 or newer within the validated toolchain;
- Android SDK API 35;
- AndroidX Media3 1.11.1 where used.

Pin and verify toolchain inputs, record dependency checksums, and verify generated APK/AAB SHA-256 digests. Re-run compatibility checks when any version changes. These are baseline requirements for future Android implementation; they do not mean an Android application or build pipeline currently exists in this repository.

## 10. Current implementation status

This file defines the intended framework only. The framework, test suites, CI gates, hardware matrix, evidence store and independent verifier remain to be implemented and demonstrated. Audit remediation status remains pending until implementation evidence is reviewed.
