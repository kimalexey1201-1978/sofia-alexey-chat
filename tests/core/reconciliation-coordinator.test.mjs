import test from "node:test";
import assert from "node:assert/strict";
import { createInMemoryReconciliationStore } from "../../src/core/reconciliation-storage.mjs";
import { createReconciliationCoordinator } from "../../src/core/reconciliation-coordinator.mjs";
import { createMockReconciliationAdapter } from "../../src/providers/mock-reconciliation-adapter.mjs";

const now = new Date("2026-11-20T15:00:00.000Z");
const priorRequest = {
  request_id: "request-0001",
  provider_id: "provider-x",
  provider_operation_ref: "operation-123",
  target_ref: "mailbox:user-1",
  operation_digest: "a".repeat(64),
  idempotency_key_digest: "b".repeat(64)
};

function evidence(conclusion = "CONFIRMED_APPLIED") {
  return {
    schema_version: "1.0.0",
    task_id: "task-0001",
    request_id: priorRequest.request_id,
    provider_id: priorRequest.provider_id,
    provider_operation_ref: priorRequest.provider_operation_ref,
    target_ref: priorRequest.target_ref,
    operation_digest: priorRequest.operation_digest,
    idempotency_key_digest: priorRequest.idempotency_key_digest,
    conclusion,
    evidence_digest: "c".repeat(64),
    evidence_ref: "provider-evidence:123",
    observed_at: "2026-11-20T14:59:30.000Z",
    verification: {
      status: "VERIFIED",
      verifier_ref: "test-verifier:provider-x",
      verified_at: "2026-11-20T14:59:40.000Z"
    }
  };
}

async function setup({
  records = [evidence()],
  verifierOverride,
  adapterOverride,
  clock = () => now
} = {}) {
  const store = createInMemoryReconciliationStore();
  await store.seedTask({
    task_id: "task-0001",
    state: "outcome_uncertain",
    version: 1,
    current_request_id: priorRequest.request_id,
    correlation_id: "corr-0001",
    created_at: now.toISOString(),
    updated_at: now.toISOString()
  });
  const adapter = adapterOverride ?? createMockReconciliationAdapter({
    providerId: "provider-x",
    evidenceByOperation: { "operation-123": records }
  });
  let id = 0;
  const verifier = verifierOverride ?? {
    // Test-only verifier stub. This is not a production trust implementation.
    async verifyProviderResponse(input) {
      assert.equal(input.providerId, priorRequest.provider_id);
      assert.equal(input.expectedTaskId, "task-0001");
      assert.equal(input.expectedRequestId, priorRequest.request_id);
      return { authenticated: true,
        evidenceRecords: input.response.evidence_records };
    }
  };
  const coordinator = createReconciliationCoordinator({
    store,
    getPriorRequest: async requestId =>
      requestId === priorRequest.request_id ? structuredClone(priorRequest) : null,
    adapterRegistry: { get: async providerId =>
      providerId === "provider-x" ? adapter : null },
    verifier,
    clock,
    createId: prefix => `${prefix}-${String(++id).padStart(4, "0")}`,
    policy: { version: "test-1", freshnessWindowMs: 300000, leaseTtlMs: 30000 }
  });
  return { store, adapter, coordinator };
}

test("commits authenticated applied evidence, task transition and audit atomically", async () => {
  const { store, coordinator } = await setup();
  const result = await coordinator.reconcile({ taskId: "task-0001", owner: "worker-a" });
  assert.equal(result.reconciled, true);
  assert.equal(result.taskState, "completed");
  assert.equal(result.taskVersion, 2);
  assert.equal((await store.getTask("task-0001")).state, "completed");
  assert.equal((await store.listEvidence("task-0001")).length, 1);
  assert.equal((await store.listDecisions("task-0001")).length, 1);
  assert.equal((await store.listOutbox()).length, 1);
});

test("commits authenticated not-applied evidence but never dispatches a retry", async () => {
  const { store, coordinator, adapter } = await setup({
    records: [evidence("CONFIRMED_NOT_APPLIED")]
  });
  const result = await coordinator.reconcile({ taskId: "task-0001", owner: "worker-a" });
  assert.equal(result.reconciled, true);
  assert.equal(result.taskState, "failed");
  assert.equal(result.retryMayBeConsidered, true);
  assert.equal(adapter.calls.length, 1);
  assert.equal((await store.getTask("task-0001")).state, "failed");
});

test("commits a verified STILL_UNKNOWN record without leaving uncertainty", async () => {
  const { store, coordinator } = await setup({
    records: [evidence("STILL_UNKNOWN")]
  });
  const result = await coordinator.reconcile({ taskId: "task-0001", owner: "worker-a" });
  assert.equal(result.reconciled, true);
  assert.equal(result.taskState, "outcome_uncertain");
  assert.equal(result.taskVersion, 1);
  assert.equal((await store.listOutbox()).length, 1);
});

test("empty provider evidence leaves all records unchanged and releases the lease", async () => {
  const { store, coordinator } = await setup({ records: [] });
  const result = await coordinator.reconcile({ taskId: "task-0001", owner: "worker-a" });
  assert.equal(result.reconciled, false);
  assert.equal(result.reasonCode, "PROVIDER_EVIDENCE_UNTRUSTED");
  assert.equal((await store.getTask("task-0001")).version, 1);
  assert.equal((await store.listEvidence("task-0001")).length, 0);
  assert.equal((await store.listDecisions("task-0001")).length, 0);
  assert.equal((await store.listOutbox()).length, 0);
  const nextLease = await store.acquireLease({
    taskId: "task-0001", owner: "worker-b",
    now: "2026-11-20T15:00:01.000Z", ttlMs: 30000
  });
  assert.ok(nextLease);
});

test("does not trust a provider VERIFIED marker when the verifier rejects evidence", async () => {
  const { store, coordinator } = await setup({
    verifierOverride: {
      async verifyProviderResponse() {
        return { authenticated: false, reasonCode: "SIGNATURE_INVALID" };
      }
    }
  });
  const result = await coordinator.reconcile({ taskId: "task-0001", owner: "worker-a" });
  assert.equal(result.reconciled, false);
  assert.equal(result.reasonCode, "SIGNATURE_INVALID");
  assert.equal((await store.getTask("task-0001")).state, "outcome_uncertain");
  assert.equal((await store.listOutbox()).length, 0);
});

test("rejects a provider operation identity mismatch before calling verifier", async () => {
  let verifierCalls = 0;
  const adapter = {
    providerId: "provider-x",
    async queryOperationStatus() {
      return {
        provider_id: "provider-x",
        provider_operation_ref: "different-operation",
        evidence_records: [evidence()]
      };
    }
  };
  const { store, coordinator } = await setup({
    adapterOverride: adapter,
    verifierOverride: { async verifyProviderResponse() {
      verifierCalls++;
      return { authenticated: true, evidenceRecords: [evidence()] };
    } }
  });
  const result = await coordinator.reconcile({ taskId: "task-0001", owner: "worker-a" });
  assert.equal(result.reasonCode, "PROVIDER_RESPONSE_BINDING_INVALID");
  assert.equal(verifierCalls, 0);
  assert.equal((await store.getTask("task-0001")).state, "outcome_uncertain");
});

test("adapter exceptions fail closed and release the lease", async () => {
  const adapter = {
    providerId: "provider-x",
    async queryOperationStatus() { throw new Error("simulated provider outage"); }
  };
  const { store, coordinator } = await setup({ adapterOverride: adapter });
  const result = await coordinator.reconcile({ taskId: "task-0001", owner: "worker-a" });
  assert.equal(result.reasonCode, "RECONCILIATION_DEPENDENCY_ERROR");
  assert.equal((await store.getTask("task-0001")).state, "outcome_uncertain");
  const nextLease = await store.acquireLease({
    taskId: "task-0001", owner: "worker-b",
    now: "2026-11-20T15:00:01.000Z", ttlMs: 30000
  });
  assert.ok(nextLease);
});

test("invalid coordinator clock fails before acquiring a lease", async () => {
  const { store, coordinator } = await setup({ clock: () => new Date("invalid") });
  const result = await coordinator.reconcile({ taskId: "task-0001", owner: "worker-a" });
  assert.equal(result.reasonCode, "RECONCILIATION_TIME_INVALID");
  const lease = await store.acquireLease({
    taskId: "task-0001", owner: "worker-b",
    now: "2026-11-20T15:00:01.000Z", ttlMs: 30000
  });
  assert.ok(lease);
});

test("rejects missing or malformed coordinator inputs", async () => {
  const { coordinator } = await setup();
  assert.equal((await coordinator.reconcile()).reasonCode, "COORDINATOR_INPUT_INVALID");
  assert.throws(() => createReconciliationCoordinator({}), /DEPENDENCIES_INVALID/);
});


test("a second coordinator cannot process a task while the first holds its lease", async () => {
  const { store } = await setup();
  let signalStarted;
  let releaseQuery;
  const started = new Promise(resolve => { signalStarted = resolve; });
  const gate = new Promise(resolve => { releaseQuery = resolve; });
  const slowAdapter = {
    providerId: "provider-x",
    async queryOperationStatus() {
      signalStarted();
      await gate;
      return {
        provider_id: "provider-x",
        provider_operation_ref: priorRequest.provider_operation_ref,
        evidence_records: [evidence()]
      };
    }
  };
  let id = 0;
  const makeCoordinator = owner => createReconciliationCoordinator({
    store,
    getPriorRequest: async () => structuredClone(priorRequest),
    adapterRegistry: { get: async () => slowAdapter },
    verifier: {
      async verifyProviderResponse(input) {
        return { authenticated: true, evidenceRecords: input.response.evidence_records };
      }
    },
    clock: () => now,
    createId: prefix => `${prefix}-${owner}-${++id}`,
    policy: { version: "test-1", leaseTtlMs: 30000 }
  });
  const first = makeCoordinator("first");
  const second = makeCoordinator("second");
  // The first coordinator holds the lease while its provider query is paused.
  const firstRun = first.reconcile({ taskId: "task-0001", owner: "worker-a" });
  await started;
  const secondResult = await second.reconcile({ taskId: "task-0001", owner: "worker-b" });
  assert.equal(secondResult.reasonCode, "LEASE_NOT_ACQUIRED");
  releaseQuery();
  const firstResult = await firstRun;
  assert.equal(firstResult.reconciled, true);
  assert.equal((await store.listDecisions("task-0001")).length, 1);
});

test("authenticated evidence still must match the immutable task and request binding", async () => {
  const mismatched = evidence();
  mismatched.target_ref = "mailbox:someone-else";
  const { store, coordinator } = await setup({
    records: [mismatched],
    verifierOverride: {
      // Even a verifier boundary returning authenticated records cannot bypass
      // the evaluator's exact task/request/target/operation binding checks.
      async verifyProviderResponse(input) {
        return { authenticated: true, evidenceRecords: input.response.evidence_records };
      }
    }
  });
  const result = await coordinator.reconcile({ taskId: "task-0001", owner: "worker-a" });
  assert.equal(result.reconciled, false);
  assert.equal(result.reasonCode, "RECONCILIATION_BINDING_MISMATCH");
  assert.equal((await store.getTask("task-0001")).state, "outcome_uncertain");
  assert.equal((await store.listDecisions("task-0001")).length, 0);
});

test("a verifier exception fails closed and releases the lease", async () => {
  const { store, coordinator } = await setup({
    verifierOverride: {
      async verifyProviderResponse() { throw new Error("verifier unavailable"); }
    }
  });
  const result = await coordinator.reconcile({ taskId: "task-0001", owner: "worker-a" });
  assert.equal(result.reasonCode, "RECONCILIATION_DEPENDENCY_ERROR");
  assert.equal((await store.getTask("task-0001")).state, "outcome_uncertain");
  const nextLease = await store.acquireLease({
    taskId: "task-0001", owner: "worker-b",
    now: "2026-11-20T15:00:01.000Z", ttlMs: 30000
  });
  assert.ok(nextLease);
});


test("provider response arriving after lease expiry cannot be committed", async () => {
  let clockCalls = 0;
  const later = new Date("2026-11-20T15:00:31.000Z");
  const clock = () => (++clockCalls === 1 ? now : later);
  const { store, coordinator, adapter } = await setup({ clock });
  const result = await coordinator.reconcile({ taskId: "task-0001", owner: "worker-a" });
  assert.equal(result.reconciled, false);
  assert.equal(result.reasonCode, "LEASE_FENCING_REJECTED");
  assert.equal(adapter.calls.length, 1);
  assert.equal((await store.getTask("task-0001")).state, "outcome_uncertain");
  assert.equal((await store.listDecisions("task-0001")).length, 0);
  assert.equal((await store.listOutbox()).length, 0);
  const replacement = await store.acquireLease({
    taskId: "task-0001", owner: "worker-b",
    now: later.toISOString(), ttlMs: 30000
  });
  assert.ok(replacement);
});


test("rejects invalid policy configuration before reconciliation begins", async () => {
  const { store } = await setup();
  const base = {
    store,
    getPriorRequest: async () => structuredClone(priorRequest),
    adapterRegistry: { get: async () => createMockReconciliationAdapter({
      providerId: "provider-x", evidenceByOperation: { "operation-123": [evidence()] }
    }) },
    verifier: { async verifyProviderResponse(input) {
      return { authenticated: true, evidenceRecords: input.response.evidence_records };
    } },
    createId: prefix => `${prefix}-policy-test`
  };
  assert.throws(() => createReconciliationCoordinator({
    ...base, policy: { freshnessWindowMs: 0 }
  }), /POLICY_INVALID/);
  assert.throws(() => createReconciliationCoordinator({
    ...base, policy: { leaseTtlMs: 1.5 }
  }), /POLICY_INVALID/);
  assert.throws(() => createReconciliationCoordinator({
    ...base, policy: { version: " " }
  }), /POLICY_INVALID/);
  assert.equal((await store.getTask("task-0001")).state, "outcome_uncertain");
});

test("storage version conflict fails closed without repeating provider lookup", async () => {
  const { store, adapter, coordinator } = await setup();
  const originalCommit = store.commitDecision.bind(store);
  let commitCalls = 0;
  store.commitDecision = async input => {
    commitCalls++;
    return { committed: false, reasonCode: "TASK_VERSION_CONFLICT" };
  };
  const result = await coordinator.reconcile({ taskId: "task-0001", owner: "worker-a" });
  store.commitDecision = originalCommit;
  assert.equal(result.reconciled, false);
  assert.equal(result.reasonCode, "TASK_VERSION_CONFLICT");
  assert.equal(adapter.calls.length, 1);
  assert.equal(commitCalls, 1);
  assert.equal((await store.getTask("task-0001")).version, 1);
  assert.equal((await store.listDecisions("task-0001")).length, 0);
  const nextLease = await store.acquireLease({
    taskId: "task-0001", owner: "worker-b",
    now: "2026-11-20T15:00:01.000Z", ttlMs: 30000
  });
  assert.ok(nextLease);
});


test("appends sequential STILL_UNKNOWN evidence and hashes the complete history", async () => {
  const first = evidence("STILL_UNKNOWN");
  first.evidence_digest = "1".repeat(64);
  first.evidence_ref = "provider-evidence:first";
  const second = evidence("STILL_UNKNOWN");
  second.evidence_digest = "2".repeat(64);
  second.evidence_ref = "provider-evidence:second";
  let queryCount = 0;
  const adapter = {
    providerId: "provider-x",
    async queryOperationStatus() {
      queryCount++;
      return {
        provider_id: "provider-x",
        provider_operation_ref: priorRequest.provider_operation_ref,
        evidence_records: [queryCount === 1 ? first : second]
      };
    }
  };
  const { store, coordinator } = await setup({ adapterOverride: adapter });
  const firstResult = await coordinator.reconcile({ taskId: "task-0001", owner: "worker-a" });
  const secondResult = await coordinator.reconcile({ taskId: "task-0001", owner: "worker-a" });
  const history = await store.listEvidence("task-0001");
  assert.equal(firstResult.reconciled, true);
  assert.equal(secondResult.reconciled, true);
  assert.equal(history.length, 2);
  assert.deepEqual(history.map(item => item.evidence_digest).sort(),
    ["1".repeat(64), "2".repeat(64)]);
  const decisions = await store.listDecisions("task-0001");
  assert.equal(decisions.length, 2);
  const { computeEvidenceSetDigest } = await import("../../src/core/reconciliation-storage.mjs");
  assert.equal(decisions[1].evidence_set_digest, await computeEvidenceSetDigest(history));
  assert.equal((await store.getTask("task-0001")).state, "outcome_uncertain");
  assert.equal((await store.getTask("task-0001")).version, 1);
});

test("accepted historical evidence does not expire while new evidence is freshness-checked", async () => {
  let current = new Date("2026-11-20T15:00:00.000Z");
  let queryCount = 0;
  const first = evidence("STILL_UNKNOWN");
  first.evidence_digest = "5".repeat(64);
  const second = evidence("STILL_UNKNOWN");
  second.evidence_digest = "6".repeat(64);
  second.observed_at = "2026-11-20T15:09:30.000Z";
  second.verification.verified_at = "2026-11-20T15:09:40.000Z";
  const adapter = {
    providerId: "provider-x",
    async queryOperationStatus() {
      queryCount++;
      return {
        provider_id: "provider-x",
        provider_operation_ref: priorRequest.provider_operation_ref,
        evidence_records: [queryCount === 1 ? first : second]
      };
    }
  };
  const { store, coordinator } = await setup({
    adapterOverride: adapter,
    clock: () => current
  });
  const firstResult = await coordinator.reconcile({ taskId: "task-0001", owner: "worker-a" });
  current = new Date("2026-11-20T15:10:00.000Z");
  const secondResult = await coordinator.reconcile({ taskId: "task-0001", owner: "worker-a" });
  assert.equal(firstResult.reconciled, true);
  assert.equal(secondResult.reconciled, true);
  assert.equal(secondResult.reasonCode, undefined);
  assert.equal((await store.listEvidence("task-0001")).length, 2);
  assert.equal((await store.getTask("task-0001")).state, "outcome_uncertain");
});

test("retains contradictory authenticated evidence but never resolves the task", async () => {
  const unknownRecord = evidence("STILL_UNKNOWN");
  unknownRecord.evidence_digest = "3".repeat(64);
  const appliedRecord = evidence("CONFIRMED_APPLIED");
  appliedRecord.evidence_digest = "4".repeat(64);
  let queryCount = 0;
  const adapter = {
    providerId: "provider-x",
    async queryOperationStatus() {
      queryCount++;
      return {
        provider_id: "provider-x",
        provider_operation_ref: priorRequest.provider_operation_ref,
        evidence_records: [queryCount === 1 ? unknownRecord : appliedRecord]
      };
    }
  };
  const { store, coordinator } = await setup({ adapterOverride: adapter });
  const first = await coordinator.reconcile({ taskId: "task-0001", owner: "worker-a" });
  const second = await coordinator.reconcile({ taskId: "task-0001", owner: "worker-a" });
  assert.equal(first.reconciled, true);
  assert.equal(second.reconciled, true);
  assert.equal(second.conclusion, "STILL_UNKNOWN");
  assert.equal(second.taskState, "outcome_uncertain");
  const history = await store.listEvidence("task-0001");
  assert.equal(history.length, 2);
  assert.deepEqual(history.map(item => item.conclusion).sort(),
    ["CONFIRMED_APPLIED", "STILL_UNKNOWN"]);
  assert.equal((await store.getTask("task-0001")).version, 1);
  assert.equal((await store.listDecisions("task-0001")).length, 2);
});

test("rejects stale current-request binding before querying provider", async () => {
  const { store } = await setup();
  const task = await store.getTask("task-0001");
  // Mutate only the test fixture through a fresh store setup contract.
  // The coordinator's authoritative task snapshot still binds request-0001;
  // a stale lookup response is rejected by exact prior-request identity.
  const stale = structuredClone(priorRequest);
  stale.request_id = "request-old";
  const coordinator = createReconciliationCoordinator({
    store,
    getPriorRequest: async () => stale,
    adapterRegistry: { get: async () => null },
    verifier: { async verifyProviderResponse() { return { authenticated: false }; } },
    clock: () => now,
    createId: prefix => prefix + "-stale"
  });
  assert.equal((await coordinator.reconcile({ taskId: task.task_id, owner: "worker-a" })).reasonCode,
    "ORIGINAL_REQUEST_NOT_FOUND");
  assert.equal((await store.listEvidence("task-0001")).length, 0);
});
