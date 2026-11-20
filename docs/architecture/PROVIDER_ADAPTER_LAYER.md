# Provider Adapter Layer — Architecture Specification v1

## Status and scope

**Status:** Architecture specification with a pure metadata-admission helper and unit tests.  
**Scope:** Common lifecycle and trust boundary for external service/provider adapters across AI inference, integrations and device ecosystems.

This layer is an architectural umbrella, not a replacement for specialized gateways or brokers. The AI Provider Gateway remains responsible for model selection and inference policy. The Device Capability Broker remains the sole device-adapter invocation boundary. Reconciliation Manager consumes authoritative status evidence through a provider adapter; it does not call arbitrary provider endpoints itself.

## 1. Design principles

1. Provider-specific protocols and semantics stay outside Sofia Core.
2. Every adapter is versioned, registered, bounded and independently reviewable.
3. Adapter declarations never create user authority, capability grants or trust.
4. All external effects pass through the appropriate Sofia execution and policy gates.
5. Unknown provider semantics, costs, privacy terms or operation outcomes fail closed where required.
6. A provider outage must not corrupt local task, memory or conversation state.
7. Android-first and cross-platform support use the same logical contracts while respecting platform-specific permissions and runtime limits.

## 2. Existing components and non-duplication

The layer composes existing components:
- `integration-adapter.schema.json`: integration identity, type, supported operations, scopes and lifecycle status.
- `ai-provider-record.schema.json` and AI Provider Gateway: AI inference provider metadata, privacy, capability, health and routing.
- Device Adapter Manifest, SDK and Device Capability Broker: device adapter artifact, runtime, permissions, egress, resources and brokered invocation.
- Execution Supervisor: bounded execution, cancellation and uncertain-outcome handling.
- Reconciliation Manager: normalization of authenticated provider evidence and safe state resolution.
- Capability/Permission Registry and Policy Engine: grants and authorization decisions.

Do not create a second registry or a generic direct-call path. A future registry service may index these typed records while preserving each domain's authority boundary.

## 3. Adapter identity and release integrity

Each enabled adapter release is identified by:
- stable adapter ID and provider ID;
- semantic adapter version;
- exact contract/SDK version;
- immutable artifact digest and publisher/signature evidence;
- supported platforms and runtime;
- declared operations/capabilities;
- required permissions, data classes and resource limits;
- endpoint/egress constraints and credential reference;
- lifecycle status, validation evidence and review timestamps.

A changed artifact digest, publisher, contract major version, permission, operation, data class or egress scope requires revalidation and review. A mutable tag or adapter name is not an integrity identity.

The pure admission helper checks only normalized metadata: enabled status, identity, digest shape, exact contract version, declared operation, platform and optional host allowlist membership. It does not verify signatures, DNS/IP safety, authorization, secret access or endpoint ownership.

## 4. Narrow adapter interface

Adapters expose typed, versioned operations rather than arbitrary URL, shell, SQL, browser or generic HTTP passthrough. A logical interface may include:
- `describe()` — immutable identity and compatibility metadata;
- `validateConfiguration()` — non-secret configuration and prerequisites;
- `getCapabilities()` — effective declared capabilities, never grants;
- `invoke(operation, input)` — one schema-bound operation;
- `getHealth()` — bounded health state with timestamp;
- `getUsage()` — normalized usage/cost evidence where supported;
- `getOperationStatus()` / `reconcile()` — authoritative status lookup only when provider semantics support it;
- `cancel()` — best-effort cancellation, not rollback;
- `shutdown()` — bounded cleanup.

The broker/gateway supplies a short-lived, scoped invocation context. Adapters cannot call other adapters, widen their own permissions, alter registry state, or change policy.

## 5. Admission and invocation pipeline

1. Resolve a registered immutable adapter version and exact artifact digest.
2. Validate contract compatibility and lifecycle state.
3. Confirm operation and platform are declared and supported.
4. Validate endpoint configuration against a trusted allowlist; resolve and block loopback, link-local, private, metadata-service and otherwise prohibited destinations as appropriate. Revalidate redirects and DNS resolution to mitigate SSRF and rebinding.
5. Obtain scoped credentials from the approved secret broker; never pass raw secrets through prompts, browser code, logs or ordinary adapter metadata.
6. Obtain fresh identity, capability grant, policy, consent/approval and resource-budget decisions from their owning components.
7. Validate strict input schema, canonical target, data class, deadline, idempotency and resource limits.
8. Dispatch through the relevant gateway/broker in an isolated runtime.
9. Validate output schema, adapter identity, request/correlation binding, provenance and bounded payload size.
10. Record privacy-minimized audit metadata and normalized usage/outcome.

A metadata-admission pass is only one input to this pipeline. It is not authorization to invoke.

## 6. Network, credentials and data protection

- Deny network egress by default; allow only exact approved origins/hosts and required methods/paths.
- Do not accept arbitrary user/model-supplied URLs as provider endpoints.
- Enforce TLS validation, redirect restrictions, DNS/IP destination checks, request-size limits, response-size limits and bounded timeouts.
- Keep credentials in platform/server secret stores; use opaque references and short-lived scoped access.
- Never commit secrets or include them in error messages, traces, model context or client bundles.
- Classify and minimize data before egress; enforce purpose, consent, region, retention and training-use constraints.
- Unknown privacy posture is not equivalent to approved privacy posture.
- Avoid logging raw payloads, media, credentials, personal content or idempotency keys.

## 7. Reliability and provider semantics

Each operation declares:
- read-only versus side-effecting behavior;
- idempotency and provider key-retention semantics;
- timeout and cancellation behavior;
- retryability and rate-limit policy;
- authoritative completion/status semantics;
- partial-result behavior;
- usage/cost measurement reliability.

A transport-level success or HTTP 2xx is not necessarily business-operation completion. A timeout after dispatch is `OUTCOME_UNKNOWN` unless non-execution is proven. Non-idempotent effects are never blindly retried. Reconciliation uses provider-authoritative evidence; if unavailable, preserve uncertainty.

Use bounded exponential backoff with jitter, provider-aware quotas and circuit breakers. Health state affects route eligibility, not trust or authority. Failover must preserve data class, capability, target semantics, privacy and cost constraints.

## 8. Cost and FREE_ONLY policy

Every adapter operation must declare pricing/usage semantics as:
- verified free within documented limits;
- metered with a known rate and bounded quota;
- fixed-cost;
- unknown/unverified.

Under the project's FREE_ONLY development policy, only a route with verified zero-cost behavior or an explicitly approved free quota may be selected. Unknown pricing, paid fallback, overage, or paid infrastructure is blocked pending task-bound owner approval. A missing usage report is not proof of zero cost.

## 9. Platform and device integration

The adapter contract is platform-neutral; implementations report actual runtime and platform prerequisites. Android is first priority. Android adapters must disclose runtime permissions, background-execution limits, foreground-service requirements, battery/thermal constraints, storage/network access and unsupported operations. They must not bypass OS restrictions. Future desktop, wearable, vehicle and smart-home adapters remain separately reviewed and capability-scoped.

## 10. Observability and audit

Record adapter/provider IDs, exact version and digest, operation, request/correlation references, policy and grant references, platform, coarse endpoint identity, outcome, latency, normalized usage/cost, retry/reconciliation state and reason codes.

Do not record raw credentials, full prompts, private media, unnecessary personal data, or raw idempotency keys. Adapter-reported health, cost, privacy and capability claims remain claims until independently verified.

## 11. Acceptance criteria

1. Core depends on typed adapter contracts, not provider-specific SDKs.
2. An adapter cannot invoke unless its exact version and digest are registered and enabled.
3. Unsupported contract versions, platforms and undeclared operations are rejected.
4. Adapter metadata cannot grant permissions or elevate trust.
5. Network egress is allowlisted and resistant to SSRF, redirects and DNS rebinding.
6. Secrets are brokered and absent from client bundles, prompts, repository and logs.
7. Input/output schemas, size, deadlines and correlation bindings are enforced.
8. Side-effect and idempotency semantics are explicit; uncertain outcomes are reconciled, not blindly retried.
9. Unknown pricing is blocked under FREE_ONLY.
10. Privacy, retention, region and data-class rules are enforced before egress.
11. Platform constraints are reported rather than bypassed.
12. Provider outage or adapter revocation fails closed without corrupting Sofia's local state.

## 12. Implementation status and next sequence

**Implemented in this commit:** deterministic metadata-admission helper and unit tests.  
**Specified, not implemented:** registry persistence, signature verification, secure endpoint resolution, secret broker, sandbox runtime, provider health/usage polling, network egress enforcement and live adapter dispatch.

Next sequence:
1. Add schema/conformance fixtures for normalized adapter records.
2. Implement registry lifecycle and signed artifact verification.
3. Implement endpoint policy and secret broker behind test doubles.
4. Build mock provider adapters and failure-injection tests.
5. Integrate one existing AI provider adapter behind the gateway without changing the working chat route.
6. Add one read-only external provider status adapter for reconciliation.
7. Perform Android host integration and security review.
8. Enable any real external side effect only after separate explicit approval.

No production deployment, secret/configuration change, paid provider, or real external side effect is authorized by this specification.
