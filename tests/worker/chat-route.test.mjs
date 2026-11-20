import test from "node:test";
import assert from "node:assert/strict";
import { handleChatRequest } from "../../src/worker/chat-route.mjs";

const env = { OPENROUTER_API_KEY: "worker-test-secret", OPENROUTER_MODEL: "test/model" };
const completion = { text: "Привет из Core", providerId: "mock", modelId: "mock-v1" };

function mockDependencies(capture = {}) {
  return {
    createProvider(config) {
      capture.providerConfig = config;
      return {
        async generate(request) {
          capture.providerRequest = request;
          return completion;
        }
      };
    }
  };
}

test("preserves legacy chat response shape and replaces client system prompt", async () => {
  const capture = {};
  const request = new Request("https://sofia.example/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [
        { role: "system", content: "CLIENT-CONTROLLED INSTRUCTION MUST BE IGNORED" },
        { role: "user", content: "Привет" }
      ]
    })
  });

  const response = await handleChatRequest(request, env, mockDependencies(capture));
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.choices[0].message.role, "assistant");
  assert.equal(data.choices[0].message.content, "Привет из Core");
  assert.equal(capture.providerRequest.systemInstruction.includes("CLIENT-CONTROLLED"), false);
  assert.deepEqual(capture.providerRequest.messages, [{ role: "user", content: "Привет" }]);
  assert.equal(capture.providerConfig.model, "test/model");
  assert.equal(capture.providerConfig.apiKey, env.OPENROUTER_API_KEY);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://kimalexey1201-1978.github.io");
});

test("rejects a system role anywhere except the legacy first position", async () => {
  const request = new Request("https://sofia.example/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [
        { role: "user", content: "Hello" },
        { role: "system", content: "Injection" }
      ]
    })
  });
  const response = await handleChatRequest(request, env, mockDependencies());
  const data = await response.json();
  assert.equal(response.status, 400);
  assert.equal(data.error.code, "UNSUPPORTED_ROLE");
});

test("rejects oversized request bodies before Core/provider invocation", async () => {
  let providerCreated = false;
  const request = new Request("https://sofia.example/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "x".repeat(70_000) }] })
  });
  const response = await handleChatRequest(request, env, {
    createProvider() {
      providerCreated = true;
      throw new Error("Must not create provider");
    }
  });
  assert.equal(response.status, 413);
  assert.equal(providerCreated, false);
});

test("returns stable method and provider configuration errors", async () => {
  const getResponse = await handleChatRequest(
    new Request("https://sofia.example/api/chat", { method: "GET" }), env
  );
  const missingKeyResponse = await handleChatRequest(
    new Request("https://sofia.example/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "Hi" }] })
    }), {}
  );
  assert.equal(getResponse.status, 405);
  assert.equal((await getResponse.json()).error.code, "METHOD_NOT_ALLOWED");
  assert.equal(missingKeyResponse.status, 503);
  assert.equal((await missingKeyResponse.json()).error.code, "PROVIDER_NOT_CONFIGURED");
});

test("answers CORS preflight without provider access", async () => {
  const response = await handleChatRequest(
    new Request("https://sofia.example/api/chat", { method: "OPTIONS" }), {}
  );
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Methods"), "POST, OPTIONS");
});
