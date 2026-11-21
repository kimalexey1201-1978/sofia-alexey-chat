import test from "node:test";
import assert from "node:assert/strict";
import {
  assertAIProvider,
  validateProviderResult,
  createMockProvider
} from "../../src/core/ai-provider.mjs";

test("accepts a provider implementing generate(request)", () => {
  const provider = createMockProvider();
  assert.doesNotThrow(() => assertAIProvider(provider));
});

test("rejects a provider without generate()", () => {
  assert.throws(() => assertAIProvider({}), /generate\(request\) is required/);
  assert.throws(() => assertAIProvider(null), /generate\(request\) is required/);
});

test("mock provider returns a provider-independent result", async () => {
  const provider = createMockProvider({
    text: "Hello",
    providerId: "mock",
    modelId: "fixture-v1",
    usage: { inputTokens: 3, outputTokens: 1 }
  });
  assert.deepEqual(await provider.generate({ requestId: "test-1" }), {
    text: "Hello",
    providerId: "mock",
    modelId: "fixture-v1",
    usage: { inputTokens: 3, outputTokens: 1 }
  });
});

test("accepts a structurally valid provider result", () => {
  const result = {
    text: "A response",
    providerId: "mock",
    modelId: "fixture-v1",
    usage: { inputTokens: 3, outputTokens: 1 }
  };
  assert.deepEqual(validateProviderResult(result), result);
});

test("rejects empty text and missing provider metadata", () => {
  assert.throws(() => validateProviderResult({
    text: " ", providerId: "mock", modelId: "fixture-v1"
  }), /non-empty string/);
  assert.throws(() => validateProviderResult({
    text: "response", providerId: "", modelId: "fixture-v1"
  }), /providerId is required/);
  assert.throws(() => validateProviderResult({
    text: "response", providerId: "mock", modelId: ""
  }), /modelId is required/);
});

test("rejects malformed usage metadata", () => {
  assert.throws(() => validateProviderResult({
    text: "response", providerId: "mock", modelId: "fixture-v1",
    usage: { inputTokens: -1 }
  }), /non-negative safe integers/);
});
