import test from "node:test";
import assert from "node:assert/strict";
import { handleSessionRequest, issueOwnerSession, verifyOwnerSession } from "../src/worker/session-auth.mjs";

const env = { SOFIA_OWNER_PAIRING_CODE: "owner-code-".padEnd(32, "x"), SOFIA_SESSION_SIGNING_KEY: "signing-key-".padEnd(48, "y") };
test("issues a signed short-lived session for the owner pairing code", async () => {
  const result = await issueOwnerSession(env.SOFIA_OWNER_PAIRING_CODE, env, 1000);
  assert.equal(result.expiresAt, 1000 + 43200);
  const req = new Request("https://x.test", { headers: { Authorization: "Bearer " + result.token } });
  assert.equal(await verifyOwnerSession(req, env, 1001), true);
});
test("rejects invalid, altered and expired sessions", async () => {
  const result = await issueOwnerSession(env.SOFIA_OWNER_PAIRING_CODE, env, 1000);
  assert.equal(await verifyOwnerSession(new Request("https://x.test"), env, 1001), false);
  assert.equal(await verifyOwnerSession(new Request("https://x.test", { headers: { Authorization: "Bearer " + result.token + "x" } }), env, 1001), false);
  assert.equal(await verifyOwnerSession(new Request("https://x.test", { headers: { Authorization: "Bearer " + result.token } }), env, 44200), false);
});
test("pairing endpoint returns a session and does not echo the pairing code", async () => {
  const response = await handleSessionRequest(new Request("https://x.test/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pairingCode: env.SOFIA_OWNER_PAIRING_CODE }) }), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(typeof body.token, "string");
  assert.equal(JSON.stringify(body).includes(env.SOFIA_OWNER_PAIRING_CODE), false);
});
test("rejects incorrect pairing codes", async () => {
  const response = await handleSessionRequest(new Request("https://x.test/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pairingCode: "z".repeat(32) }) }), env);
  assert.equal(response.status, 401);
});

test("rejects oversized pairing requests before parsing JSON", async () => {
  const response = await handleSessionRequest(new Request("https://x.test/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pairingCode: env.SOFIA_OWNER_PAIRING_CODE, extra: "x".repeat(5000) })
  }), env);
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error.code, "REQUEST_TOO_LARGE");
});
test("rejects unsupported top-level session fields", async () => {
  const response = await handleSessionRequest(new Request("https://x.test/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pairingCode: env.SOFIA_OWNER_PAIRING_CODE, role: "owner" })
  }), env);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "INVALID_PAIRING_CODE");
});
test("requires JSON content type for pairing requests", async () => {
  const response = await handleSessionRequest(new Request("https://x.test/api/session", {
    method: "POST", headers: { "Content-Type": "text/plain" }, body: "anything"
  }), env);
  assert.equal(response.status, 415);
  assert.equal((await response.json()).error.code, "UNSUPPORTED_MEDIA_TYPE");
});
