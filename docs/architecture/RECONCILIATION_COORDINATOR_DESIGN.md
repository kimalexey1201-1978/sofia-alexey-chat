# Reconciliation Coordinator — Design Boundary v1

## Status

Design plus test-isolated implementation. `src/core/reconciliation-coordinator.mjs` implements this boundary against the in-memory test store, mock read-only adapter, and injected verifier stub. It remains unreachable from runtime routes and the chat endpoint. No production provider registration, network integration, durable persistence, retries, or external side effects are added. The existing chat endpoint remains inference-only.

## 1. Purpose

The coordinator is the orchestration boundary between:
- the reconciliation storage port;
- a read-only provider status adapter;
- an independently trusted evidence verifier;
- the pure reconciliation evaluator;
- decision and audit record construction.

It may resolve an already-uncertain task. It must never execute, repeat, cancel, or retry the original operation.

## 2. Trust boundary — mandatory

An evidence record's `verification.status = "VERIFIED"`, schema validity, adapter identity string, or TypeScript/JSDoc type is not proof of authenticity.

The coordinator must not accept caller-supplied evidence as authenticated. Before evidence reaches `evaluateReconciliationEvidenceBatch`, an independently injected verifier must validate the provider response against an expected context derived from the stored task and immutable prior request.

Proposed verifier port:

```js
verifyProviderResponse({
  providerId,
  providerOperationRef,
  expectedTaskId,
  expectedRequestId,
  expectedTargetRef,
  expectedOperationDigest,
  expectedIdempotencyKeyDigest,
  response
}) -> { authenticated: true, evidenceRecords: [...] }
   | { authenticated: false, reasonCode: "..." }
```

The verifier must be implemented using provider-supported authenticity guarantees (for example signature verification, authenticated API response plus documented authoritative status semantics, or a provider-specific trusted mechanism). The coordinator treats missing verifier, thrown verifier, malformed result, or `authenticated !== true` as untrusted and leaves the task uncertain. A mock verifier may exist only in tests and must be clearly named and impossible to register as a production provider.

The verifier's return value is a trusted internal capability boundary, not a value accepted from a user, model, executor, or arbitrary adapter payload. Production trust roots and key rotation are a separate reviewed deliverable.

## 3. Proposed coordinator dependencies

- `store`: storage port implementing `getTask`, prior-request lookup, `acquireLease`, `commitDecision`, and `releaseLease`. The current in-memory store is test-only.
- `adapterRegistry`: resolves a read-only adapter by the provider ID in the stored prior request; never by caller-selected provider.
- `verifier`: independently authenticates and normalizes the provider response as specified above.
- `evaluateBatch`: pure evaluator, defaulting to `evaluateReconciliationEvidenceBatch`.
- `clock`: injected clock returning a valid Date.
- `createId`: injected unique-ID generator for decision and audit IDs.
- `policy`: versioned freshness and lease policy.

No model output participates in provider selection, evidence authentication, decision construction, or state transition.

## 4. Coordinator input and sequence

Public entry point accepts only:
- `taskId`;
- non-secret reconciliation worker `owner`.

All provider/request/target/digest values are loaded from immutable stored records. The coordinator must not accept them from the caller.

Sequence:
1. Validate dependencies and clock; load task and immutable original request.
2. Require task state `outcome_uncertain` and exact match between task's current request ID and stored original request.
3. Acquire a task-scoped lease. If unavailable, return a non-mutating `LEASE_NOT_ACQUIRED` result.
4. Resolve the adapter using stored `provider_id`; require adapter's declared provider identity to match.
5. Query only the stored `provider_operation_ref`, with read-only capability and minimum necessary data.
6. Check response provider ID and operation reference against stored values before verification.
7. Pass the response and stored expected binding to the independent verifier.
8. If authentication fails, evidence is absent, malformed, contradictory, stale, or mismatched, do not commit a terminal decision.
9. Evaluate only verifier-authenticated evidence using the pure batch evaluator.
10. For a terminal conclusion, construct decision and outbox audit event bound to task ID, original request ID, task version, conclusion, reason code and evidence-set digest; call `commitDecision` with compare-and-swap version and fencing token.
11. Return a structured result. Do not dispatch a retry or notify an external system in this slice.
12. Release the acquired lease in `finally`, including adapter/verifier/evaluator/storage failures. Release must use the exact owner and fencing token.

## 5. Empty, unknown, and failure behavior

- Empty provider response: leave task uncertain; release lease; no fabricated evidence and no terminal decision.
- Unauthenticated or invalid response: leave task uncertain; release lease; record no terminal state.
- Evaluator returns `STILL_UNKNOWN`: preserve uncertainty. The current storage API requires at least one evidence record for `commitDecision`; therefore an empty batch must not be committed by inventing a placeholder. A verified, schema-valid provider evidence record whose conclusion is `STILL_UNKNOWN` may be committed only if its digest and audit binding are valid.
- Adapter/verifier/clock/storage error: fail closed; leave the task uncertain unless a valid atomic commit already succeeded; always attempt lease release.
- Lease lost/expired or task version changed: commit must fail; never retry the commit with a newly acquired lease using stale evidence. Start a fresh reconciliation cycle instead.
- Duplicate evidence: rely on the evaluator's canonical duplicate rules and storage's canonical digest-conflict checks.
- Conflicting distinct records: leave uncertain; do not select the most convenient claim.

## 6. Decision and audit invariants

- `CONFIRMED_APPLIED` -> task `completed`; no retry.
- `CONFIRMED_NOT_APPLIED` -> task `failed`; only a separate Core/policy flow may consider a new linked request.
- `STILL_UNKNOWN` -> task remains `outcome_uncertain`; pending resource reservation remains held.
- Decision `task_version_before` equals the version loaded before lease acquisition; terminal `task_version_after` is exactly +1; unknown preserves the version under the current storage contract.
- Audit event aggregate ID/version, event type, conclusion, reason code and evidence-set digest must exactly match the decision.
- No raw credentials, provider payloads, raw idempotency keys, or unrelated personal data in audit records.
- The coordinator never releases or settles RBM reservations in this slice; RBM integration is not implemented.

## 7. Test-only acceptance matrix

1. Valid authenticated applied evidence commits completed + audit atomically.
2. Valid authenticated not-applied evidence commits failed + audit atomically and does not dispatch a retry.
3. Verified STILL_UNKNOWN evidence preserves uncertainty and audit history.
4. Empty evidence leaves task/version/evidence/decisions/outbox unchanged and releases lease.
5. Missing verifier, verifier rejection, verifier exception, or forged adapter `VERIFIED` marker leaves task uncertain.
6. Provider ID or operation reference mismatch is rejected before evaluation.
7. Adapter exception releases lease and leaves task uncertain.
8. Concurrent coordinator cannot acquire an active lease.
9. Expired/replaced lease or stale task version prevents commit.
10. Commit failure does not cause a second provider query or side effect.
11. Duplicate identical records are handled deterministically; digest collision with different content and distinct evidence records remain uncertain.
12. Invalid policy configuration is rejected at coordinator construction; no path invokes an executor, retry, RBM settlement, chat endpoint, production provider, or network-capable mock.

## 8. Implementation gate

Implement the coordinator only against a test-only store and test-only adapter/verifier. Keep it unreachable from the chat endpoint, Worker routes, Agent Registry, production configuration and deployment. Before any real provider integration, separately review provider-specific authenticity semantics, durable storage/atomicity, lease behavior across isolates, RBM reservation lifecycle, audit outbox delivery, privacy, and owner approval.
