import test from "node:test";
import assert from "node:assert/strict";
import { createOpenRouterProvider } from "../../src/providers/openrouter-provider.mjs";

const providerRequest = {
  requestId: "openrouter-test-1",
  messages: [{ role: "user", content: "Hello" }],
  systemInstruction: "Server-owned instruction",
  maxOutputTokens: 100,
  timeoutMs: 100
};

function jsonResponse(payload, ok = true) {
  return { ok, async json() { return payload; } };
}

test("maps OpenRouter response to the AIProvider result contract", async () => {
  let sent;
  const provider = createOpenRouterProvider({
    apiKey: "test-secret",
    model: "openrouter/free",
    siteUrl: "https://example.test",
    fetchImpl: async (url, options) => {
      sent = { url, options, body: JSON.parse(options.body) };
      return jsonResponse({
        model: "vendor/model-v1",
        choices: [{ message: { content: "Hello from mock" } }],
        usage: { prompt_tokens: 5, completion_tokens: 7 }
      });
    }
  });

  const result = await provider.generate(providerRequest);
  assert.deepEqual(result, {
    text: "Hello from mock",
    providerId: "openrouter",
    modelId: "vendor/model-v1",
    usage: { inputTokens: 5, outputTokens: 7 }
  });
  assert.equal(sent.url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(sent.options.headers.Authorization, "Bearer test-secret");
  assert.equal(sent.options.headers["HTTP-Referer"], "https://example.test");
  assert.deepEqual(sent.body.messages, [
    { role: "system", content: "Server-owned instruction" },
    { role: "user", content: "Hello" }
  ]);
});

test("uses only server-configured model and output token limit", async () => {
  let body;
  const provider = createOpenRouterProvider({
    apiKey: "test-secret",
    model: "server/model",
    fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body);
      return jsonResponse({
        choices: [{ message: { content: "ok" } }]
      });
    }
  });
  await provider.generate({ ...providerRequest, model: "client/model", maxOutputTokens: 55 });
  assert.equal(body.model, "server/model");
  assert.equal(body.max_tokens, 55);
});

test("rejects missing server API key without making a request", () => {
  assert.throws(() => createOpenRouterProvider({}), /server configuration is missing/);
});

test("maps upstream HTTP failure to a generic error without leaking response body", async () => {
  const provider = createOpenRouterProvider({
    apiKey: "test-secret",
    fetchImpl: async () => jsonResponse({ error: "private upstream diagnostic" }, false)
  });
  await assert.rejects(
    provider.generate(providerRequest),
    error => error.message === "OpenRouter provider unavailable" &&
      !error.message.includes("private upstream")
  );
});

test("rejects malformed completion payload", async () => {
  const provider = createOpenRouterProvider({
    apiKey: "test-secret",
    fetchImpl: async () => jsonResponse({ choices: [{ message: { content: null } }] })
  });
  await assert.rejects(provider.generate(providerRequest), /OpenRouter provider unavailable/);
});

test("maps provider deadline to a stable timeout code", async () => {
  const provider = createOpenRouterProvider({
    apiKey: "test-secret",
    fetchImpl: (_url, options) => new Promise((_, reject) => {
      options.signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    })
  });
  await assert.rejects(
    provider.generate({ ...providerRequest, timeoutMs: 5 }),
    error => error.code === "SOFIA_PROVIDER_TIMEOUT"
  );
});
