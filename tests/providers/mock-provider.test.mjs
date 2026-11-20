import test from "node:test";
import assert from "node:assert/strict";
import { createDeterministicMockProvider } from "../../src/providers/mock-provider.mjs";

test("returns deterministic provider result and records request metadata", async () => {
  const provider = createDeterministicMockProvider({
    response: "fixture response", providerId: "mock-fixture",
    modelId: "fixture-v1", usage: { inputTokens: 4, outputTokens: 2 }
  });
  const result = await provider.generate({ requestId: "req-1" });
  assert.deepEqual(result, {
    text: "fixture response", providerId: "mock-fixture",
    modelId: "fixture-v1", usage: { inputTokens: 4, outputTokens: 2 }
  });
  assert.equal(provider.calls.length, 1);
  assert.equal(provider.calls[0].requestId, "req-1");
});

test("supports deterministic provider failure without leaking external data", async () => {
  const provider = createDeterministicMockProvider({
    failWith: Object.assign(new Error("fixture failure"), { code: "MOCK_FAILURE" })
  });
  await assert.rejects(provider.generate({ requestId: "req-fail" }),
    error => error.code === "MOCK_FAILURE");
});

test("rejects malformed mock result through the production result validator", async () => {
  const provider = createDeterministicMockProvider({
    malformedResult: { text: "", providerId: "mock", modelId: "bad" }
  });
  await assert.rejects(provider.generate({ requestId: "req-invalid" }),
    /non-empty string/);
});

test("honors cancellation during a delayed mock invocation", async () => {
  const provider = createDeterministicMockProvider({ delayMs: 100 });
  const controller = new AbortController();
  const pending = provider.generate({ requestId: "req-cancel", signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, error => error.code === "SOFIA_PROVIDER_CANCELLED");
});

test("rejects cancellation before the mock invocation begins", async () => {
  const provider = createDeterministicMockProvider();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(provider.generate({ requestId: "req-pre-cancel", signal: controller.signal }),
    error => error.code === "SOFIA_PROVIDER_CANCELLED");
});
