import test from "node:test";
import assert from "node:assert/strict";
import { createMockReconciliationAdapter } from "../../src/providers/mock-reconciliation-adapter.mjs";

test("returns preloaded evidence for the exact provider operation without network I/O", async () => {
  const evidence = [{ conclusion: "CONFIRMED_APPLIED", evidence_ref: "mock:1" }];
  const adapter = createMockReconciliationAdapter({
    providerId: "provider-x",
    evidenceByOperation: { "operation-123": evidence }
  });

  const result = await adapter.queryOperationStatus({
    provider_id: "provider-x",
    provider_operation_ref: "operation-123"
  });

  assert.equal(result.provider_id, "provider-x");
  assert.equal(result.provider_operation_ref, "operation-123");
  assert.deepEqual(result.evidence_records, evidence);
  assert.equal(adapter.calls.length, 1);
});

test("returns an empty evidence collection when the operation is not present", async () => {
  const adapter = createMockReconciliationAdapter({ providerId: "provider-x" });
  const result = await adapter.queryOperationStatus({
    provider_id: "provider-x",
    provider_operation_ref: "missing-operation"
  });

  assert.deepEqual(result.evidence_records, []);
});

test("returns defensive copies so callers cannot mutate configured fixtures", async () => {
  const evidence = [{ conclusion: "STILL_UNKNOWN" }];
  const adapter = createMockReconciliationAdapter({
    providerId: "provider-x",
    evidenceByOperation: { "operation-123": evidence }
  });

  const first = await adapter.queryOperationStatus({
    provider_id: "provider-x",
    provider_operation_ref: "operation-123"
  });
  first.evidence_records[0].conclusion = "CONFIRMED_APPLIED";

  const second = await adapter.queryOperationStatus({
    provider_id: "provider-x",
    provider_operation_ref: "operation-123"
  });
  assert.equal(second.evidence_records[0].conclusion, "STILL_UNKNOWN");
  assert.equal(evidence[0].conclusion, "STILL_UNKNOWN");
});

test("rejects malformed requests and provider identity mismatches", async () => {
  const adapter = createMockReconciliationAdapter({ providerId: "provider-x" });
  await assert.rejects(adapter.queryOperationStatus(null), TypeError);
  await assert.rejects(adapter.queryOperationStatus({
    provider_id: "provider-y",
    provider_operation_ref: "operation-123"
  }), /provider identity mismatch/);
  assert.equal(adapter.calls.length, 0);
});

test("rejects malformed configured evidence collections", async () => {
  const adapter = createMockReconciliationAdapter({
    providerId: "provider-x",
    evidenceByOperation: { "operation-123": { conclusion: "STILL_UNKNOWN" } }
  });
  await assert.rejects(adapter.queryOperationStatus({
    provider_id: "provider-x",
    provider_operation_ref: "operation-123"
  }), /must be an array/);
});
