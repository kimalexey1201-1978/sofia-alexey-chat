import test from "node:test";
import assert from "node:assert/strict";
import { createReconciliationCoordinator } from "../../src/core/reconciliation-coordinator.mjs";
import { createIntegrityProtectedReconciliationStore } from "../../src/core/integrity-protected-reconciliation-store.mjs";
import { createEvidenceIntegrityEnvelope } from "../../src/core/evidence-integrity.mjs";
import { createMockReconciliationAdapter } from "../../src/providers/mock-reconciliation-adapter.mjs";

const now = new Date("2026-11-20T15:00:00.000Z");
const taskId = "task-0001";
const priorRequest = {
  request_id: "request-0001", provider_id: "provider-x",
  provider_operation_ref: "operation-123", target_ref: "mailbox:user-1",
  operation_digest: "a".repeat(64), idempotency_key_digest: "b".repeat(64)
};
function evidence(conclusion = "CONFIRMED_APPLIED") {
  return {
    schema_version: "1.0.0", task_id: taskId,
    request_id: priorRequest.request_id, provider_id: priorRequest.provider_id,
    provider_operation_ref: priorRequest.provider_operation_ref,
    target_ref: priorRequest.target_ref, operation_digest: priorRequest.operation_digest,
    idempotency_key_digest: priorRequest.idempotency_key_digest,
    conclusion, evidence_digest: "c".repeat(64),
    evidence_ref: "provider-evidence:123",
    observed_at: "2026-11-20T14:59:30.000Z",
    verification: { status: "VERIFIED", verifier_ref: "test-verifier:provider-x",
      verified_at: "2026-11-20T14:59:40.000Z" }
  };
}
async function makeKey() {
  return globalThis.crypto.subtle.generateKey(
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
function createFakeDurableStore() {
  const task = {
    task_id: taskId, state: "outcome_uncertain", version: 1,
    current_request_id: priorRequest.request_id, correlation_id: "corr-0001",
    created_at: now.toISOString(), updated_at: now.toISOString()
  };
  let lease = null;
  let fencing = 0;
  let evidenceEntries = [];
  const decisions = [];
  const outbox = [];
  let rawEvidenceBypassCalls = 0;
  let atomicCommitCalls = 0;
  return {
    decisions, outbox,
    get rawEvidenceBypassCalls() { return rawEvidenceBypassCalls; },
    get atomicCommitCalls() { return atomicCommitCalls; },
    async getTask(id) { return id === taskId ? structuredClone(task) : null; },
    async acquireLease({ taskId: id, owner, now: at, ttlMs }) {
      if (id !== taskId || lease && Date.parse(lease.lease_expires_at) > Date.parse(at)) return null;
      lease = { task_id: id, lease_owner: owner, fencing_token: ++fencing,
        lease_expires_at: new Date(Date.parse(at) + ttlMs).toISOString() };
      return structuredClone(lease);
    },
    async renewLease() { return null; },
    async releaseLease({ taskId: id, owner, fencingToken }) {
      if (!lease || id !== taskId || owner !== lease.lease_owner ||
          fencingToken !== lease.fencing_token) return false;
      lease = null; return true;
    },
    async listEvidenceEntries(id) {
      return id === taskId ? structuredClone(evidenceEntries) : [];
    },
    async listEvidence() { rawEvidenceBypassCalls++; throw new Error("raw evidence API forbidden"); },
    async commitDecision(input) {
      atomicCommitCalls++;
      if ("evidenceRecords" in input || !Array.isArray(input.evidenceEntries) ||
          !input.decision || !input.auditEvent ||
          input.taskId !== taskId || task.version !== input.expectedVersion ||
          !lease || lease.lease_owner !== input.leaseOwner ||
          lease.fencing_token !== input.fencingToken ||
          Date.parse(lease.lease_expires_at) <= Date.parse(input.now)) {
        return { committed: false, reasonCode: "ATOMIC_COMMIT_REJECTED" };
      }
      // The coordinator supplies the complete evidence set, not only a delta.
      // The durable adapter must merge by digest idempotently inside the transaction.
      const merged = [...evidenceEntries];
      for (const entry of input.evidenceEntries) {
        const existing = merged.find(item =>
          item.record.evidence_digest === entry.record.evidence_digest);
        if (existing) {
          if (JSON.stringify(existing.record) !== JSON.stringify(entry.record)) {
            return { committed: false, reasonCode: "EVIDENCE_DIGEST_CONFLICT" };
          }
        } else {
          merged.push(structuredClone(entry));
        }
      }
      // Single synchronous mutation models the durable transaction boundary.
      evidenceEntries = merged;
      decisions.push(structuredClone(input.decision));
      outbox.push(structuredClone(input.auditEvent));
      task.state = input.decision.conclusion === "CONFIRMED_APPLIED" ? "completed" :
        input.decision.conclusion === "CONFIRMED_NOT_APPLIED" ? "failed" : "outcome_uncertain";
      task.version = input.decision.task_version_after;
      task.updated_at = input.now;
      task.reconciliation_ref = input.decision.evidence_set_digest;
      task.last_reason_code = input.decision.reason_code;
      return { committed: true, task: structuredClone(task),
        evidenceCount: evidenceEntries.length, decision: structuredClone(input.decision) };
    },
    corruptStoredEvidence() {
      if (evidenceEntries[0]) evidenceEntries[0].record.conclusion = "ALTERED";
    }
  };
}
async function setup(records = [evidence()]) {
  const key = await makeKey();
  const durable = createFakeDurableStore();
  let keyAvailable = true;
  const protectedStore = createIntegrityProtectedReconciliationStore({
    store: durable,
    sealEvidence: record => createEvidenceIntegrityEnvelope(record, {
      key, keyId: "integration-key-1", acceptedAt: now.toISOString()
    }),
    resolveKey: async id => keyAvailable && id === "integration-key-1" ? key : null
  });
  const adapter = createMockReconciliationAdapter({
    providerId: "provider-x", evidenceByOperation: { "operation-123": records }
  });
  let id = 0;
  const coordinator = createReconciliationCoordinator({
    store: protectedStore,
    getPriorRequest: async requestId =>
      requestId === priorRequest.request_id ? structuredClone(priorRequest) : null,
    adapterRegistry: { get: async providerId => providerId === "provider-x" ? adapter : null },
    verifier: {
      async verifyProviderResponse(input) {
        return { authenticated: true, evidenceRecords: input.response.evidence_records };
      }
    },
    clock: () => now,
    createId: prefix => `${prefix}-${String(++id).padStart(4, "0")}`,
    policy: { version: "integration-test-1", freshnessWindowMs: 300000, leaseTtlMs: 30000 }
  });
  return { durable, protectedStore, adapter, coordinator,
    setKeyAvailable(value) { keyAvailable = value; } };
}

test("end-to-end coordinator uses protected storage for verified read and atomic sealed commit", async () => {
  const { durable, protectedStore, adapter, coordinator } = await setup();
  const result = await coordinator.reconcile({ taskId, owner: "worker-integration" });
  assert.equal(result.reconciled, true);
  assert.equal(result.taskState, "completed");
  assert.equal(result.taskVersion, 2);
  assert.equal(adapter.calls.length, 1);
  assert.equal(durable.atomicCommitCalls, 1);
  assert.equal(durable.rawEvidenceBypassCalls, 0);
  assert.equal((await durable.getTask(taskId)).state, "completed");
  assert.equal(durable.decisions.length, 1);
  assert.equal(durable.outbox.length, 1);
  const history = await protectedStore.listEvidence(taskId);
  assert.equal(history.length, 1);
  assert.equal(history[0].evidence_digest, "c".repeat(64));
  const storedEntries = await durable.listEvidenceEntries(taskId);
  assert.equal(storedEntries.length, 1);
  assert.equal(storedEntries[0].envelope.algorithm, "HMAC-SHA-256");
  assert.ok(storedEntries[0].envelope.mac);
});

test("end-to-end coordinator fails closed on tampered persisted history before provider query", async () => {
  const first = evidence("STILL_UNKNOWN");
  first.evidence_digest = "1".repeat(64);
  const { durable, adapter, coordinator } = await setup([first]);
  const initial = await coordinator.reconcile({ taskId, owner: "worker-first" });
  assert.equal(initial.reconciled, true);
  assert.equal(initial.taskState, "outcome_uncertain");
  assert.equal(adapter.calls.length, 1);

  durable.corruptStoredEvidence();
  const second = await coordinator.reconcile({ taskId, owner: "worker-second" });
  assert.equal(second.reconciled, false);
  assert.equal(second.reasonCode, "RECONCILIATION_DEPENDENCY_ERROR");
  assert.equal(adapter.calls.length, 1); // tampered history is rejected before provider lookup
  assert.equal(durable.atomicCommitCalls, 1);
  assert.equal((await durable.getTask(taskId)).state, "outcome_uncertain");
  assert.equal(durable.decisions.length, 1);
  assert.equal(durable.outbox.length, 1);
});


test("unavailable integrity key blocks history read before provider query", async () => {
  const first = evidence("STILL_UNKNOWN");
  first.evidence_digest = "2".repeat(64);
  const { durable, adapter, coordinator, setKeyAvailable } = await setup([first]);

  const initial = await coordinator.reconcile({
    taskId, owner: "worker-key-available"
  });
  assert.equal(initial.reconciled, true);
  assert.equal(initial.taskState, "outcome_uncertain");
  assert.equal(adapter.calls.length, 1);
  assert.equal(durable.decisions.length, 1);
  assert.equal(durable.outbox.length, 1);

  setKeyAvailable(false);
  const blocked = await coordinator.reconcile({
    taskId, owner: "worker-key-unavailable"
  });

  assert.equal(blocked.reconciled, false);
  assert.equal(blocked.reasonCode, "RECONCILIATION_DEPENDENCY_ERROR");
  assert.equal(adapter.calls.length, 1); // no provider query after key resolution failure
  assert.equal(durable.atomicCommitCalls, 1);
  assert.equal(durable.decisions.length, 1);
  assert.equal(durable.outbox.length, 1);
  assert.equal((await durable.getTask(taskId)).state, "outcome_uncertain");
});

test("storage read failure stops before provider query and releases the lease", async () => {
  const { durable, adapter, coordinator } = await setup();
  durable.listEvidenceEntries = async () => {
    throw new Error("simulated storage outage");
  };

  const result = await coordinator.reconcile({
    taskId, owner: "worker-storage-outage"
  });

  assert.equal(result.reconciled, false);
  assert.equal(result.reasonCode, "RECONCILIATION_DEPENDENCY_ERROR");
  assert.equal(result.taskState, "outcome_uncertain");
  assert.equal(adapter.calls.length, 0);
  assert.equal(durable.atomicCommitCalls, 0);
  assert.equal(durable.decisions.length, 0);
  assert.equal(durable.outbox.length, 0);

  // A failed verified read must not strand the lease.
  const recoveredLease = await durable.acquireLease({
    taskId, owner: "worker-after-storage-outage",
    now: "2026-11-20T15:00:01.000Z", ttlMs: 30000
  });
  assert.ok(recoveredLease);
  assert.equal(recoveredLease.fencing_token, 2);
  assert.equal(await durable.releaseLease({
    taskId, owner: "worker-after-storage-outage",
    fencingToken: recoveredLease.fencing_token
  }), true);
});

test("repeated reconciliation after terminal resolution is idempotently refused", async () => {
  const { durable, adapter, coordinator } = await setup();
  const first = await coordinator.reconcile({ taskId, owner: "worker-first" });
  assert.equal(first.reconciled, true);
  assert.equal(first.taskState, "completed");
  const second = await coordinator.reconcile({ taskId, owner: "worker-second" });
  assert.equal(second.reconciled, false);
  assert.equal(second.reasonCode, "TASK_NOT_OUTCOME_UNCERTAIN");
  assert.equal(adapter.calls.length, 1);
  assert.equal(durable.atomicCommitCalls, 1);
  assert.equal(durable.decisions.length, 1);
  assert.equal(durable.outbox.length, 1);
});

test("sequential STILL_UNKNOWN evidence is retained and reverified across full cycles", async () => {
  const firstRecord = evidence("STILL_UNKNOWN");
  firstRecord.evidence_digest = "1".repeat(64);
  firstRecord.evidence_ref = "provider-evidence:first";
  const secondRecord = evidence("STILL_UNKNOWN");
  secondRecord.evidence_digest = "2".repeat(64);
  secondRecord.evidence_ref = "provider-evidence:second";
  const { durable, protectedStore, adapter, coordinator } = await setup([firstRecord]);
  let query = 0;
  adapter.queryOperationStatus = async request => {
    adapter.calls.push({ providerId: request.provider_id,
      providerOperationRef: request.provider_operation_ref });
    query++;
    return {
      provider_id: "provider-x",
      provider_operation_ref: "operation-123",
      evidence_records: [structuredClone(query === 1 ? firstRecord : secondRecord)]
    };
  };

  const first = await coordinator.reconcile({ taskId, owner: "worker-first" });
  assert.equal(first.reconciled, true);
  assert.equal(first.taskState, "outcome_uncertain");
  const second = await coordinator.reconcile({ taskId, owner: "worker-second" });
  assert.equal(second.reconciled, true);
  assert.equal(second.taskState, "outcome_uncertain");
  assert.equal(adapter.calls.length, 2);
  assert.equal(durable.atomicCommitCalls, 2);
  assert.equal(durable.decisions.length, 2);
  assert.equal(durable.outbox.length, 2);

  const history = await protectedStore.listEvidence(taskId);
  assert.deepEqual(history.map(item => item.evidence_digest).sort(),
    ["1".repeat(64), "2".repeat(64)]);
  assert.equal((await durable.listEvidenceEntries(taskId)).length, 2);
});

test("contradictory authenticated evidence remains unresolved and both records are retained", async () => {
  const firstRecord = evidence("STILL_UNKNOWN");
  firstRecord.evidence_digest = "3".repeat(64);
  firstRecord.evidence_ref = "provider-evidence:unknown";
  const conflictingRecord = evidence("CONFIRMED_APPLIED");
  conflictingRecord.evidence_digest = "4".repeat(64);
  conflictingRecord.evidence_ref = "provider-evidence:applied";
  const { durable, protectedStore, adapter, coordinator } = await setup([firstRecord]);
  let query = 0;
  adapter.queryOperationStatus = async request => {
    adapter.calls.push({ providerId: request.provider_id,
      providerOperationRef: request.provider_operation_ref });
    query++;
    return {
      provider_id: "provider-x",
      provider_operation_ref: "operation-123",
      evidence_records: [structuredClone(query === 1 ? firstRecord : conflictingRecord)]
    };
  };

  const first = await coordinator.reconcile({ taskId, owner: "worker-first" });
  assert.equal(first.reconciled, true);
  const second = await coordinator.reconcile({ taskId, owner: "worker-second" });
  assert.equal(second.reconciled, true);
  assert.equal(second.conclusion, "STILL_UNKNOWN");
  assert.equal(second.taskState, "outcome_uncertain");
  const history = await protectedStore.listEvidence(taskId);
  assert.equal(history.length, 2);
  assert.deepEqual(new Set(history.map(item => item.conclusion)),
    new Set(["STILL_UNKNOWN", "CONFIRMED_APPLIED"]));
  assert.equal(durable.decisions.length, 2);
  assert.equal(durable.outbox.length, 2);
});

test("failed atomic commit leaves evidence, decision, outbox and task unchanged", async () => {
  const { durable, adapter, coordinator } = await setup();
  const originalCommit = durable.commitDecision.bind(durable);
  durable.commitDecision = async () => {
    throw new Error("simulated transaction rollback");
  };
  const result = await coordinator.reconcile({ taskId, owner: "worker-failure" });
  durable.commitDecision = originalCommit;

  assert.equal(result.reconciled, false);
  assert.equal(result.reasonCode, "ATOMIC_INTEGRITY_COMMIT_FAILED");
  assert.equal(adapter.calls.length, 1);
  assert.equal(durable.atomicCommitCalls, 0);
  assert.equal((await durable.getTask(taskId)).state, "outcome_uncertain");
  assert.equal((await durable.listEvidenceEntries(taskId)).length, 0);
  assert.equal(durable.decisions.length, 0);
  assert.equal(durable.outbox.length, 0);

  const lease = await durable.acquireLease({
    taskId, owner: "worker-after-failure",
    now: "2026-11-20T15:00:01.000Z", ttlMs: 30000
  });
  assert.ok(lease, "failed transaction must not strand the lease");
});


test("replayed identical evidence is deduplicated while each reconciliation remains audited", async () => {
  const replay = evidence("STILL_UNKNOWN");
  replay.evidence_digest = "5".repeat(64);
  replay.evidence_ref = "provider-evidence:replayed";
  const { durable, protectedStore, adapter, coordinator } = await setup([replay]);
  adapter.queryOperationStatus = async request => {
    adapter.calls.push({ providerId: request.provider_id,
      providerOperationRef: request.provider_operation_ref });
    return {
      provider_id: "provider-x",
      provider_operation_ref: "operation-123",
      evidence_records: [structuredClone(replay)]
    };
  };
  const first = await coordinator.reconcile({ taskId, owner: "worker-first" });
  const second = await coordinator.reconcile({ taskId, owner: "worker-second" });
  assert.equal(first.reconciled, true);
  assert.equal(second.reconciled, true);
  assert.equal(adapter.calls.length, 2);
  assert.equal((await protectedStore.listEvidence(taskId)).length, 1);
  assert.equal((await durable.listEvidenceEntries(taskId)).length, 1);
  assert.equal(durable.decisions.length, 2);
  assert.equal(durable.outbox.length, 2);
});
