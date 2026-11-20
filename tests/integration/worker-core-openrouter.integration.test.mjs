import test from "node:test";
import assert from "node:assert/strict";
import { handleChatRequest } from "../../src/worker/chat-route.mjs";

test("runs the complete Worker route -> Core -> OpenRouter adapter -> legacy response cycle", async () => {
  let upstreamRequest;
  const fetchImpl = async (url, init) => {
    upstreamRequest = { url, init, body: JSON.parse(init.body) };
    return Response.json({
      id: "mock-completion",
      model: "openrouter/mock-model",
      choices: [{ message: { role: "assistant", content: "Полный цикл успешно пройден." } }],
      usage: { prompt_tokens: 18, completion_tokens: 7 }
    });
  };

  const request = new Request("https://sofia.kim-alexey1201.workers.dev/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [
        { role: "system", content: "UNTRUSTED CLIENT SYSTEM PROMPT" },
        { role: "user", content: "Проверь полный цикл." }
      ]
    })
  });

  const response = await handleChatRequest(request, {
    OPENROUTER_API_KEY: "test-secret-never-return-this",
    OPENROUTER_MODEL: "openrouter/test-model"
  }, { fetchImpl });

  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.choices[0].message.role, "assistant");
  assert.equal(payload.choices[0].message.content, "Полный цикл успешно пройден.");

  assert.equal(upstreamRequest.url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(upstreamRequest.init.method, "POST");
  assert.equal(upstreamRequest.init.headers.Authorization, "Bearer test-secret-never-return-this");
  assert.equal(upstreamRequest.body.model, "openrouter/test-model");
  assert.equal(upstreamRequest.body.messages[0].role, "system");
  assert.equal(upstreamRequest.body.messages[0].content.includes("UNTRUSTED CLIENT SYSTEM PROMPT"), false);
  assert.deepEqual(upstreamRequest.body.messages[1], {
    role: "user",
    content: "Проверь полный цикл."
  });
  assert.equal(JSON.stringify(payload).includes("test-secret-never-return-this"), false);
});

test("uses the server-side FREE_ONLY default model and rejects client model selection", async () => {
  let upstreamRequest;
  const fetchImpl = async (url, init) => {
    upstreamRequest = { url, init, body: JSON.parse(init.body) };
    return Response.json({
      model: "openrouter/free",
      choices: [{ message: { role: "assistant", content: "Ответ получен через серверную модель по умолчанию." } }]
    });
  };

  const invalidRequest = new Request("https://sofia.example/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "attacker/paid-model",
      messages: [{ role: "user", content: "Выбери модель." }]
    })
  });
  const rejected = await handleChatRequest(invalidRequest, {
    OPENROUTER_API_KEY: "test-secret"
  }, { fetchImpl });
  assert.equal(rejected.status, 400);
  assert.equal(upstreamRequest, undefined);

  const validRequest = new Request("https://sofia.example/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: "Используй серверную модель по умолчанию." }]
    })
  });
  const response = await handleChatRequest(validRequest, {
    OPENROUTER_API_KEY: "test-secret"
  }, { fetchImpl });
  assert.equal(response.status, 200);
  assert.equal(upstreamRequest.body.model, "openrouter/free");
  assert.equal(upstreamRequest.init.headers.Authorization, "Bearer test-secret");
  assert.equal(JSON.stringify(await response.json()).includes("test-secret"), false);
});

