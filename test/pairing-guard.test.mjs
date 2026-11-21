import test from "node:test";
import assert from "node:assert/strict";
import { PairingGuard } from "../src/worker/pairing-guard.mjs";

class MemoryStorage {
  values = new Map();
  async get(key) { return this.values.get(key); }
  async put(key, value) { this.values.set(key, structuredClone(value)); }
  async delete(key) { return this.values.delete(key); }
  async transaction(callback) { return callback(this); }
}
function setup() {
  const storage = new MemoryStorage();
  const guard = new PairingGuard({ storage });
  const expectedCode = "owner-code-".padEnd(32, "x");
  const request = pairingCode => guard.fetch(new Request("https://guard.internal/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pairingCode, expectedCode })
  }));
  return { storage, request, expectedCode };
}

test("accepts the correct pairing code and clears prior failures", async () => {
  const { request, expectedCode } = setup();
  assert.equal((await request("z".repeat(32))).status, 401);
  assert.equal((await request(expectedCode)).status, 200);
});

test("blocks the fifth failed attempt and subsequent attempts", async () => {
  const { request } = setup();
  for (let i = 0; i < 4; i++) assert.equal((await request("z".repeat(32))).status, 401);
  const fifth = await request("z".repeat(32));
  assert.equal(fifth.status, 429);
  assert.equal(fifth.headers.get("Retry-After"), "900");
  assert.equal((await request("z".repeat(32))).status, 429);
});

test("rejects malformed internal requests", async () => {
  const { storage } = setup();
  const guard = new PairingGuard({ storage });
  const response = await guard.fetch(new Request("https://guard.internal/verify", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}"
  }));
  assert.equal(response.status, 400);
});

test("does not expose the expected pairing code in responses", async () => {
  const { request, expectedCode } = setup();
  const response = await request("z".repeat(32));
  assert.equal((await response.text()).includes(expectedCode), false);
});

test("persists the lockout across object recreation and permits pairing after expiry", async () => {
  const { storage, request, expectedCode } = setup();
  const originalNow = Date.now;
  let now = 1_000_000;
  Date.now = () => now;
  try {
    for (let i = 0; i < 5; i++) await request("z".repeat(32));
    const restartedGuard = new PairingGuard({ storage });
    const blockedAfterRestart = await restartedGuard.fetch(new Request("https://guard.internal/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pairingCode: expectedCode, expectedCode })
    }));
    assert.equal(blockedAfterRestart.status, 429);
    now += 15 * 60 * 1000 + 1;
    const allowedAfterExpiry = await restartedGuard.fetch(new Request("https://guard.internal/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pairingCode: expectedCode, expectedCode })
    }));
    assert.equal(allowedAfterExpiry.status, 200);
  } finally {
    Date.now = originalNow;
  }
});
