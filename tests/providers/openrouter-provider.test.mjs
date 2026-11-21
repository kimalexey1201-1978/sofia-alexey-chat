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
function jsonResponse(payload, ok = true) { return { ok, async json() { return payload; } }; }

test("maps OpenRouter response to the AIProvider result contract", async () => {
  let sent;
  const provider = createOpenRouterProvider({
    apiKey: "test-secret", model: "openrouter/free", siteUrl: "https://example.test",
    fetchImpl: async (url, options) => {
      sent = { url, options, body: JSON.parse(options.body) };
      return jsonResponse({ model: "vendor/model-v1",
        choices: [{ message: { content: "Hello from mock" } }],
        usage: { prompt_tokens: 5, completion_tokens: 7 } });
    }
  });
  const result = await provider.generate(providerRequest);
  assert.deepEqual(result, { text: "Hello from mock", providerId: "openrouter",
    modelId: "vendor/model-v1", usage: { inputTokens: 5, outputTokens: 7 } });
  assert.equal(sent.url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(sent.options.headers.Authorization, "Bearer test-secret");
  assert.equal(sent.options.headers["HTTP-Referer"], "https://example.test");
  assert.deepEqual(sent.body.messages, [
    { role: "system", content: "Server-owned instruction" },
    { role: "user", content: "Hello" }
  ]);
  assert.equal(sent.options.signal.aborted, false);
});

test("uses only server-configured model and output token limit", async () => {
  let body;
  const provider = createOpenRouterProvider({ apiKey: "test-secret", model: "server/model",
    fetchImpl: async (_url, options) => { body = JSON.parse(options.body); return jsonResponse({ choices: [{ message: { content: "ok" } }] }); } });
  await provider.generate({ ...providerRequest, model: "client/model", maxOutputTokens: 55 });
  assert.equal(body.model, "server/model");
  assert.equal(body.max_tokens, 55);
});

test("propagates Core cancellation to the upstream fetch signal", async () => {
  const coreController = new AbortController();
  let upstreamSignal;
  const provider = createOpenRouterProvider({ apiKey: "test-secret",
    fetchImpl: (_url, options) => {
      upstreamSignal = options.signal;
      return new Promise((_, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
    } });
  const pending = provider.generate({ ...providerRequest, signal: coreController.signal });
  await Promise.resolve();
  coreController.abort();
  await assert.rejects(pending, /OpenRouter provider unavailable/);
  assert.equal(upstreamSignal.aborted, true);
});

test("rejects missing server API key without making a request", () => {
  assert.throws(() => createOpenRouterProvider({}), /server configuration is missing/);
});

test("maps upstream HTTP failure to a generic error without leaking response body", async () => {
  const provider = createOpenRouterProvider({ apiKey: "test-secret",
    fetchImpl: async () => jsonResponse({ error: "private upstream diagnostic" }, false) });
  await assert.rejects(provider.generate(providerRequest), error =>
    error.message === "OpenRouter provider unavailable" && !error.message.includes("private upstream"));
});

test("rejects malformed completion payload", async () => {
  const provider = createOpenRouterProvider({ apiKey: "test-secret",
    fetchImpl: async () => jsonResponse({ choices: [{ message: { content: null } }] }) });
  await assert.rejects(provider.generate(providerRequest), /OpenRouter provider unavailable/);
});

test("maps provider deadline to a stable timeout code", async () => {
  const provider = createOpenRouterProvider({ apiKey: "test-secret",
    fetchImpl: (_url, options) => new Promise((_, reject) => {
      options.signal.addEventListener("abort", () => { const error = new Error("aborted"); error.name = "AbortError"; reject(error); });
    }) });
  await assert.rejects(provider.generate({ ...providerRequest, timeoutMs: 5 }),
    error => error.code === "SOFIA_PROVIDER_TIMEOUT");
});

test("does not invoke upstream fetch when Core cancellation is already signaled", async () => {
  const coreController = new AbortController();
  coreController.abort(new Error("request already cancelled"));
  let fetchCalled = false;
  const provider = createOpenRouterProvider({
    apiKey: "test-secret",
    fetchImpl: async () => {
      fetchCalled = true;
      return jsonResponse({ choices: [{ message: { content: "must not happen" } }] });
    }
  });

  await assert.rejects(
    provider.generate({ ...providerRequest, signal: coreController.signal }),
    /OpenRouter provider unavailable/
  );
  assert.equal(fetchCalled, false);
});

test("does not leak cancellation reason or credentials through adapter errors", async () => {
  const secret = "sensitive-upstream-token";
  const coreController = new AbortController();
  let upstreamSignal;
  const provider = createOpenRouterProvider({
    apiKey: secret,
    fetchImpl: (_url, options) => {
      upstreamSignal = options.signal;
      return new Promise((_, reject) => options.signal.addEventListener("abort", () => {
        reject(new Error(secret + " private cancellation detail"));
      }, { once: true }));
    }
  });
  const pending = provider.generate({ ...providerRequest, signal: coreController.signal });
  await Promise.resolve();
  coreController.abort(new Error(secret + " owner cancellation reason"));
  await assert.rejects(pending, error =>
    error.message === "OpenRouter provider unavailable" &&
    !error.message.includes(secret)
  );
  assert.equal(upstreamSignal.aborted, true);
});

test("rejects malformed cancellation signal before upstream dispatch", async () => {
  let fetchCalled = false;
  const provider = createOpenRouterProvider({
    apiKey: "test-secret",
    fetchImpl: async () => {
      fetchCalled = true;
      return jsonResponse({ choices: [{ message: { content: "unexpected" } }] });
    }
  });
  await assert.rejects(provider.generate({
    ...providerRequest,
    signal: { aborted: false, addEventListener() {} }
  }), /Invalid provider cancellation signal/);
  assert.equal(fetchCalled, false);
});

test("removes Core abort listener after successful upstream response", async () => {
  const coreController = new AbortController();
  let added = 0;
  let removed = 0;
  const add = coreController.signal.addEventListener.bind(coreController.signal);
  const remove = coreController.signal.removeEventListener.bind(coreController.signal);
  coreController.signal.addEventListener = (...args) => { added++; return add(...args); };
  coreController.signal.removeEventListener = (...args) => { removed++; return remove(...args); };

  const provider = createOpenRouterProvider({
    apiKey: "test-secret",
    fetchImpl: async () => jsonResponse({ choices: [{ message: { content: "success" } }] })
  });
  const result = await provider.generate({
    ...providerRequest,
    signal: coreController.signal
  });
  assert.equal(result.text, "success");
  assert.equal(added, 1);
  assert.equal(removed, 1);
});

test("removes Core abort listener after cancelled upstream request", async () => {
  const coreController = new AbortController();
  let added = 0;
  let removed = 0;
  const add = coreController.signal.addEventListener.bind(coreController.signal);
  const remove = coreController.signal.removeEventListener.bind(coreController.signal);
  coreController.signal.addEventListener = (...args) => { added++; return add(...args); };
  coreController.signal.removeEventListener = (...args) => { removed++; return remove(...args); };
  const provider = createOpenRouterProvider({
    apiKey: "test-secret",
    fetchImpl: (_url, options) => new Promise((_, reject) => {
      options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    })
  });

  const pending = provider.generate({ ...providerRequest, signal: coreController.signal });
  await Promise.resolve();
  coreController.abort();
  await assert.rejects(pending, /OpenRouter provider unavailable/);
  assert.equal(added, 1);
  assert.equal(removed, 1);
});

