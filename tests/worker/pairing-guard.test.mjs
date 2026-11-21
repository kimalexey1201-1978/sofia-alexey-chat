import test from "node:test";
import assert from "node:assert/strict";
import { PairingGuard } from "../../src/worker/pairing-guard.mjs";

const guard = new PairingGuard({
  storage: {
    transaction() {
      throw new Error("PairingGuard must not persist or consult global lockout state");
    }
  }
});

function verify(pairingCode, expectedCode = "a".repeat(32)) {
  return guard.fetch(new Request("https://pairing-guard.internal/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pairingCode, expectedCode })
  }));
}

test("repeated invalid attempts never create a lockout for the owner", async () => {
  for (let i = 0; i < 20; i++) {
    const response = await verify("b".repeat(32));
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "UNAUTHORIZED" });
  }

  const ownerResponse = await verify("a".repeat(32));
  assert.equal(ownerResponse.status, 200);
  assert.deepEqual(await ownerResponse.json(), { valid: true });
});

test("concurrent invalid attempts cannot block a correct pairing", async () => {
  const invalid = Array.from({ length: 25 }, () => verify("b".repeat(32)));
  const [invalidResponses, ownerResponse] = await Promise.all([
    Promise.all(invalid),
    verify("a".repeat(32))
  ]);

  assert.ok(invalidResponses.every(response => response.status === 401));
  assert.equal(ownerResponse.status, 200);
});

test("pairing verifier does not depend on Durable Object storage", async () => {
  const response = await verify("a".repeat(32));
  assert.equal(response.status, 200);
});

test("malformed requests are rejected before comparison", async () => {
  const response = await guard.fetch(new Request("https://pairing-guard.internal/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pairingCode: "short", expectedCode: "short" })
  }));
  assert.equal(response.status, 400);
});
