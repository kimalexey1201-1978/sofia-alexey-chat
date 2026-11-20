import test from "node:test";
import assert from "node:assert/strict";
import {
  createHmacEvidenceSealer,
  createIntegrityProtectedEvidencePort
} from "../../src/core/integrity-protected-evidence-port.mjs";

const taskId = "task-0001";
const acceptedAt = "2026-11-20T15:00:00.000Z";
function record(digest = "a".repeat(64)) {
  return {
    task_id: taskId, request_id: "request-0001", provider_id: "provider-x",
    schema_version: "1.0.0", evidence_digest: digest,
    conclusion: "STILL_UNKNOWN", observed_at: "2026-11-20T14:59:30.000Z",
    verification: { status: "VERIFIED", verifier_ref: "verifier:test",
      verified_at: "2026-11-20T14:59:40.000Z" }
  };
}
async function key() {
  return globalThis.crypto.subtle.generateKey(
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

test("seals a complete batch before one atomic append and exposes verified reads", async () => {
  const hmacKey = await key();
  const persisted = new Map();
  let appendCalls = 0;
  const port = createIntegrityProtectedEvidencePort({
    sealEvidence: createHmacEvidenceSealer({
      key: hmacKey, keyId: "key-1", acceptedAt
    }),
    resolveKey: async id => id === "key-1" ? hmacKey : null,
    readEntries: async id => persisted.get(id) ?? [],
    appendEntries: async (id, entries) => {
      appendCalls++;
      persisted.set(id, [...(persisted.get(id) ?? []), ...structuredClone(entries)]);
      return { appended: true };
    }
  });
  const result = await port.appendEvidence(taskId, [record(), record("b".repeat(64))]);
  assert.deepEqual(result, { appended: true, count: 2 });
  assert.equal(appendCalls, 1);
  const read = await port.listEvidence(taskId);
  assert.equal(read.verified, true);
  assert.equal(read.records.length, 2);
});

test("does not call storage if any record cannot be sealed", async () => {
  let appendCalls = 0;
  const port = createIntegrityProtectedEvidencePort({
    sealEvidence: async item => {
      if (item.evidence_digest.startsWith("b")) throw new Error("seal failed");
      return { binding: { task_id: taskId } };
    },
    resolveKey: async () => null,
    readEntries: async () => [],
    appendEntries: async () => { appendCalls++; return { appended: true }; }
  });
  const result = await port.appendEvidence(taskId, [record(), record("b".repeat(64))]);
  assert.deepEqual(result, {
    appended: false, reasonCode: "EVIDENCE_INTEGRITY_SEAL_FAILED"
  });
  assert.equal(appendCalls, 0);
});

test("rejects wrong-task and empty batches before storage", async () => {
  let appendCalls = 0;
  const port = createIntegrityProtectedEvidencePort({
    sealEvidence: async () => ({ binding: { task_id: taskId } }),
    resolveKey: async () => null,
    readEntries: async () => [],
    appendEntries: async () => { appendCalls++; return { appended: true }; }
  });
  assert.equal((await port.appendEvidence(taskId, [])).reasonCode,
    "EVIDENCE_APPEND_INPUT_INVALID");
  assert.equal((await port.appendEvidence(taskId, [{ ...record(), task_id: "task-2" }])).reasonCode,
    "EVIDENCE_APPEND_INPUT_INVALID");
  assert.equal(appendCalls, 0);
});

test("reports storage failure without claiming evidence was appended", async () => {
  const hmacKey = await key();
  const port = createIntegrityProtectedEvidencePort({
    sealEvidence: createHmacEvidenceSealer({
      key: hmacKey, keyId: "key-1", acceptedAt
    }),
    resolveKey: async () => hmacKey,
    readEntries: async () => [],
    appendEntries: async () => { throw new Error("transaction failed"); }
  });
  assert.deepEqual(await port.appendEvidence(taskId, [record()]), {
    appended: false, reasonCode: "EVIDENCE_ATOMIC_APPEND_FAILED"
  });
});


test("rejects a forged or unverifiable sealer result before storage is called", async () => {
  let appendCalls = 0;
  const port = createIntegrityProtectedEvidencePort({
    sealEvidence: async item => ({
      version: "1.0.0",
      algorithm: "HMAC-SHA-256",
      key_id: "missing-key",
      accepted_at: acceptedAt,
      record_digest: "0".repeat(64),
      binding: {
        task_id: item.task_id, request_id: item.request_id,
        provider_id: item.provider_id, schema_version: item.schema_version,
        evidence_digest: item.evidence_digest
      },
      mac: "0".repeat(64)
    }),
    resolveKey: async () => null,
    readEntries: async () => [],
    appendEntries: async () => { appendCalls++; return { appended: true }; }
  });
  assert.deepEqual(await port.appendEvidence(taskId, [record()]), {
    appended: false, reasonCode: "EVIDENCE_INTEGRITY_SEAL_FAILED"
  });
  assert.equal(appendCalls, 0);
});
