import test from "node:test";
import assert from "node:assert/strict";
import { PairingGuard } from "../../src/worker/pairing-guard.mjs";

const ownerCode = "a".repeat(32);
const nonce = "A".repeat(22);

function createStorage() {
  const values = new Map();
  let tail = Promise.resolve();
  return {
    values,
    async transaction(callback) {
      const run = tail.then(() => callback({
        get: async key => values.get(key),
        put: async (key, value) => { values.set(key, value); }
      }));
      tail = run.catch(() => {});
      return run;
    }
  };
}

function createGuard(storage = createStorage()) {
  return { guard: new PairingGuard({ storage }), storage };
}

function verify(guard, pairingCode, options = {}) {
  return guard.fetch(new Request("https://pairing-guard.internal/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pairingCode,
      expectedCode: ownerCode,
      challengeNonce: options.nonce ?? nonce,
      challengeExpiresAt: options.expiresAt ?? Math.floor(Date.now() / 1000) + 90
    })
  }));
}

test("repeated invalid attempts never create a lockout or consume the owner's challenge", async () => {
  const { guard } = createGuard();
  for (let i = 0; i < 20; i++) {
    const response = await verify(guard, "b".repeat(32));
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "UNAUTHORIZED" });
  }
  const ownerResponse = await verify(guard, ownerCode);
  assert.equal(ownerResponse.status, 200);
  assert.deepEqual(await ownerResponse.json(), { valid: true });
});

test("a successfully used challenge is rejected on replay", async () => {
  const { guard } = createGuard();
  const first = await verify(guard, ownerCode);
  const replay = await verify(guard, ownerCode);
  assert.equal(first.status, 200);
  assert.equal(replay.status, 401);
  assert.deepEqual(await replay.json(), { error: "CHALLENGE_REPLAYED" });
});

test("concurrent requests using the same challenge can succeed only once", async () => {
  const { guard } = createGuard();
  const responses = await Promise.all(
    Array.from({ length: 20 }, () => verify(guard, ownerCode))
  );
  assert.equal(responses.filter(response => response.status === 200).length, 1);
  assert.equal(responses.filter(response => response.status === 401).length, 19);
});

test("different valid challenges remain independently usable", async () => {
  const { guard } = createGuard();
  const first = await verify(guard, ownerCode, { nonce: "A".repeat(22) });
  const second = await verify(guard, ownerCode, { nonce: "B".repeat(22) });
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
});

test("expired or excessively long-lived challenges are rejected", async () => {
  const { guard } = createGuard();
  const expired = await verify(guard, ownerCode, { expiresAt: Math.floor(Date.now() / 1000) - 1 });
  const tooLong = await verify(guard, ownerCode, { nonce: "C".repeat(22), expiresAt: Math.floor(Date.now() / 1000) + 121 });
  assert.equal(expired.status, 401);
  assert.deepEqual(await expired.json(), { error: "CHALLENGE_EXPIRED" });
  assert.equal(tooLong.status, 401);
  assert.deepEqual(await tooLong.json(), { error: "CHALLENGE_EXPIRED" });
});

test("storage failures fail closed without a successful pairing response", async () => {
  const storage = { transaction: async () => { throw new Error("storage unavailable"); } };
  const { guard } = createGuard(storage);
  const response = await verify(guard, ownerCode);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "PAIRING_STORAGE_UNAVAILABLE" });
});

test("malformed requests are rejected before comparison or storage", async () => {
  const { guard } = createGuard();
  const response = await guard.fetch(new Request("https://pairing-guard.internal/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pairingCode: "short", expectedCode: "short" })
  }));
  assert.equal(response.status, 400);
});

test("guard refuses to authenticate if durable storage is unavailable", async () => {
  const { guard } = createGuard(null);
  const response = await verify(guard, ownerCode);
  assert.equal(response.status, 503);
});
