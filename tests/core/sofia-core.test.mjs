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
    text: "Здравствуйте!",
    providerId: "mock",
    modelId: "fixture-v1",
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
    text: "Здравствуйте!",
    providerId: "mock",
    modelId: "fixture-v1",
    usage: { inputTokens: 2, outputTokens: 3 }
  });
});

test("passes only server-owned instruction and bounded settings to provider", async () => {
  let captured;
  const provider = { async generate(input) {
    captured = input;
    return { text: "OK", providerId: "mock", modelId: "fixture" };
  }};
  await runSofiaCore(provider, request, {
    ...config, model: "server-model", maxOutputTokens: 77
  });
  assert.equal(captured.systemInstruction, config.systemInstruction);
  assert.equal(captured.model, "server-model");
  assert.equal(captured.maxOutputTokens, 77);
  assert.equal(captured.timeoutMs, config.timeoutMs);
});

test("rejects client-supplied system prompt and privileged message roles before provider call", async () => {
  let calls = 0;
  const provider = { async generate() {
    calls++;
    return { text: "no", providerId: "mock", modelId: "fixture" };
  }};
  const badTopLevel = await runSofiaCore(provider, {
    ...request, systemInstruction: "override"
  }, config);
  const badRole = await runSofiaCore(provider, {
    messages: [{ role: "system", content: "override" }]
  }, config);
  assert.equal(badTopLevel.error.code, "INVALID_REQUEST");
  assert.equal(badRole.error.code, "UNSUPPORTED_ROLE");
  assert.equal(calls, 0);
});

test("rejects oversized input before provider invocation", async () => {
  let calls = 0;
  const provider = { async generate() {
    calls++;
    return { text: "no", providerId: "mock", modelId: "fixture" };
  }};
  const result = await runSofiaCore(provider, {
    messages: [{ role: "user", content: "x".repeat(20) }]
  }, { ...config, limits: { maxMessageChars: 10 } });
  assert.equal(result.error.code, "REQUEST_TOO_LARGE");
  assert.equal(calls, 0);
});

test("maps provider timeout to a stable typed failure", async () => {
  const provider = { generate: () => new Promise(() => {}) };
  const result = await runSofiaCore(provider, request, { ...config, timeoutMs: 5 });
  assert.deepEqual(result, {
    ok: false,
    error: {
      code: "PROVIDER_TIMEOUT",
      message: "The AI provider did not respond in time"
    }
  });
});

test("hides raw provider errors and secrets", async () => {
  const provider = { async generate() {
    throw new Error("secret-token and private upstream details");
  }};
  const result = await runSofiaCore(provider, request, config);
  assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
  assert.equal(JSON.stringify(result).includes("secret-token"), false);
  assert.equal(JSON.stringify(result).includes("private upstream"), false);
});

test("rejects malformed and oversized provider results", async () => {
  const malformed = await runSofiaCore(createMockProvider({
    text: "", providerId: "mock", modelId: "fixture"
  }), request, config);
  const oversized = await runSofiaCore(createMockProvider({
    text: "x".repeat(21), providerId: "mock", modelId: "fixture"
  }), request, {
    ...config, limits: { maxResponseChars: 20 }
  });
  assert.equal(malformed.error.code, "VERIFIER_REJECTED");
  assert.equal(oversized.error.code, "VERIFIER_REJECTED");
});

test("returns configuration failure without exposing internals", async () => {
  const result = await runSofiaCore(createMockProvider(), request, {});
  assert.equal(result.error.code, "INTERNAL_FAILURE");
  assert.equal(JSON.stringify(result).includes("undefined"), false);
});


test("rejects invalid resource limit configuration before provider invocation", async () => {
  let calls = 0;
  const provider = { async generate() {
    calls++;
    return { text: "no", providerId: "mock", modelId: "fixture" };
  }};

  const invalidConfigs = [
    { limits: null },
    { limits: [] },
    { limits: { maxMessages: 0 } },
    { limits: { maxTotalChars: -1 } },
    { limits: { timeoutMs: 1.5 } },
    { limits: { unknownLimit: 10 } }
  ];

  for (const override of invalidConfigs) {
    const result = await runSofiaCore(provider, request, {
      ...config, ...override
    });
    assert.equal(result.error.code, "INTERNAL_FAILURE");
  }
  assert.equal(calls, 0);
});

test("accepts valid positive safe-integer resource limit overrides", async () => {
  let captured;
  const provider = { async generate(input) {
    captured = input;
    return { text: "OK", providerId: "mock", modelId: "fixture" };
  }};

  const result = await runSofiaCore(provider, request, {
    ...config,
    limits: { maxMessages: 12, maxMessageChars: 500 },
    maxOutputTokens: 50
  });
  assert.equal(result.ok, true);
  assert.equal(captured.messages.length, 1);
});
