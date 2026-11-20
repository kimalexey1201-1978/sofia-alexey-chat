import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateReconciliationEvidenceBatch
} from "../../src/core/reconciliation-manager.mjs";
import { evaluateExecutionRetry } from "../../src/core/execution-supervisor.mjs";
import { createMockReconciliationAdapter } from "../../src/providers/mock-reconciliation-adapter.mjs";

const now = new Date("2026-11-20T15:00:00.000Z");
function fixture(conclusion = "CONFIRMED_APPLIED") {
  const evidence = {
    task_id: "task-0001", request_id: "request-0001",
    provider_id: "provider-x", provider_operation_ref: "operation-123",
    target_ref: "mailbox:user-1", operation_digest: "a".repeat(64),
    idempotency_key_digest: "b".repeat(64), conclusion,
    evidence_digest: "c".repeat(64), evidence_ref: "provider-evidence:123",
    observed_at: "2026-11-20T14:59:30.000Z",
    verification: { status: "VERIFIED", verifier_ref: "adapter:provider-x",
      verified_at: "2026-11-20T14:59:40.000Z" }
  };
  return {
    task: { task_id: "task-0001", state: "outcome_uncertain" },
    priorRequest: {
      request_id: "request-0001", provider_id: "provider-x",
      provider_operation_ref: "operation-123", target_ref: "mailbox:user-1",
      operation_digest: "a".repeat(64), idempotency_key_digest: "b".repeat(64)
    },
    evidence
  };
}
function queryAdapter(evidenceRecords) {
  return createMockReconciliationAdapter({
    providerId: "provider-x",
    evidenceByOperation: { "operation-123": evidenceRecords }
  });
}
function reconcile(adapter, input) {
  return adapter.queryOperationStatus({
    provider_id: input.priorRequest.provider_id,
    provider_operation_ref: input.priorRequest.provider_operation_ref
  }).then(result => evaluateReconciliationEvidenceBatch({
    ...input, evidenceRecords: result.evidence_records
  }, now));
}
function retryFor(result) {
  return evaluateExecutionRetry({
    priorState: result.taskState,
    providerOutcome: result.conclusion,
    idempotencyKey: "idem-key-0001",
    retryIdempotencyKey: "idem-key-0001",
    sameCanonicalOperation: true,
    naturallyIdempotent: false
  });
}

test("integrates adapter and evaluator for confirmed applied outcome", async () => {
  const input = fixture("CONFIRMED_APPLIED");
  const result = await reconcile(queryAdapter([input.evidence]), input);
  assert.equal(result.taskState, "completed");
  assert.equal(retryFor(result).reasonCode, "PRIOR_SIDE_EFFECT_ALREADY_APPLIED");
});

test("integrates adapter and evaluator for confirmed not-applied outcome", async () => {
  const input = fixture("CONFIRMED_NOT_APPLIED");
  const result = await reconcile(queryAdapter([input.evidence]), input);
  assert.equal(result.taskState, "failed");
  assert.equal(result.retryMayBeConsidered, true);
  assert.equal(retryFor(result).allowed, true);
});

test("keeps a still-unknown provider outcome uncertain and blocks retry", async () => {
  const input = fixture("STILL_UNKNOWN");
  const result = await reconcile(queryAdapter([input.evidence]), input);
  assert.equal(result.taskState, "outcome_uncertain");
  assert.equal(retryFor(result).reasonCode, "OUTCOME_RECONCILIATION_REQUIRED");
});

test("deduplicates exact repeated evidence without changing the outcome", async () => {
  const input = fixture("CONFIRMED_APPLIED");
  const result = await reconcile(queryAdapter([input.evidence, input.evidence]), input);
  assert.equal(result.taskState, "completed");
});

test("keeps contradictory provider evidence uncertain and blocks retry", async () => {
  const input = fixture("CONFIRMED_APPLIED");
  const contradiction = structuredClone(input.evidence);
  contradiction.conclusion = "CONFIRMED_NOT_APPLIED";
  contradiction.evidence_digest = "d".repeat(64);
  contradiction.evidence_ref = "provider-evidence:contradiction";
  const result = await reconcile(
    queryAdapter([input.evidence, contradiction]), input
  );
  assert.equal(result.resolved, false);
  assert.equal(result.taskState, "outcome_uncertain");
  assert.equal(result.reasonCode, "MULTIPLE_DISTINCT_EVIDENCE_RECORDS");
  assert.equal(retryFor(result).reasonCode, "OUTCOME_RECONCILIATION_REQUIRED");
});

test("rejects conflicting contents that reuse one evidence digest", async () => {
  const input = fixture("CONFIRMED_APPLIED");
  const conflict = structuredClone(input.evidence);
  conflict.conclusion = "CONFIRMED_NOT_APPLIED";
  const result = await reconcile(queryAdapter([input.evidence, conflict]), input);
  assert.equal(result.taskState, "outcome_uncertain");
  assert.equal(result.reasonCode, "DUPLICATE_EVIDENCE_DIGEST_CONFLICT");
});
