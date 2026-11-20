import test from "node:test";
import assert from "node:assert/strict";
import { evaluateReconciliation, evaluateReconciliationEvidenceBatch } from "../../src/core/reconciliation-manager.mjs";

const now = new Date("2026-11-20T15:00:00.000Z");
function fixture() {
  return {
    task: { task_id: "task-0001", current_request_id: "request-0001", state: "outcome_uncertain" },
    priorRequest: {
      request_id: "request-0001", provider_id: "provider-x",
      provider_operation_ref: "operation-123", target_ref: "mailbox:user-1",
      operation_digest: "a".repeat(64), idempotency_key_digest: "b".repeat(64)
    },
    evidence: {
      schema_version: "1.0.0",
      task_id: "task-0001", request_id: "request-0001",
      provider_id: "provider-x", provider_operation_ref: "operation-123",
      target_ref: "mailbox:user-1", operation_digest: "a".repeat(64),
      idempotency_key_digest: "b".repeat(64),
      conclusion: "CONFIRMED_APPLIED", evidence_digest: "c".repeat(64),
      evidence_ref: "provider-evidence:123",
      observed_at: "2026-11-20T14:59:30.000Z",
      verification: { status: "VERIFIED", verifier_ref: "adapter:provider-x",
        verified_at: "2026-11-20T14:59:40.000Z" }
    }
  };
}

test("resolves a fully bound authoritative applied result as completed", () => {
  const result = evaluateReconciliation(fixture(), now);
  assert.equal(result.resolved, true);
  assert.equal(result.taskState, "completed");
  assert.equal(result.retryMayBeConsidered, false);
});

test("resolves confirmed non-application as failed and only permits retry consideration", () => {
  const input = fixture();
  input.evidence.conclusion = "CONFIRMED_NOT_APPLIED";
  const result = evaluateReconciliation(input, now);
  assert.equal(result.taskState, "failed");
  assert.equal(result.retryMayBeConsidered, true);
});

test("keeps still-unknown provider outcomes quarantined", () => {
  const input = fixture();
  input.evidence.conclusion = "STILL_UNKNOWN";
  const result = evaluateReconciliation(input, now);
  assert.equal(result.resolved, false);
  assert.equal(result.taskState, "outcome_uncertain");
});

test("rejects missing, unverified, stale or mismatched evidence", () => {
  const input = fixture();
  delete input.evidence.verification;
  assert.equal(evaluateReconciliation(input, now).reasonCode, "PROVIDER_EVIDENCE_NOT_VERIFIED");
  const stale = fixture();
  stale.evidence.observed_at = "2026-11-20T14:00:00.000Z";
  assert.equal(evaluateReconciliation(stale, now).reasonCode, "PROVIDER_EVIDENCE_STALE_OR_INVALID");
  const mismatch = fixture();
  mismatch.evidence.target_ref = "mailbox:other";
  assert.equal(evaluateReconciliation(mismatch, now).reasonCode, "RECONCILIATION_BINDING_MISMATCH");
});

test("does not reconcile a task outside outcome_uncertain", () => {
  const input = fixture();
  input.task.state = "running";
  assert.equal(evaluateReconciliation(input, now).reasonCode, "TASK_NOT_OUTCOME_UNCERTAIN");
});

test("does not treat an applied result as retryable", () => {
  const result = evaluateReconciliation(fixture(), now);
  assert.equal(result.retryMayBeConsidered, false);
});


test("rejects verification timestamps that precede the provider observation", () => {
  const input = fixture();
  input.evidence.verification.verified_at = "2026-11-20T14:59:00.000Z";
  assert.equal(evaluateReconciliation(input, now).reasonCode,
    "PROVIDER_EVIDENCE_STALE_OR_INVALID");
});

test("rejects evidence whose verification timestamp is outside the freshness window", () => {
  const input = fixture();
  input.evidence.verification.verified_at = "2026-11-20T14:54:00.000Z";
  assert.equal(evaluateReconciliation(input, now).reasonCode,
    "PROVIDER_EVIDENCE_STALE_OR_INVALID");
});


test("rejects evidence with an unsupported contract version", () => {
  const input = fixture();
  input.evidence.schema_version = "2.0.0";
  assert.equal(evaluateReconciliation(input, now).reasonCode,
    "EVIDENCE_SCHEMA_VERSION_UNSUPPORTED");
});

test("rejects an invalid reconciliation clock", () => {
  assert.equal(evaluateReconciliation(fixture(), "not-a-date").reasonCode,
    "RECONCILIATION_TIME_INVALID");
});

test("rejects evidence for a prior request that is no longer current", () => {
  const input = fixture();
  input.task.current_request_id = "request-0002";
  assert.equal(evaluateReconciliation(input, now).reasonCode,
    "CURRENT_REQUEST_BINDING_MISMATCH");
});

test("rejects a task without an authoritative current request id", () => {
  const input = fixture();
  delete input.task.current_request_id;
  assert.equal(evaluateReconciliation(input, now).reasonCode,
    "CURRENT_REQUEST_BINDING_MISMATCH");
});


test("accepts authenticated historical evidence beyond the freshness window", () => {
  const input = fixture();
  const historical = structuredClone(input.evidence);
  const current = fixture().evidence;
  current.evidence_digest = "d".repeat(64);
  current.observed_at = "2026-11-20T14:59:30.000Z";
  current.verification.verified_at = "2026-11-20T14:59:40.000Z";
  historical.observed_at = "2026-11-20T14:00:00.000Z";
  historical.verification.verified_at = "2026-11-20T14:00:10.000Z";
  const result = evaluateReconciliationEvidenceBatch({
    task: input.task,
    priorRequest: input.priorRequest,
    historicalEvidenceRecords: [historical],
    evidenceRecords: [current],
    freshnessWindowMs: 300000
  }, now);
  assert.equal(result.reasonCode, "MULTIPLE_DISTINCT_EVIDENCE_RECORDS");
  assert.equal(result.conclusion, "STILL_UNKNOWN");
});

test("rejects structurally corrupted historical evidence", () => {
  const input = fixture();
  const historical = structuredClone(input.evidence);
  historical.verification.verified_at = "not-a-timestamp";
  const current = structuredClone(input.evidence);
  current.evidence_digest = "d".repeat(64);
  const result = evaluateReconciliationEvidenceBatch({
    task: input.task,
    priorRequest: input.priorRequest,
    historicalEvidenceRecords: [historical],
    evidenceRecords: [current],
    freshnessWindowMs: 300000
  }, now);
  assert.equal(result.reasonCode, "PERSISTED_EVIDENCE_INVALID");
  assert.equal(result.resolved, false);
});

test("rejects historical evidence whose immutable request binding was altered", () => {
  const input = fixture();
  const historical = structuredClone(input.evidence);
  historical.request_id = "request-old";
  const current = structuredClone(input.evidence);
  current.evidence_digest = "d".repeat(64);
  const result = evaluateReconciliationEvidenceBatch({
    task: input.task,
    priorRequest: input.priorRequest,
    historicalEvidenceRecords: [historical],
    evidenceRecords: [current],
    freshnessWindowMs: 300000
  }, now);
  assert.equal(result.reasonCode, "PERSISTED_EVIDENCE_BINDING_MISMATCH");
  assert.equal(result.resolved, false);
});
