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

test("returns caller cancellation promptly when provider ignores AbortSignal", async () => {
  const caller = new AbortController();
  let calls = 0;
  let providerSignal;
  const provider = { generate(input) {
    calls++;
    providerSignal = input.signal;
    // Simulate a provider adapter that cannot cancel its underlying operation.
    return new Promise(() => {});
  }};

  const pending = runSofiaCore(provider, request, { ...config, timeoutMs: 10000, signal: caller.signal });
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

test("caller cancellation wins when it races with the provider timeout", async () => {
  const caller = new AbortController();
  let calls = 0;
  const provider = { generate() {
    calls++;
    // Abort synchronously as the provider starts; the timeout is already armed.
    caller.abort(new Error("caller disconnected"));
    return new Promise(() => {});
  }};

  const result = await runSofiaCore(provider, request, {
    ...config, timeoutMs: 1, signal: caller.signal
  });
  assert.equal(result.error.code, "REQUEST_CANCELLED");
  assert.equal(calls, 1);
});

test("removes caller abort listener after cancelled completion", async () => {
  const caller = new AbortController();
  let added = 0;
  let removed = 0;
  const add = caller.signal.addEventListener.bind(caller.signal);
  const remove = caller.signal.removeEventListener.bind(caller.signal);
  caller.signal.addEventListener = (...args) => { added++; return add(...args); };
  caller.signal.removeEventListener = (...args) => { removed++; return remove(...args); };
  const provider = { generate() { return new Promise(() => {}); } };

  const pending = runSofiaCore(provider, request, {
    ...config, timeoutMs: 10000, signal: caller.signal
  });
  await Promise.resolve();
  caller.abort();
  const result = await pending;

  assert.equal(result.error.code, "REQUEST_CANCELLED");
  assert.equal(added, 1);
  assert.equal(removed, 1);
});

test("a new Core request succeeds after a previous request was cancelled", async () => {
  const caller = new AbortController();
  let calls = 0;
  const provider = { generate() {
    calls++;
    if (calls === 1) return new Promise(() => {});
    return Promise.resolve({ text: "Второй запрос выполнен", providerId: "mock", modelId: "fixture" });
  }};

  const cancelledRequest = runSofiaCore(provider, request, {
    ...config, timeoutMs: 10000, signal: caller.signal
  });
  await Promise.resolve();
  caller.abort();
  const cancelledResult = await cancelledRequest;
  assert.equal(cancelledResult.error.code, "REQUEST_CANCELLED");

  const nextResult = await runSofiaCore(provider, request, config);
  assert.equal(nextResult.ok, true);
  assert.equal(nextResult.answer.text, "Второй запрос выполнен");
  assert.equal(calls, 2);
});

test("does not trust provider-supplied Core cancellation or timeout error codes", async () => {
  const cancellationSpoof = new Error("provider internal error");
  cancellationSpoof.code = "SOFIA_REQUEST_CANCELLED";
  const timeoutSpoof = new Error("provider internal error");
  timeoutSpoof.code = "SOFIA_PROVIDER_TIMEOUT";

  const cancelled = await runSofiaCore({
    async generate() { throw cancellationSpoof; }
  }, request, config);
  const timedOut = await runSofiaCore({
    async generate() { throw timeoutSpoof; }
  }, request, config);

  assert.equal(cancelled.error.code, "PROVIDER_UNAVAILABLE");
  assert.equal(timedOut.error.code, "PROVIDER_UNAVAILABLE");
});



test("rejects provider-supplied tool calls and unrecognized result fields at the Core boundary", async () => {
  let calls = 0;
  const provider = { async generate() {
    calls++;
    return {
      text: "Looks harmless",
      providerId: "mock",
      modelId: "fixture",
      tool_calls: [{ name: "delete_files", arguments: {} }]
    };
  }};
  const result = await runSofiaCore(provider, request, config);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "VERIFIER_REJECTED");
  assert.equal(calls, 1);
  assert.equal(JSON.stringify(result).includes("delete_files"), false);
});

test("accepts only bounded token usage fields and copies provider usage metadata", async () => {
  const usage = { inputTokens: 4, outputTokens: 6 };
  const provider = { async generate() {
    return { text: "OK", providerId: "mock", modelId: "fixture", usage };
  }};
  const result = await runSofiaCore(provider, request, config);
  assert.equal(result.ok, true);
  assert.deepEqual(result.answer.usage, { inputTokens: 4, outputTokens: 6 });
  assert.notEqual(result.answer.usage, usage);
});

test("rejects unsupported and unsafe token usage metadata", async () => {
  const invalidUsage = [
    { inputTokens: 1, cachedTokens: 2 },
    { inputTokens: -1 },
    { outputTokens: 1.5 },
    { outputTokens: Number.MAX_SAFE_INTEGER + 1 }
  ];
  for (const usage of invalidUsage) {
    const result = await runSofiaCore({
      async generate() { return { text: "OK", providerId: "mock", modelId: "fixture", usage }; }
    }, request, config);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "VERIFIER_REJECTED");
  }
});


test("isolates concurrent requests when provider responses resolve out of order", async () => {
  const pending = new Map();
  const provider = { generate(input) {
    return new Promise(resolve => pending.set(input.requestId, { input, resolve }));
  }};

  const first = runSofiaCore(provider,
    { messages: [{ role: "user", content: "Первый запрос" }] },
    { ...config, requestId: "parallel-1" });
  const second = runSofiaCore(provider,
    { messages: [{ role: "user", content: "Второй запрос" }] },
    { ...config, requestId: "parallel-2" });

  await new Promise(resolve => setImmediate(resolve));
  assert.equal(pending.size, 2);
  assert.equal(pending.get("parallel-1").input.messages[0].content, "Первый запрос");
  assert.equal(pending.get("parallel-2").input.messages[0].content, "Второй запрос");
  assert.notEqual(pending.get("parallel-1").input.signal, pending.get("parallel-2").input.signal);

  pending.get("parallel-2").resolve({
    text: "Ответ на второй запрос", providerId: "mock", modelId: "fixture"
  });
  pending.get("parallel-1").resolve({
    text: "Ответ на первый запрос", providerId: "mock", modelId: "fixture"
  });

  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(firstResult.ok, true);
  assert.equal(secondResult.ok, true);
  assert.equal(firstResult.requestId, "parallel-1");
  assert.equal(secondResult.requestId, "parallel-2");
  assert.equal(firstResult.taskPlan.owner_goal, "Первый запрос");
  assert.equal(secondResult.taskPlan.owner_goal, "Второй запрос");
  assert.equal(firstResult.answer.text, "Ответ на первый запрос");
  assert.equal(secondResult.answer.text, "Ответ на второй запрос");
});

test("cancelling one concurrent request does not abort its sibling", async () => {
  const callerToCancel = new AbortController();
  const pending = new Map();
  const provider = { generate(input) {
    return new Promise((resolve, reject) => {
      pending.set(input.requestId, { input, resolve });
      input.signal.addEventListener("abort", () => reject(input.signal.reason), { once: true });
    });
  }};

  const cancelled = runSofiaCore(provider,
    { messages: [{ role: "user", content: "Отменяемый запрос" }] },
    { ...config, requestId: "cancel-me", signal: callerToCancel.signal, timeoutMs: 10000 });
  const sibling = runSofiaCore(provider,
    { messages: [{ role: "user", content: "Независимый запрос" }] },
    { ...config, requestId: "keep-running", timeoutMs: 10000 });

  await new Promise(resolve => setImmediate(resolve));
  assert.equal(pending.size, 2);
  callerToCancel.abort(new Error("caller cancelled only this request"));

  const cancelledResult = await cancelled;
  assert.equal(cancelledResult.error.code, "REQUEST_CANCELLED");
  assert.equal(pending.get("cancel-me").input.signal.aborted, true);
  assert.equal(pending.get("keep-running").input.signal.aborted, false);

  pending.get("keep-running").resolve({
    text: "Соседний запрос завершён", providerId: "mock", modelId: "fixture"
  });
  const siblingResult = await sibling;
  assert.equal(siblingResult.ok, true);
  assert.equal(siblingResult.requestId, "keep-running");
  assert.equal(siblingResult.answer.text, "Соседний запрос завершён");
});
