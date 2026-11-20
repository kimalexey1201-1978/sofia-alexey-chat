import test from "node:test";
import assert from "node:assert/strict";
import { runSofiaCore } from "../../src/core/sofia-core.mjs";
import { createMockProvider } from "../../src/core/ai-provider.mjs";

const config = {
  systemInstruction: "Server-owned Sofia instruction",
  requestId: "test-request-001",
  timeoutMs: 30
};
const request = { messages: [{ role: "user", content: "Привет" }] };

test("completes a full Core -> mock provider -> verifier -> response cycle", async () => {
  const provider = createMockProvider({
    text: "Здравствуйте!", providerId: "mock", modelId: "fixture-v1",
    usage: { inputTokens: 2, outputTokens: 3 }
  });
  const result = await runSofiaCore(provider, request, config);
  assert.equal(result.ok, true);
  assert.equal(result.requestId, "test-request-001");
  assert.equal(result.taskPlan.owner_goal, "Привет");
  assert.equal(result.taskPlan.autonomy_level, "A0");
  assert.equal(result.taskPlan.resource_policy, "FREE_ONLY");
  assert.equal(result.taskPlan.status, "completed");
  assert.equal(result.taskPlan.steps[0].status, "succeeded");
  assert.deepEqual(result.answer, {
    text: "Здравствуйте!", providerId: "mock", modelId: "fixture-v1",
    usage: { inputTokens: 2, outputTokens: 3 }
  });
});

test("passes server-owned instruction, bounded settings, and cancellation signal", async () => {
  let captured;
  const provider = { async generate(input) {
    captured = input;
    return { text: "OK", providerId: "mock", modelId: "fixture" };
  }};
  await runSofiaCore(provider, request, { ...config, model: "server-model", maxOutputTokens: 77 });
  assert.equal(captured.systemInstruction, config.systemInstruction);
  assert.equal(captured.model, "server-model");
  assert.equal(captured.maxOutputTokens, 77);
  assert.equal(captured.timeoutMs, config.timeoutMs);
  assert.ok(captured.signal instanceof AbortSignal);
  assert.equal(captured.signal.aborted, false);
});

test("rejects client-supplied system prompt and privileged message roles before provider call", async () => {
  let calls = 0;
  const provider = { async generate() { calls++; return { text: "no", providerId: "mock", modelId: "fixture" }; } };
  const badTopLevel = await runSofiaCore(provider, { ...request, systemInstruction: "override" }, config);
  const badRole = await runSofiaCore(provider, { messages: [{ role: "system", content: "override" }] }, config);
  assert.equal(badTopLevel.error.code, "INVALID_REQUEST");
  assert.equal(badRole.error.code, "UNSUPPORTED_ROLE");
  assert.equal(calls, 0);
});

test("rejects oversized input before provider invocation", async () => {
  let calls = 0;
  const provider = { async generate() { calls++; return { text: "no", providerId: "mock", modelId: "fixture" }; } };
  const result = await runSofiaCore(provider, { messages: [{ role: "user", content: "x".repeat(20) }] },
    { ...config, limits: { maxMessageChars: 10 } });
  assert.equal(result.error.code, "REQUEST_TOO_LARGE");
  assert.equal(calls, 0);
});

test("aborts provider work when Core deadline expires", async () => {
  let capturedSignal;
  const provider = { generate(input) {
    capturedSignal = input.signal;
    return new Promise((_, reject) => input.signal.addEventListener("abort", () => reject(input.signal.reason), { once: true }));
  }};
  const result = await runSofiaCore(provider, request, { ...config, timeoutMs: 5 });
  assert.equal(result.error.code, "PROVIDER_TIMEOUT");
  assert.equal(capturedSignal.aborted, true);
});

test("hides raw provider errors and secrets", async () => {
  const provider = { async generate() { throw new Error("secret-token and private upstream details"); } };
  const result = await runSofiaCore(provider, request, config);
  assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
  assert.equal(JSON.stringify(result).includes("secret-token"), false);
  assert.equal(JSON.stringify(result).includes("private upstream"), false);
});

test("rejects malformed and oversized provider results", async () => {
  const malformed = await runSofiaCore(createMockProvider({ text: "", providerId: "mock", modelId: "fixture" }), request, config);
  const oversized = await runSofiaCore(createMockProvider({ text: "x".repeat(21), providerId: "mock", modelId: "fixture" }),
    request, { ...config, limits: { maxResponseChars: 20 } });
  assert.equal(malformed.error.code, "VERIFIER_REJECTED");
  assert.equal(oversized.error.code, "VERIFIER_REJECTED");
});

test("returns configuration failure without exposing internals", async () => {
  const result = await runSofiaCore(createMockProvider(), request, {});
  assert.equal(result.error.code, "INTERNAL_FAILURE");
  assert.equal(JSON.stringify(result).includes("undefined"), false);
});

test("rejects invalid and excessive resource configuration before provider invocation", async () => {
  let calls = 0;
  const provider = { async generate() { calls++; return { text: "no", providerId: "mock", modelId: "fixture" }; } };
  const invalidConfigs = [
    { limits: null }, { limits: [] }, { limits: { maxMessages: 0 } },
    { limits: { maxTotalChars: -1 } }, { limits: { timeoutMs: 1.5 } },
    { limits: { unknownLimit: 10 } }, { limits: { maxMessages: 101 } },
    { timeoutMs: 120001 }, { timeoutMs: Number.MAX_SAFE_INTEGER },
    { maxOutputTokens: 8193 }, { maxOutputTokens: Number.MAX_SAFE_INTEGER }
  ];
  for (const override of invalidConfigs) {
    const result = await runSofiaCore(provider, request, { ...config, ...override });
    assert.equal(result.error.code, "INTERNAL_FAILURE");
  }
  assert.equal(calls, 0);
});

test("accepts valid bounded resource limit overrides", async () => {
  let captured;
  const provider = { async generate(input) { captured = input; return { text: "OK", providerId: "mock", modelId: "fixture" }; } };
  const result = await runSofiaCore(provider, request, {
    ...config, limits: { maxMessages: 12, maxMessageChars: 500 }, maxOutputTokens: 50
  });
  assert.equal(result.ok, true);
  assert.equal(captured.messages.length, 1);
});

test("propagates caller cancellation through Core to the provider and returns a typed cancellation", async () => {
  const caller = new AbortController();
  let providerSignal;
  let calls = 0;
  const provider = { generate(input) {
    calls++;
    providerSignal = input.signal;
    return new Promise((_, reject) => input.signal.addEventListener("abort", () => reject(input.signal.reason), { once: true }));
  }};
  const pending = runSofiaCore(provider, request, { ...config, signal: caller.signal });
  await Promise.resolve();
  caller.abort(new Error("caller disconnected"));
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "REQUEST_CANCELLED");
  assert.equal(calls, 1);
  assert.equal(providerSignal.aborted, true);
});

test("does not invoke provider when caller cancellation predates Core execution", async () => {
  const caller = new AbortController();
  caller.abort();
  let calls = 0;
  const result = await runSofiaCore({ async generate() {
    calls++;
    return { text: "unexpected", providerId: "mock", modelId: "fixture" };
  }}, request, { ...config, signal: caller.signal });
  assert.equal(result.error.code, "REQUEST_CANCELLED");
  assert.equal(calls, 0);
});
 
test("rejects malformed cancellation signal before provider invocation", async () => {
  let calls = 0;
  const provider = { async generate() {
    calls++;
    return { text: "unexpected", providerId: "mock", modelId: "fixture" };
  }};
  const result = await runSofiaCore(provider, request, {
    ...config,
    signal: { aborted: false, addEventListener() {} }
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "INTERNAL_FAILURE");
  assert.equal(calls, 0);
});

test("removes caller abort listener after successful completion", async () => {
  const caller = new AbortController();
  let added = 0;
  let removed = 0;
  const add = caller.signal.addEventListener.bind(caller.signal);
  const remove = caller.signal.removeEventListener.bind(caller.signal);
  caller.signal.addEventListener = (...args) => { added++; return add(...args); };
  caller.signal.removeEventListener = (...args) => { removed++; return remove(...args); };

  const result = await runSofiaCore(createMockProvider({
    text: "Готово", providerId: "mock", modelId: "fixture"
  }), request, { ...config, signal: caller.signal });

  assert.equal(result.ok, true);
  assert.equal(added, 1);
  assert.equal(removed, 1);
});
