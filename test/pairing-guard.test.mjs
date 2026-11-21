import test from "node:test";
import assert from "node:assert/strict";
import { PairingGuard } from "../src/worker/pairing-guard.mjs";

function setup() {
  const storage = {
    get() { throw new Error("Pairing verifier must not read shared lockout state"); },
    put() { throw new Error("Pairing verifier must not persist shared lockout state"); },
    delete() { throw new Error("Pairing verifier must not mutate shared lockout state"); },
    transaction() { throw new Error("Pairing verifier must not open a storage transaction"); }
  };
  const guard = new PairingGuard({ storage });
  const expectedCode = "owner-code-".padEnd(32, "x");
  const request = pairingCode => guard.fetch(new Request("https://guard.internal/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pairingCode, expectedCode })
  }));
  return { storage, request, expectedCode };
}

test("accepts the correct pairing code after repeated incorrect attempts", async () => {
  const { request, expectedCode } = setup();
  for (let i = 0; i < 20; i++) assert.equal((await request("z".repeat(32))).status, 401);
  assert.equal((await request(expectedCode)).status, 200);
});

test("concurrent incorrect attempts cannot block the owner", async () => {
  const { request, expectedCode } = setup();
  const invalid = Array.from({ length: 30 }, () => request("z".repeat(32)));
  const [invalidResponses, ownerResponse] = await Promise.all([
    Promise.all(invalid),
    request(expectedCode)
  ]);
  assert.ok(invalidResponses.every(response => response.status === 401));
  assert.equal(ownerResponse.status, 200);
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

test("correct pairing remains available after verifier recreation", async () => {
  const { storage, request, expectedCode } = setup();
  for (let i = 0; i < 20; i++) assert.equal((await request("z".repeat(32))).status, 401);
  const restartedGuard = new PairingGuard({ storage });
  const response = await restartedGuard.fetch(new Request("https://guard.internal/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pairingCode: expectedCode, expectedCode })
  }));
  assert.equal(response.status, 200);
});

test("bounds streamed internal requests before fully consuming them", async () => {
  const { storage } = setup();
  const guard = new PairingGuard({ storage });
  const response = await guard.fetch(new Request("https://guard.internal/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(2048));
        controller.enqueue(new Uint8Array(2048));
        controller.close();
      }
    }),
    duplex: "half"
  }));
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error, "REQUEST_TOO_LARGE");
});
