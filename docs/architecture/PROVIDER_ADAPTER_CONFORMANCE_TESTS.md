# Provider Adapter Conformance — End-to-End Test Specification v1

## Status

**Status:** Implemented integration tests using a deterministic in-process mock.  
**Coverage:** Adapter lifecycle guard → provider-adapter admission → Execution Supervisor admission → mock AI provider → normalized result validation.

This is a test-only composition. It is not a production dispatcher, durable registry, security reference monitor or live provider route.

## 1. Verified path

The integration suite composes existing pure components:
1. Registry lifecycle evaluator rejects unsafe activation transitions.
2. Provider Adapter Policy verifies enabled status, immutable identity/digest shape, contract version, declared operation and platform.
3. Execution Supervisor checks the supplied request, module/trust/grant/authority/security/resource evidence and FREE_ONLY zero-cost reservation.
4. Only after both admission checks pass does the test invoke the deterministic mock.
5. The result is normalized through the shared AI provider result validator.

The Execution Supervisor evaluator explicitly reports `dispatchPerformed: false`; the test harness performs the mock call itself after checking the result.

## 2. Negative-path guarantees

The suite verifies that:
- a disabled adapter is rejected before provider invocation;
- a denied Security Manager decision is rejected before provider invocation;
- a discovered adapter cannot transition directly to enabled;
- the successful route returns normalized provider metadata and usage.

No external network or real credentials are used.

## 3. Important boundary

The suite does not prove:
- cryptographic publisher/signature validation;
- correctness or authenticity of trust evidence fixtures;
- persistent registry state, atomic updates or revocation propagation;
- actual runtime isolation, network egress filtering or secret brokerage;
- durable task admission/dispatch, timeout recovery or reconciliation;
- live provider billing, privacy or service behavior.

Those require independent implementations and tests. Passing this suite is evidence of deterministic component composition only, not production readiness.

## 4. Acceptance criteria

1. Lifecycle guard, adapter admission and execution admission all pass before the mock is called.
2. A failed adapter gate results in zero provider calls.
3. A failed execution gate results in zero provider calls.
4. The result conforms to the shared AI provider result contract.
5. The suite has no network dependency and consumes no provider quota.
6. No production route, credentials, settings or deployment configuration are changed.
