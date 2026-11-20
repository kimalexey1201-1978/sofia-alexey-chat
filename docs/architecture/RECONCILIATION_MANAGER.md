# Reconciliation Manager — Architecture Specification v1

## Status and implementation boundary

The Reconciliation Manager (RM) resolves uncertain external side-effect outcomes for Runtime Tasks. This document and the accompanying pure decision helper define the contract boundary; they do not query providers, authenticate provider responses, persist reconciliation records, dispatch retries or perform external side effects. v0.1 remains inference-only.

## 1. Responsibility and separation of duties

- **Execution Supervisor (ES)** detects timeout/crash/connection loss around a potentially consequential operation and places the task in `outcome_uncertain`.
- **Reconciliation Manager (RM)** coordinates evidence collection and decides whether the external effect is confirmed applied, confirmed not applied, or still unknown.
- **Provider adapter** queries the provider's authoritative status interface and authenticates the response using provider-supported mechanisms.
- **Policy Engine** evaluates any subsequent retry as a new action.
- **RBM** retains/reconciles resource and monetary reservations; unknown usage is not settled as zero.
- **Sofia Core** owns task orchestration and communicates the resolved or unresolved status to the owner.

RM is not an executor, does not infer provider state from model output, and cannot itself authorize a retry.

## 2. Reconciliation trigger

Start reconciliation when an external operation may have crossed the side-effect boundary but ES cannot establish the final outcome, including:
- request timeout after transmission;
- connection loss after provider acceptance may have occurred;
- runtime crash after broker invocation;
- cancellation racing with an external write;
- provider response received but malformed or lost before durable result recording.

Do not enter reconciliation for a request that is proven never to have left the local admission/preparation stage. A cancellation acknowledgement or local exception is not proof that the provider did not apply the operation.

## 3. Evidence hierarchy

Accept only provider-authoritative evidence obtained through a trusted, capability-scoped adapter. Preferred sources, in order:
1. provider operation/status resource identified by a durable provider operation ID;
2. provider-supported idempotency-key lookup with documented semantics and retention window;
3. provider transaction/event record that uniquely binds the exact operation and target;
4. provider audit/status endpoint with equivalent authoritative guarantees.

A transport acknowledgement may prove receipt, not necessarily completion. Executor claims, model reasoning, local logs, elapsed time, absence of an item in a partial listing, and user-facing UI observations are not authoritative by themselves.

Each evidence record must bind to:
- original task and request IDs;
- provider identity and provider operation reference;
- exact target and canonical operation digest;
- idempotency-key digest where used;
- conclusion and provider status;
- observation time and evidence digest/reference;
- adapter/verifier identity and verification time.

Evidence for a different target, operation, request, provider, principal scope or idempotency binding is rejected. Do not store raw idempotency keys or credentials in audit records.

## 4. Reconciliation evidence contract

`contracts/v1/reconciliation-evidence.schema.json` defines the provider-neutral evidence envelope consumed by the pure evaluator. It binds the conclusion to the original task/request, provider operation, exact target, canonical operation digest and idempotency-key digest. It carries an evidence digest/reference, provider observation timestamp, and verifier identity/status/timestamp. Schema validation checks structure and formats only; it does not authenticate the provider, verify signatures, or prove that a verifier is trustworthy. Those guarantees remain the responsibility of a trusted provider adapter and its verification boundary.

## 5. Reconciliation outcomes

- **CONFIRMED_APPLIED:** authoritative evidence proves the requested side effect occurred. Resolve the task as completed (or a separately specified partial state if a future contract adds one). Never retry the same effect.
- **CONFIRMED_NOT_APPLIED:** authoritative evidence proves the side effect did not occur. Resolve the original task as failed/terminal. A new linked request may be considered, subject to all fresh admission gates.
- **STILL_UNKNOWN:** evidence is unavailable, stale, contradictory, non-authoritative or insufficient. Keep the task in `outcome_uncertain`, preserve its bounded pending reservation and schedule/await a later reconciliation attempt. Do not retry or tell the owner that it succeeded or failed.

A pure evaluator may validate binding, freshness and an already-verified adapter verdict. Cryptographic/provider authentication remains the adapter's responsibility and must not be represented by a caller-controlled boolean in a live integration.

## 6. Reconciliation algorithm

1. Load the durable uncertain task and original immutable execution request.
2. Confirm task state is `outcome_uncertain`; acquire a task-scoped reconciliation lease to prevent concurrent reconcilers from racing.
3. Resolve the original provider, operation reference, exact target, canonical operation digest and idempotency-key digest.
4. Ask the matching provider adapter for authoritative status using the least data and narrowest read-only scope.
5. Verify provider identity, response authenticity, operation binding, freshness and status semantics.
6. Normalize the result to one of the three outcomes; contradictory or incomplete evidence becomes `STILL_UNKNOWN`.
7. Atomically append the reconciliation record and state transition with compare-and-swap on task version. Duplicate evidence/requests are idempotently deduplicated.
8. Notify Core; retain the evidence reference and audit event. Never erase the original uncertain state/history.
9. If confirmed not applied, let Core consider a new retry request. RM does not initiate it.

If the provider has no authoritative status or idempotency lookup, RM must not fabricate certainty. The task may remain uncertain until a trusted manual resolution path is defined.

## 7. Freshness, retry and reservation rules

- Evidence freshness is provider- and operation-specific; default windows must be configured conservatively and versioned. Stale evidence yields `STILL_UNKNOWN`.
- `CONFIRMED_APPLIED` prohibits retry.
- `STILL_UNKNOWN` prohibits retry.
- `CONFIRMED_NOT_APPLIED` only permits retry consideration; it does not grant execution authority.
- A retry is a new request linked by `retry_of_request_id`, with fresh policy evaluation, grant/session/authority checks, approval consumption where required, RBM reservation, module admission and deadline.
- Reuse a provider idempotency key only for the exact same canonical operation and target within the provider's documented key-retention window. If semantics or retention are unknown, do not assume deduplication.
- RBM must keep ambiguous charges/usage pending and bounded; no uncertain usage may be settled as zero or release a reservation prematurely.

## 8. Concurrency, leases and recovery

Only one active reconciliation lease may own a task at a time. Lease expiry permits another worker to resume reconciliation, not to repeat the side effect. State writes use optimistic concurrency/task version checks. Duplicate provider events and repeated polling are idempotent. Backoff and polling cadence are bounded by provider rate limits, task policy and retention windows; no unbounded loops or paid probes under `FREE_ONLY`.

A provider adapter outage, RM outage, audit-store outage or RBM outage must not resolve the task optimistically. Keep the uncertain state and fail closed.

## 9. Audit and privacy

Use the existing `audit-event.schema.json` for reconciliation lifecycle events where its fields fit. Record event/correlation/causation IDs, task/request/provider references, conclusion, reason code, evidence reference/digest, verifier identity, observation time, state transition, policy version and pending reservation reference. Do not log raw credentials, full provider payloads, message bodies, personal data unrelated to the operation, or raw idempotency keys.

Suggested event types: `reconciliation.started`, `reconciliation.evidence_rejected`, `reconciliation.still_unknown`, `reconciliation.confirmed_applied`, `reconciliation.confirmed_not_applied`, `reconciliation.lease_expired`.

## 10. Required acceptance tests

1. Missing or unauthenticated provider evidence remains `outcome_uncertain`.
2. Evidence bound to another task/request/provider/target/operation/idempotency key is rejected.
3. Stale, future-dated or contradictory evidence remains uncertain.
4. `CONFIRMED_APPLIED` resolves without retry eligibility.
5. `CONFIRMED_NOT_APPLIED` permits only consideration of a new linked request.
6. `STILL_UNKNOWN` preserves uncertainty and pending budget reservation.
7. Concurrent reconcilers cannot commit conflicting state transitions.
8. Duplicate provider events/polls are idempotently handled.
9. Provider/RM/audit/RBM outage never becomes success or confirmed failure.
10. Retry still requires fresh Policy Engine, grants, approval and RBM gates.
11. No raw secret, payload or idempotency key appears in audit records.
12. No model or executor self-report can establish authoritative provider state.

## 11. Implementation sequence and current progress

A — provider-neutral evidence and reconciliation record contracts: present under `contracts/v1/`.  
B — deterministic pure evaluator and adversarial tests: present in `src/core/reconciliation-manager.mjs` and its tests.  
C — storage-port prototype with in-memory serialized transactions, task-version checks, lease fencing/renewal, evidence deduplication and atomic test commits: present in `src/core/reconciliation-storage.mjs`; this is not durable or shared across Worker isolates.  
D — read-only mock provider adapter and integration tests for duplicates, contradictory evidence, outcome classification and retry gating: present under `src/providers/` and `tests/integration/`. Runtime transition-guard coverage is included in the integration suite.

E — test-isolated coordinator that acquires/releases leases, queries a read-only adapter, requires an injected independent verifier, evaluates evidence and commits through the storage port: implemented in `src/core/reconciliation-coordinator.mjs`, with tests in `tests/core/reconciliation-coordinator.test.mjs`. It is not registered or reachable from runtime routes.  
F — trusted provider authentication/cryptographic verification, durable storage adapter, RBM pending-reservation/settlement integration and audit outbox delivery: not yet implemented.  
G — controlled non-production activation and any real provider adapter: deferred until the preceding controls are implemented and reviewed. Production execution requires separate explicit owner approval.

## 12. Current v0.1 boundary

The repository contains a pure reconciliation evaluator, provider-neutral contracts, a test-only read-only mock adapter, an in-memory storage-port test double, and a test-isolated coordinator that joins these components behind a mandatory injected verifier boundary. Tests cover evidence binding, lease fencing/renewal, atomic in-memory commits, retry gating, runtime transition guards, coordinator failure paths and concurrent lease exclusion. The storage implementation is process-local only; it is not durable and is not shared across Worker isolates. The injected verifier used by tests is only a stub and does not provide production cryptographic/provider authentication. Durable persistence, live RBM settlement, outbox delivery and retry orchestration are not implemented. The coordinator is not connected to chat or runtime routes. No real executor is invoked.

## 13. Mock adapter boundary

The test-only `createMockReconciliationAdapter` exposes a read-only `queryOperationStatus` contract over preloaded evidence fixtures. It is deterministic, performs no network I/O, does not authenticate or normalize evidence, does not persist state, and cannot invoke external operations. It returns a defensive copy of all configured records for the exact provider operation so higher-level tests can exercise duplicates and contradictory observations without implying that the adapter itself establishes trust. Provider identity mismatch and malformed requests fail closed. This fixture must not be registered for production execution.

## 14. Evidence batch handling

The pure `evaluateReconciliationEvidenceBatch` helper accepts the complete evidence-record batch returned by an adapter. Byte-for-byte-equivalent JSON records sharing one evidence digest are treated as repeated delivery of the same record. Reuse of a digest for different record content, malformed records, an empty batch, or multiple distinct evidence digests fails closed and leaves the task `outcome_uncertain`. This deliberately conservative v0.1 rule does not attempt to rank or reconcile competing provider claims; any distinct records require a separately specified provider-specific conflict-resolution policy.
