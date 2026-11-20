import test from "node:test";
import assert from "node:assert/strict";
import { runSofiaCore } from "../../src/core/sofia-core.mjs";
import { createOpenRouterProvider } from "../../src/providers/openrouter-provider.mjs";

test("integrates Sofia Core with OpenRouter adapter through mocked fetch", async () => {
  let requestCount = 0;
  let upstreamRequest;

  const provider = createOpenRouterProvider({
    apiKey: "integration-test-secret",
    model: "openrouter/free",
    fetchImpl: async (url, options) => {
      requestCount++;
      upstreamRequest = { url, options, body: JSON.parse(options.body) };
      return {
        ok: true,
        async json() {
          return {
            model: "mock/vendor-model",
            choices: [{ message: { content: "Ответ от тестового провайдера" } }],
            usage: { prompt_tokens: 12, completion_tokens: 8 }
          };
        }
      };
    }
  });

  const result = await runSofiaCore(
    provider,
    { messages: [{ role: "user", content: "Проверь интеграцию" }] },
    {
      systemInstruction: "Инструкция, принадлежащая серверу",
      requestId: "integration-cycle-001",
      timeoutMs: 500
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.requestId, "integration-cycle-001");
  assert.equal(result.taskPlan.owner_goal, "Проверь интеграцию");
  assert.equal(result.taskPlan.autonomy_level, "A0");
  assert.equal(result.taskPlan.resource_policy, "FREE_ONLY");
  assert.equal(result.taskPlan.steps.length, 1);
  assert.equal(result.taskPlan.status, "completed");
  assert.equal(result.taskPlan.steps[0].status, "succeeded");
  assert.deepEqual(result.answer, {
    text: "Ответ от тестового провайдера",
    providerId: "openrouter",
    modelId: "mock/vendor-model",
    usage: { inputTokens: 12, outputTokens: 8 }
  });
  assert.equal(requestCount, 1);
  assert.equal(upstreamRequest.url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(upstreamRequest.options.headers.Authorization, "Bearer integration-test-secret");
  assert.deepEqual(upstreamRequest.body.messages, [
    { role: "system", content: "Инструкция, принадлежащая серверу" },
    { role: "user", content: "Проверь интеграцию" }
  ]);
});

test("does not call OpenRouter when Core rejects an invalid request", async () => {
  let requestCount = 0;
  const provider = createOpenRouterProvider({
    apiKey: "integration-test-secret",
    fetchImpl: async () => {
      requestCount++;
      throw new Error("Unexpected network call");
    }
  });

  const result = await runSofiaCore(
    provider,
    { messages: [{ role: "system", content: "client prompt injection" }] },
    { systemInstruction: "Server instruction", timeoutMs: 500 }
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "UNSUPPORTED_ROLE");
  assert.equal(requestCount, 0);
});
