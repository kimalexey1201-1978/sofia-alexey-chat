# Mock Provider Adapter — Test Harness Specification v1

## Status and purpose

**Status:** Implemented deterministic mock AI provider and unit tests.  
The mock provider exercises the existing `AIProvider.generate(request)` boundary without network access, credentials, external services, paid usage or production routing changes.

It is a test fixture, not a fallback provider and not a real provider adapter registration.

## 1. Supported test behaviors

The mock can provide:
- deterministic successful text and provider/model metadata;
- deterministic usage metadata;
- a controlled delay;
- a caller-supplied deterministic failure;
- malformed result fixtures validated by the same production result validator;
- cancellation before invocation and during a delayed invocation;
- an in-memory call record for assertions.

The fixture deliberately does not implement retries, network behavior, real provider health, billing, signature verification or reconciliation status lookup.

## 2. Contract and trust boundary

The mock implements the existing `AIProvider` contract and passes output through `validateProviderResult`. Tests therefore exercise the same normalized result shape used by the Core provider boundary.

Mock output remains test data. Its provider ID, model ID, usage and text do not establish real provider identity, real usage, external completion, or trust.

## 3. Safety constraints

- No fetch, sockets, URLs, API keys or secrets.
- No external side effects.
- No automatic registration as an active provider.
- No automatic fallback from a real provider.
- No production route or UI changes.
- No assertion that cancellation rolls back work; the mock has no external work to roll back.

## 4. Acceptance tests

1. Stable successful response and metadata.
2. In-memory request observation for assertions.
3. Deterministic failure propagation.
4. Malformed result rejection by the shared validator.
5. Cancellation before invocation.
6. Cancellation during controlled delay.
7. No network or secret access.

## 5. Implementation boundary

Implemented:
- `src/providers/mock-provider.mjs`
- `tests/providers/mock-provider.test.mjs`

Not implemented:
- registry persistence or lifecycle integration;
- real provider invocation;
- reconciliation adapter or authoritative provider status;
- retry policy, billing, network simulation or production activation.

The next safe step is a mock adapter conformance suite that exercises registry admission, provider result validation and execution supervision together. Real provider integration remains a separate, explicitly approved step.
