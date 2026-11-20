# Provider Adapter Registry — Lifecycle and Conformance Specification v1

## Status

**Status:** Specification plus pure lifecycle/update evaluators and unit tests.  
**Relationship:** This registry specification implements the common adapter governance layer described in Provider Adapter Layer. It reuses the existing `integration-adapter.schema.json`, `ai-provider-record.schema.json`, `device-adapter-manifest.schema.json` and module/device registries. It does not create a parallel universal record format.

## 1. Registry ownership

The registry is the authoritative index of adapter release records and their lifecycle. Domain records remain authoritative for their specialized fields:
- integration adapter contract: provider, integration type, operations, scopes, platforms and status;
- AI provider record: endpoint/credential references, approved data classes, capabilities, health and privacy metadata;
- device adapter manifest: publisher, artifact digest, SDK compatibility, runtime, device classes, permissions, data classes, egress and resources.

A common registry service may index these records by adapter ID, provider ID, version and digest. It must preserve domain-specific validation and ownership. Registry metadata does not grant capability, trust, permission, consent or invocation authority.

## 2. Lifecycle

Canonical lifecycle values already present in the integration adapter contract are:
- `discovered`: untrusted candidate metadata;
- `pending_review`: validation/review in progress;
- `enabled`: eligible for route consideration, subject to fresh runtime gates;
- `restricted`: only explicitly retained operations/platforms/scopes may be considered;
- `disabled`: administratively unavailable;
- `deprecated`: no new invocations; migration/removal path only;
- `error`: quarantined from routing pending diagnosis.

Allowed transitions are intentionally constrained:
- discovered → pending_review | disabled
- pending_review → enabled | restricted | disabled | error
- enabled → restricted | disabled | deprecated | error
- restricted → pending_review | disabled | deprecated | error
- disabled → pending_review | deprecated
- error → pending_review | disabled | deprecated
- deprecated → terminal

Re-enabling a disabled or errored adapter requires return to pending_review; deprecated releases cannot be reactivated. Status transitions must be persisted with actor, reason, evidence, timestamp and compare-and-swap version checks. The pure helper only evaluates the transition; it is not the persistence service.

## 3. Immutable release and scope review

An adapter release is identified by exact adapter ID, version, provider ID, API/SDK contract version and artifact digest. Changes to release identity, artifact digest, integration type, declared operation set, supported platforms or required permission scopes require fresh review.

Permission/operation/platform expansion is never silently accepted. A new artifact digest cannot inherit the previous release's approval. A narrower scope may also require a review record, but can be processed as a separate restricted release rather than mutating an approved artifact in place.

Operational metadata such as last health check may change without a release review, but health never changes trust or authorization. Registry updates must retain immutable release history; no in-place rewrite of a published artifact identity.

## 4. Conformance pipeline

Before activation:
1. Validate the appropriate existing domain JSON Schema.
2. Validate stable adapter/provider identity and semantic version.
3. Verify publisher signature and artifact digest against trusted release metadata.
4. Check contract/SDK compatibility and required migration policy.
5. Validate every operation against Sofia-owned capability contracts and strict input/output schemas.
6. Review platform support, permission scope, data classes, retention, processing region and network egress.
7. Resolve credential references through the secret broker; never store credential values in registry records.
8. Verify endpoint ownership, TLS policy, DNS/IP restrictions, redirect policy and SSRF protections.
9. Run deterministic contract conformance, negative, timeout, cancellation, rate-limit and malformed-response tests.
10. Record independent verification evidence, reviewer, policy version and timestamp.
11. Transition to enabled only after required approval gates pass.

A self-reported `healthy`, `verified`, `signed` or capability flag is not independent evidence. A schema-valid record is not automatically trusted.

## 5. Runtime route checks

Before each invocation, resolve the exact registered release and recheck:
- lifecycle status and revocation state;
- artifact digest and contract compatibility;
- operation, platform and target allowlists;
- current principal/session, capability grant, policy decision and owner approval where required;
- data-class and purpose constraints;
- fresh health/quota state and resource reservation;
- endpoint and credential availability;
- deadline, idempotency and side-effect semantics.

The registry is not a policy engine and must not cache a previous ALLOW as permanent authority. The appropriate domain broker/gateway remains the only invocation path.

## 6. Evaluator implementation boundary

`evaluateAdapterLifecycleTransition` is a deterministic transition guard for the integration-adapter lifecycle vocabulary. `evaluateAdapterRecordUpdate` compares selected release/scope fields and flags whether a new review is required. These functions do not validate JSON Schema, signatures, cryptographic digests against bytes, publisher identity, authorization, persistence, concurrency or network safety. Production registry services must implement those controls independently.

## 7. Acceptance criteria

1. Existing domain-specific schemas remain authoritative; no duplicate universal adapter schema is introduced.
2. Discovery metadata cannot activate an adapter directly.
3. Deprecated releases cannot be reactivated.
4. Every release is bound to an immutable artifact digest and contract version.
5. Changes to digest, operations, platforms or permission scopes require review.
6. Invalid schema, signature, endpoint, contract or conformance test blocks activation.
7. Adapter status never grants a user capability or permission.
8. Each invocation rechecks current authorization, policy, budget and lifecycle.
9. Registry history and status transitions are auditable and concurrency-safe.
10. Revocation blocks queued and future work through the relevant broker/gateway.

## 8. Current implementation status

Implemented in this increment:
- pure lifecycle transition evaluator;
- release/scope update review detector;
- unit tests for allowed/forbidden transitions and material changes.

Not implemented:
- persistent registry service or database;
- JSON Schema validation runtime;
- signature verification and artifact inspection;
- independent publisher verification;
- policy/authorization integration;
- endpoint/DNS/SSRF enforcement;
- secret broker;
- adapter sandbox or live invocation.

No real provider is enabled or connected by this work.
