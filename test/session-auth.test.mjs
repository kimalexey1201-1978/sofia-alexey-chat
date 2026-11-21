import test from "node:test";
import assert from "node:assert/strict";
import { handleSessionRequest, issueOwnerSession, verifyOwnerSession } from "../src/worker/session-auth.mjs";

const env = {
  SOFIA_OWNER_PAIRING_CODE: "owner-code-".padEnd(32, "x"),
  SOFIA_SESSION_SIGNING_KEY: "signing-key-".padEnd(48, "y"),
  SOFIA_PAIRING_GUARD: {
    idFromName: () => "owner-pairing",
    get: () => ({
      fetch: async (_url, init) => {
        const body = JSON.parse(init.body);
        return body.pairingCode === body.expectedCode
          ? Response.json({ valid: true })
          : Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
      }
    })
  }
};

async function pairingPayload(code) {
  const challengeResponse = await handleSessionRequest(new Request("https://x.test/api/session/challenge", { method: "GET" }), env);
  assert.equal(challengeResponse.status, 200);
  const challenge = await challengeResponse.json();
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(code), "PBKDF2", false, ["deriveBits"]);
  const proofBytes = new Uint8Array(await crypto.subtle.deriveBits({
    name: "PBKDF2", hash: "SHA-256",
    salt: Uint8Array.from(atob(challenge.salt.replaceAll("-", "+").replaceAll("_", "/") + "=="), c => c.charCodeAt(0)),
    iterations: challenge.iterations
  }, material, 256));
  let binary = "";
  for (const byte of proofBytes) binary += String.fromCharCode(byte);
  const proof = btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  return { pairingCode: code, challenge: challenge.challenge, proof };
}
async function postPairing(code) {
  const body = await pairingPayload(code);
  return handleSessionRequest(new Request("https://x.test/api/session", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  }), env);
}
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
test("issues a signed challenge and accepts a matching PBKDF2 pairing proof", async () => {
  const challengeResponse = await handleSessionRequest(new Request("https://x.test/api/session/challenge", { method: "GET" }), env);
  const challenge = await challengeResponse.json();
  assert.equal(challengeResponse.status, 200);
  assert.equal(challenge.iterations, 120000);
  assert.equal(typeof challenge.challenge, "string");
  assert.equal(typeof challenge.salt, "string");
  const response = await postPairing(env.SOFIA_OWNER_PAIRING_CODE);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(typeof body.token, "string");
  assert.equal(JSON.stringify(body).includes(env.SOFIA_OWNER_PAIRING_CODE), false);
});
test("rejects a proof computed for a different pairing code", async () => {
  const payload = await pairingPayload("wrong-code-".padEnd(32, "z"));
  payload.pairingCode = env.SOFIA_OWNER_PAIRING_CODE;
  const response = await handleSessionRequest(new Request("https://x.test/api/session", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
  }), env);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "INVALID_PAIRING_PROOF");
});
test("rejects pairing attempts without a signed challenge and proof", async () => {
  const response = await handleSessionRequest(new Request("https://x.test/api/session", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pairingCode: env.SOFIA_OWNER_PAIRING_CODE })
  }), env);
  assert.equal(response.status, 400);
});
test("rejects incorrect pairing codes after proof validation", async () => {
  const response = await postPairing("z".repeat(32));
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

test("fails closed when durable pairing protection is not configured", async () => {
  const { SOFIA_PAIRING_GUARD, ...unprotectedEnv } = env;
  const payload = await pairingPayload(env.SOFIA_OWNER_PAIRING_CODE);
  const response = await handleSessionRequest(new Request("https://x.test/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }), unprotectedEnv);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "PAIRING_PROTECTION_NOT_CONFIGURED");
});

test("rejects oversized bearer headers before HMAC verification", async () => {
  const request = new Request("https://x.test", {
    headers: { Authorization: "Bearer " + "a".repeat(600) }
  });
  assert.equal(await verifyOwnerSession(request, env, 1001), false);
});

test("rejects bearer tokens with extra segments or invalid base64url characters", async () => {
  assert.equal(await verifyOwnerSession(new Request("https://x.test", {
    headers: { Authorization: "Bearer a.b.c" }
  }), env, 1001), false);
  assert.equal(await verifyOwnerSession(new Request("https://x.test", {
    headers: { Authorization: "Bearer a*.b*" }
  }), env, 1001), false);
});

test("rejects sessions with a future issue time beyond clock tolerance", async () => {
  const result = await issueOwnerSession(env.SOFIA_OWNER_PAIRING_CODE, env, 2000);
  const request = new Request("https://x.test", {
    headers: { Authorization: "Bearer " + result.token }
  });
  assert.equal(await verifyOwnerSession(request, env, 1900), false);
});
