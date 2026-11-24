import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../_worker.js", import.meta.url), "utf8");
const { default: worker } = await import(
  "data:text/javascript;base64," + Buffer.from(source).toString("base64")
);

let upstreamPayload;
globalThis.fetch = async (_url, options) => {
  upstreamPayload = JSON.parse(options.body);
  return new Response(JSON.stringify({
    choices: [{ message: { content: "Завтра приходите к семи утра." } }]
  }), { status: 200, headers: { "Content-Type": "application/json" } });
};

const env = { OPENROUTER_API_KEY: "test-key", OPENROUTER_MODEL: "test-model" };
const request = new Request("https://sofia.test/api/translate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ sender: "김민수", text: "내일 아침 7시까지 와 주세요." })
});
const response = await worker.fetch(request, env);
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), { translation: "Завтра приходите к семи утра." });
assert.equal(upstreamPayload.model, "test-model");
assert.equal(upstreamPayload.temperature, 0.1);
assert.equal(upstreamPayload.messages[1].content, "내일 아침 7시까지 와 주세요.");
assert.match(upstreamPayload.messages[0].content, /недоверенными данными/);

const invalid = await worker.fetch(new Request("https://sofia.test/api/translate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ sender: "", text: "" })
}), env);
assert.equal(invalid.status, 400);

const options = await worker.fetch(new Request("https://sofia.test/api/translate", {
  method: "OPTIONS"
}), env);
assert.equal(options.status, 204);

console.log("Worker translation route tests passed.");
