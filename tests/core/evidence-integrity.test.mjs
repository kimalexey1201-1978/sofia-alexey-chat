import test from "node:test";
import assert from "node:assert/strict";
import {
  createEvidenceIntegrityEnvelope,
  verifyEvidenceIntegrityEnvelope,
  verifyEvidenceIntegrityBatch
} from "../../src/core/evidence-integrity.mjs";

const acceptedAt = "2026-11-20T15:00:00.000Z";
function record() {
  return {
    task_id: "task-0001",
    request_id: "request-0001",
    provider_id: "provider-alpha",
    schema_version: "1.0.0",
    evidence_digest: "a".repeat(64),
    conclusion: "CONFIRMED_APPLIED",
    evidence_ref: "provider:evidence:1",
    observed_at: "2026-11-20T14:59:30.000Z",
    verification: {
      status: "VERIFIED",
      verifier_ref: "verifier:test",
      verified_at: "2026-11-20T14:59:40.000Z"
    }
  };
}
async function key() {
  return globalThis.crypto.subtle.generateKey(
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

test("authenticates an evidence record and its immutable binding", async () => {
  const secret = await key();
  const item = record();
  const envelope = await createEvidenceIntegrityEnvelope(item, {
    key: secret, keyId: "evidence-key-2026-01", acceptedAt
  });
  assert.equal(envelope.algorithm, "HMAC-SHA-256");
  assert.equal(envelope.mac.length, 64);
  assert.equal(await verifyEvidenceIntegrityEnvelope(item, envelope, {
    key: secret, keyId: "evidence-key-2026-01"
  }), true);
});

test("detects evidence mutation after acceptance", async () => {
  const secret = await key();
  const item = record();
  const envelope = await createEvidenceIntegrityEnvelope(item, {
    key: secret, keyId: "key-1", acceptedAt
  });
  item.conclusion = "CONFIRMED_NOT_APPLIED";
  assert.equal(await verifyEvidenceIntegrityEnvelope(item, envelope, {
    key: secret, keyId: "key-1"
  }), false);
});

test("rejects envelope reuse across task or request bindings", async () => {
  const secret = await key();
  const item = record();
  const envelope = await createEvidenceIntegrityEnvelope(item, {
    key: secret, keyId: "key-1", acceptedAt
  });
  const moved = { ...item, task_id: "task-0002" };
  assert.equal(await verifyEvidenceIntegrityEnvelope(moved, envelope, {
    key: secret, keyId: "key-1"
  }), false);
});

test("rejects a modified envelope and an unknown key identifier", async () => {
  const secret = await key();
  const item = record();
  const envelope = await createEvidenceIntegrityEnvelope(item, {
    key: secret, keyId: "key-1", acceptedAt
  });
  const altered = { ...envelope, accepted_at: "2026-11-20T15:01:00.000Z" };
  assert.equal(await verifyEvidenceIntegrityEnvelope(item, altered, {
    key: secret, keyId: "key-1"
  }), false);
  assert.equal(await verifyEvidenceIntegrityEnvelope(item, envelope, {
    key: secret, keyId: "retired-or-unknown-key"
  }), false);
});

test("rejects a validly shaped envelope verified with the wrong key", async () => {
  const signingKey = await key();
  const otherKey = await key();
  const item = record();
  const envelope = await createEvidenceIntegrityEnvelope(item, {
    key: signingKey, keyId: "key-1", acceptedAt
  });
  assert.equal(await verifyEvidenceIntegrityEnvelope(item, envelope, {
    key: otherKey, keyId: "key-1"
  }), false);
});

test("fails closed for malformed evidence and envelope inputs", async () => {
  const secret = await key();
  await assert.rejects(
    createEvidenceIntegrityEnvelope({ ...record(), request_id: "" }, {
      key: secret, keyId: "key-1", acceptedAt
    }),
    /EVIDENCE_INTEGRITY_BINDING_INVALID/
  );
  assert.equal(await verifyEvidenceIntegrityEnvelope(record(), {}, {
    key: secret, keyId: "key-1"
  }), false);
});

test("verifies a complete historical batch using externally resolved keys", async () => {
  const secret = await key();
  const item = record();
  const envelope = await createEvidenceIntegrityEnvelope(item, {
    key: secret, keyId: "key-batch", acceptedAt
  });
  const result = await verifyEvidenceIntegrityBatch(
    [{ record: item, envelope }],
    { resolveKey: async id => id === "key-batch" ? secret : null }
  );
  assert.equal(result.verified, true);
  assert.deepEqual(result.records, [item]);
  assert.notEqual(result.records[0], item);
});

test("fails the entire historical batch if any envelope is missing or invalid", async () => {
  const secret = await key();
  const item = record();
  const envelope = await createEvidenceIntegrityEnvelope(item, {
    key: secret, keyId: "key-batch", acceptedAt
  });
  const missing = await verifyEvidenceIntegrityBatch(
    [{ record: item }],
    { resolveKey: async () => secret }
  );
  assert.equal(missing.verified, false);
  assert.equal(missing.reasonCode, "EVIDENCE_INTEGRITY_ENVELOPE_MISSING");

  const invalid = await verifyEvidenceIntegrityBatch(
    [{ record: item, envelope }, { record: { ...item, conclusion: "CONFIRMED_NOT_APPLIED" }, envelope }],
    { resolveKey: async () => secret }
  );
  assert.equal(invalid.verified, false);
  assert.equal(invalid.reasonCode, "EVIDENCE_INTEGRITY_VERIFICATION_FAILED");
});

test("fails closed when a historical envelope key cannot be resolved", async () => {
  const secret = await key();
  const item = record();
  const envelope = await createEvidenceIntegrityEnvelope(item, {
    key: secret, keyId: "key-retired", acceptedAt
  });
  const result = await verifyEvidenceIntegrityBatch(
    [{ record: item, envelope }],
    { resolveKey: async () => null }
  );
  assert.equal(result.verified, false);
  assert.equal(result.reasonCode, "EVIDENCE_INTEGRITY_KEY_UNAVAILABLE");
});
