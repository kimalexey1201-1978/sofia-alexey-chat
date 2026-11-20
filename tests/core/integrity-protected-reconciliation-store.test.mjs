import test from "node:test";
import assert from "node:assert/strict";
import { createEvidenceIntegrityEnvelope } from "../../src/core/evidence-integrity.mjs";
import { createIntegrityProtectedReconciliationStore } from "../../src/core/integrity-protected-reconciliation-store.mjs";

const taskId = "task-0001";
const acceptedAt = "2026-11-20T15:00:00.000Z";
const record = {
  task_id: taskId, request_id: "request-1", provider_id: "provider-x",
  schema_version: "1.0.0", evidence_digest: "a".repeat(64),
  conclusion: "STILL_UNKNOWN", observed_at: "2026-11-20T14:59:30.000Z",
  verification: { status: "VERIFIED", verifier_ref: "verifier:test",
    verified_at: "2026-11-20T14:59:40.000Z" }
};
async function makeKey() {
  return globalThis.crypto.subtle.generateKey(
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

test("coordinator-facing store seals evidence and sends entries in one commit", async () => {
  const key = await makeKey();
  let persisted = [];
  let captured;
  const durable = {
    getTask: async () => ({ task_id: taskId }),
    acquireLease: async () => ({ fencing_token: 1 }),
    releaseLease: async () => true,
    listEvidenceEntries: async () => structuredClone(persisted),
    commitDecision: async input => {
      captured = input;
      assert.equal("evidenceRecords" in input, false);
      assert.equal(input.evidenceEntries.length, 1);
      // Fake durable transaction: evidence entries and decision commit together.
      persisted = [...persisted, ...structuredClone(input.evidenceEntries)];
      return { committed: true };
    }
  };
  const store = createIntegrityProtectedReconciliationStore({
    store: durable,
    sealEvidence: item => createEvidenceIntegrityEnvelope(item, {
      key, keyId: "key-1", acceptedAt
    }),
    resolveKey: async id => id === "key-1" ? key : null
  });
  const commit = await store.commitDecision({
    taskId, expectedVersion: 1, leaseOwner: "worker", fencingToken: 1,
    now: acceptedAt, evidenceRecords: [record],
    decision: { decision_id: "decision-1" }, auditEvent: { event_id: "event-1" }
  });
  assert.equal(commit.committed, true);
  assert.ok(captured.evidenceEntries[0].envelope.mac);
  assert.deepEqual(await store.listEvidence(taskId), [record]);
});

test("coordinator-facing store refuses unverified persisted evidence", async () => {
  const key = await makeKey();
  const envelope = await createEvidenceIntegrityEnvelope(record, {
    key, keyId: "key-1", acceptedAt
  });
  const durable = {
    getTask: async () => null, acquireLease: async () => null,
    releaseLease: async () => true,
    listEvidenceEntries: async () => [{ record: { ...record, conclusion: "ALTERED" }, envelope }],
    commitDecision: async () => ({ committed: true })
  };
  const store = createIntegrityProtectedReconciliationStore({
    store: durable,
    sealEvidence: async () => envelope,
    resolveKey: async () => key
  });
  await assert.rejects(store.listEvidence(taskId), error =>
    error.code === "EVIDENCE_INTEGRITY_VERIFICATION_FAILED");
});

test("coordinator-facing store rejects invalid evidence before durable commit", async () => {
  let commitCalls = 0;
  const durable = {
    getTask: async () => null, acquireLease: async () => null,
    releaseLease: async () => true, listEvidenceEntries: async () => [],
    commitDecision: async () => { commitCalls++; return { committed: true }; }
  };
  const store = createIntegrityProtectedReconciliationStore({
    store: durable,
    sealEvidence: async () => { throw new Error("no signing key"); },
    resolveKey: async () => null
  });
  const result = await store.commitDecision({
    taskId, evidenceRecords: [record]
  });
  assert.deepEqual(result, {
    committed: false, reasonCode: "EVIDENCE_INTEGRITY_SEAL_FAILED"
  });
  assert.equal(commitCalls, 0);
});
