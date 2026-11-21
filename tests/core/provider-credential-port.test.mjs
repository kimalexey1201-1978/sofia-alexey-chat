import test from "node:test";
import assert from "node:assert/strict";
import { createOpenRouterCredentialPort } from "../../src/core/provider-credential-port.mjs";

const endpoint = "https://openrouter.ai/api/v1/chat/completions";
const env = { OPENROUTER_API_KEY: "private-test-credential" };
const chatPolicy = { mode: "chat", model: "openrouter/free", maxTokens: 1200, temperature: 0.7 };
const chatBody = JSON.stringify({
  model: "openrouter/free",
  messages: [
    { role: "system", content: "Server instruction" },
    { role: "user", content: "Hello" }
  ],
  max_tokens: 100,
  temperature: 0.7
});

test("credential port injects the secret only at the fixed upstream boundary", async () => {
  let sent;
  const requestOpenRouter = createOpenRouterCredentialPort(env, async (url, init) => {
    sent = { url, init };
    return Response.json({ ok: true });
  }, chatPolicy);

  const response = await requestOpenRouter(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer attacker-supplied",
      "Cookie": "must-not-cross",
      "X-Title": "Sofia AI",
      "HTTP-Referer": "https://sofia.example/path"
    },
    body: chatBody
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
  }, chatPolicy);

  await assert.rejects(
    requestOpenRouter("https://attacker.example/collect", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: chatBody
    }),
    /PROVIDER_TARGET_NOT_ALLOWED/
  );
  await assert.rejects(
    requestOpenRouter(endpoint, {
      method: "GET", headers: { "Content-Type": "application/json" }, body: chatBody
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
  }, chatPolicy);

  await assert.rejects(
    requestOpenRouter(endpoint, { method: "POST", headers: { "Content-Type": "text/plain" }, body: chatBody }),
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

test("credential port rejects unapproved models and provider-specific tool overrides", async () => {
  let calls = 0;
  const requestOpenRouter = createOpenRouterCredentialPort(env, async () => {
    calls++;
    return Response.json({ ok: true });
  }, chatPolicy);

  const alteredModel = JSON.stringify({
    model: "attacker/paid-model",
    messages: [{ role: "system", content: "S" }, { role: "user", content: "Hi" }],
    max_tokens: 100,
    temperature: 0.7
  });
  const withTools = JSON.stringify({
    model: "openrouter/free",
    messages: [{ role: "system", content: "S" }, { role: "user", content: "Hi" }],
    max_tokens: 100,
    temperature: 0.7,
    tools: [{ type: "function", function: { name: "exfiltrate" } }]
  });

  for (const body of [alteredModel, withTools]) {
    await assert.rejects(
      requestOpenRouter(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body }),
      /PROVIDER_PAYLOAD_NOT_ALLOWED/
    );
  }
  assert.equal(calls, 0);
});

test("vision capability accepts only the configured vision model and image payload shape", async () => {
  let sent;
  const requestVision = createOpenRouterCredentialPort(env, async (url, init) => {
    sent = { url, init };
    return Response.json({ ok: true });
  }, { mode: "vision", model: "vision-approved", maxTokens: 700, temperature: 0.2 });
  const body = JSON.stringify({
    model: "vision-approved",
    messages: [{
      role: "user",
      content: [
        { type: "text", text: "Describe this image" },
        { type: "image_url", image_url: { url: "data:image/jpeg;base64,YWJj" } }
      ]
    }],
    max_tokens: 700,
    temperature: 0.2
  });
  const response = await requestVision(endpoint, {
    method: "POST", headers: { "Content-Type": "application/json" }, body
  });
  assert.equal(response.status, 200);
  assert.equal(sent.init.headers.get("Authorization"), "Bearer private-test-credential");
});

test("credential port fails closed when the server secret, policy, or transport is missing", () => {
  assert.throws(() => createOpenRouterCredentialPort({}, async () => {}, chatPolicy), /PROVIDER_CREDENTIAL_NOT_CONFIGURED/);
  assert.throws(() => createOpenRouterCredentialPort(env, null, chatPolicy), /PROVIDER_TRANSPORT_UNAVAILABLE/);
  assert.throws(() => createOpenRouterCredentialPort(env, async () => {}, {}), /PROVIDER_CAPABILITY_POLICY_INVALID/);
});
