import test from "node:test";
import assert from "node:assert/strict";
import { handleChatRequest } from "../../src/worker/chat-route.mjs";

test("returns a stable sanitized provider error in the legacy client envelope", async () => {
  const secret = "upstream-private-diagnostic-secret";
  const response = await handleChatRequest(
    new Request("https://sofia.kim-alexey1201.workers.dev/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Проверь ошибку провайдера." }]
      })
    }),
    {
      OPENROUTER_API_KEY: "error-test-key",
      OPENROUTER_MODEL: "openrouter/test-model"
    },
    {
      fetchImpl: async () => Response.json(
        { error: secret },
        { status: 429 }
      )
    }
  );

  const payload = await response.json();
  const serialized = JSON.stringify(payload);

  assert.equal(response.status, 502);
  assert.equal(payload.error.code, "PROVIDER_UNAVAILABLE");
  assert.equal(typeof payload.error.message, "string");
  assert.equal(serialized.includes(secret), false);
  assert.equal(serialized.includes("error-test-key"), false);
  assert.equal(
    response.headers.get("Access-Control-Allow-Origin"),
    "https://kimalexey1201-1978.github.io"
  );
});
