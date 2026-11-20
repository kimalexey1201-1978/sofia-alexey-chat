import test from "node:test";
import assert from "node:assert/strict";
import { handleChatRequest } from "../../src/worker/chat-route.mjs";

test("accepts the legacy browser payload with its system message and 30-message history", async () => {
  let upstreamMessages;

  const history = Array.from({ length: 30 }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    content: `Историческое сообщение ${index + 1}`
  }));

  const response = await handleChatRequest(
    new Request("https://sofia.kim-alexey1201.workers.dev/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: "LEGACY CLIENT INSTRUCTION IS UNTRUSTED" },
          ...history
        ]
      })
    }),
    {
      OPENROUTER_API_KEY: "history-test-secret",
      OPENROUTER_MODEL: "openrouter/test-model"
    },
    {
      fetchImpl: async (_url, init) => {
        upstreamMessages = JSON.parse(init.body).messages;
        return Response.json({
          model: "openrouter/test-model",
          choices: [{ message: { role: "assistant", content: "История принята." } }]
        });
      }
    }
  );

  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.choices[0].message.content, "История принята.");
  assert.equal(upstreamMessages.length, 31);
  assert.equal(upstreamMessages[0].role, "system");
  assert.equal(
    upstreamMessages[0].content.includes("LEGACY CLIENT INSTRUCTION IS UNTRUSTED"),
    false
  );
  assert.deepEqual(upstreamMessages.slice(1), history);
  assert.equal(upstreamMessages.at(-1).content, "Историческое сообщение 30");
});
