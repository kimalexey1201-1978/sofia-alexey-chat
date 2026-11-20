import test from "node:test";
import assert from "node:assert/strict";
import { createEvidenceIntegrityEnvelope } from "../../src/core/evidence-integrity.mjs";
import { createIntegrityVerifiedEvidenceReader } from "../../src/core/integrity-evidence-reader.mjs";

const acceptedAt = "2026-11-20T15:00:00.000Z";
function record(taskId = "task-0001", digest = "a".repeat(64)) {
  return {
    task_id: taskId, request_id: "request-0001", provider_id: "provider-alpha",
    schema_version: "1.0.0", evidence_digest: digest,
    conclusion: "CONFIRMED_APPLIED", evidence_ref: "provider:evidence:1",
    observed_at: "2026-11-20T14:59:30.000Z",
    verification: { status: "VERIFIED", verifier_ref: "verifier:test",
      verified_at: "2026-11-20T14:59:40.000Z" }
  };
}
async function makeEntry(item, key, keyId = "storage-key-1") {
  return { record: item, envelope: await createEvidenceIntegrityEnvelope(item, {
    key, keyId, acceptedAt
  }) };
}
async function createKey() {
  return globalThis.crypto.subtle.generateKey(
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

test("reader exposes detached records only after every envelope verifies", async () => {
  const key = await createKey();
  const item = record();
  const entries = [await makeEntry(item, key)];
  const reader = createIntegrityVerifiedEvidenceReader({
    readEntries: async () => entries,
    resolveKey: async id => id === "storage-key-1" ? key : null
  });
  const result = await reader.listEvidence("task-0001");
  assert.equal(result.verified, true);
  assert.deepEqual(result.records, [item]);
  assert.notEqual(result.records[0], item);
});

test("reader rejects the complete batch if one persisted record is altered", async () => {
  const key = await createKey();
  const first = record();
  const second = record("task-0001", "b".repeat(64));
  const entries = [await makeEntry(first, key), await makeEntry(second, key)];
  entries[1].record.conclusion = "CONFIRMED_NOT_APPLIED";
  const reader = createIntegrityVerifiedEvidenceReader({
    readEntries: async () => entries,
    resolveKey: async () => key
  });
  const result = await reader.listEvidence("task-0001");
  assert.equal(result.verified, false);
  assert.equal(result.reasonCode, "EVIDENCE_INTEGRITY_VERIFICATION_FAILED");
  assert.equal("records" in result, false);
});

test("reader rejects records belonging to a different task", async () => {
  const key = await createKey();
  const entries = [await makeEntry(record("task-0002"), key)];
  const reader = createIntegrityVerifiedEvidenceReader({
    readEntries: async () => entries,
    resolveKey: async () => key
  });
  const result = await reader.listEvidence("task-0001");
  assert.equal(result.verified, false);
  assert.equal(result.reasonCode, "EVIDENCE_INTEGRITY_BINDING_MISMATCH");
});

test("reader fails closed when storage or key resolution is unavailable", async () => {
  const key = await createKey();
  const item = record();
  const entries = [await makeEntry(item, key)];
  const unavailableStore = createIntegrityVerifiedEvidenceReader({
    readEntries: async () => { throw new Error("storage unavailable"); },
    resolveKey: async () => key
  });
  assert.equal((await unavailableStore.listEvidence("task-0001")).reasonCode,
    "PERSISTED_EVIDENCE_UNAVAILABLE");
  const unavailableKey = createIntegrityVerifiedEvidenceReader({
    readEntries: async () => entries,
    resolveKey: async () => null
  });
  assert.equal((await unavailableKey.listEvidence("task-0001")).reasonCode,
    "EVIDENCE_INTEGRITY_KEY_UNAVAILABLE");
});

test("reader returns a verified empty history without requiring a key lookup", async () => {
  let keyLookups = 0;
  const reader = createIntegrityVerifiedEvidenceReader({
    readEntries: async () => [],
    resolveKey: async () => { keyLookups += 1; return null; }
  });
  const result = await reader.listEvidence("task-0001");
  assert.deepEqual(result, { verified: true, records: [] });
  assert.equal(keyLookups, 0);
});
