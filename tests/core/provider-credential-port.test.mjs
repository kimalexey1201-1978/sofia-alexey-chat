import test from "node:test";
import assert from "node:assert/strict";
import { createOpenRouterCredentialPort } from "../../src/core/provider-credential-port.mjs";

const endpoint = "https://openrouter.ai/api/v1/chat/completions";
const env = { OPENROUTER_API_KEY: "private-test-credential" };

test("credential port injects the secret only at the fixed upstream boundary", async () => {
  let sent;
  const requestOpenRouter = createOpenRouterCredentialPort(env, async (url, init) => {
    sent = { url, init };
    return Response.json({ ok: true });
  });

  const response = await requestOpenRouter(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer attacker-supplied",
      "Cookie": "must-not-cross",
      "X-Title": "Sofia AI",
      "HTTP-Referer": "https://sofia.example/path"
    },
    body: JSON.stringify({ model: "openrouter/free", messages: [] })
  });

  assert.equal(response.status, 200);
  assert.equal(sent.url, endpoint);
  assert.equal(sent.init.headers.get("Authorization"), "Bearer private-test-credential");
  assert.equal(sent.init.headers.get("Cookie"), null);
  assert.equal(sent.init.headers.get("X-Title"), "Sofia AI");
  assert.equal(sent.init.headers.get("HTTP-Referer"), "https://sofia.example");
  assert.equal(sent.init.redirect, "error");
  assert.equal(sent.init.cache, "no-store");
  assert.equal(sent.init.credentials, "omit");
  assert.equal(sent.init.referrerPolicy, "no-referrer");
  assert.equal(requestOpenRouter.toString().includes("private-test-credential"), false);
});

test("credential port refuses arbitrary destinations and methods before network access", async () => {
  let calls = 0;
  const requestOpenRouter = createOpenRouterCredentialPort(env, async () => {
    calls++;
    return new Response("unexpected");
  });

  await assert.rejects(
    requestOpenRouter("https://attacker.example/collect", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}"
    }),
    /PROVIDER_TARGET_NOT_ALLOWED/
  );
  await assert.rejects(
    requestOpenRouter(endpoint, {
      method: "GET", headers: { "Content-Type": "application/json" }, body: "{}"
    }),
    /PROVIDER_REQUEST_NOT_ALLOWED/
  );
  assert.equal(calls, 0);
});

test("credential port rejects non-JSON and oversized provider requests", async () => {
  let calls = 0;
  const requestOpenRouter = createOpenRouterCredentialPort(env, async () => {
    calls++;
    return new Response("unexpected");
  });

  await assert.rejects(
    requestOpenRouter(endpoint, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}" }),
    /PROVIDER_CONTENT_TYPE_NOT_ALLOWED/
  );
  await assert.rejects(
    requestOpenRouter(endpoint, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "x".repeat(8 * 1024 * 1024 + 1)
    }),
    /PROVIDER_REQUEST_NOT_ALLOWED/
  );
  assert.equal(calls, 0);
});

test("credential port fails closed when the server secret or transport is missing", () => {
  assert.throws(() => createOpenRouterCredentialPort({}), /PROVIDER_CREDENTIAL_NOT_CONFIGURED/);
  assert.throws(() => createOpenRouterCredentialPort(env, null), /PROVIDER_TRANSPORT_UNAVAILABLE/);
});
