import test from "node:test";
import assert from "node:assert/strict";
import { applyAssistantResult } from "../../src/client/chat-result.mjs";

test("adds a successful assistant answer to the transcript", () => {
  const history = [{ who: "me", text: "Привет", date: "2026-11-20T00:00:00.000Z" }];
  const result = applyAssistantResult(history, { ok: true, answer: "Здравствуйте!" }, "2026-11-20T00:01:00.000Z");

  assert.equal(result.status, "connected");
  assert.equal(result.message, "София на связи");
  assert.deepEqual(result.chat, [
    ...history,
    { who: "sofia", text: "Здравствуйте!", date: "2026-11-20T00:01:00.000Z" }
  ]);
  assert.notEqual(result.chat, history);
});

test("keeps the transcript unchanged on a provider or network failure", () => {
  const history = [
    { who: "me", text: "Сохрани это", date: "2026-11-20T00:00:00.000Z" },
    { who: "sofia", text: "Сохранено", date: "2026-11-20T00:00:01.000Z" }
  ];
  const snapshot = structuredClone(history);
  const result = applyAssistantResult(history, { ok: false, message: "Сервис временно недоступен" });

  assert.equal(result.status, "error");
  assert.equal(result.message, "Сервис временно недоступен");
  assert.equal(result.chat, history);
  assert.deepEqual(history, snapshot);
  assert.equal(result.chat.some(message => message.text.includes("недоступен")), false);
});

test("uses a safe generic status when an error message is missing", () => {
  const history = [];
  const result = applyAssistantResult(history, { ok: false });

  assert.equal(result.chat, history);
  assert.equal(result.status, "error");
  assert.match(result.message, /Не удалось получить ответ/);
});

test("does not append an empty successful answer", () => {
  const history = [{ who: "me", text: "Вопрос", date: "2026-11-20T00:00:00.000Z" }];
  const result = applyAssistantResult(history, { ok: true, answer: "  " });

  assert.equal(result.chat, history);
  assert.equal(result.status, "error");
});

test("rejects malformed transcript or result inputs", () => {
  assert.throws(() => applyAssistantResult(null, { ok: true, answer: "ok" }), TypeError);
  assert.throws(() => applyAssistantResult([], null), TypeError);
});


test("builds a stable retry snapshot without duplicating the pending user message", async () => {
  const { buildChatRequestMessages } = await import("../../src/client/chat-result.mjs");
  const system = { role: "system", content: "Server-owned instruction" };
  const history = [{ who: "me", text: "Повтори запрос", date: "2026-11-20T00:00:00.000Z" }];
  const snapshot = buildChatRequestMessages(system, history);

  history.push({ who: "me", text: "Новое сообщение", date: "2026-11-20T00:00:01.000Z" });

  assert.deepEqual(snapshot, [
    { role: "system", content: "Server-owned instruction" },
    { role: "user", content: "Повтори запрос" }
  ]);
  assert.equal(snapshot.filter(message => message.role === "user" && message.content === "Повтори запрос").length, 1);
});

test("rejects invalid chat request snapshot inputs", async () => {
  const { buildChatRequestMessages } = await import("../../src/client/chat-result.mjs");
  assert.throws(() => buildChatRequestMessages(null, []), TypeError);
  assert.throws(() => buildChatRequestMessages({ content: "ok" }, null), TypeError);
  assert.throws(() => buildChatRequestMessages({ content: "ok" }, [], 0), TypeError);
});
