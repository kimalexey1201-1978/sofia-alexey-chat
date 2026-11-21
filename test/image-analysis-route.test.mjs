import test from "node:test";
import assert from "node:assert/strict";
import { handleImageAnalysisRequest } from "../src/worker/image-analysis-route.mjs";

function request(file, prompt = "Опиши фото") {
  const form = new FormData();
  form.set("image", file);
  form.set("prompt", prompt);
  return new Request("https://example.test/api/analyze-image", { method: "POST", body: form });
}
const env = { OPENROUTER_API_KEY: "test-key", OPENROUTER_VISION_MODEL: "vision-test" };

test("requires multipart upload", async () => {
  const response = await handleImageAnalysisRequest(new Request("https://x.test", { method: "POST", body: "{}" }), env);
  assert.equal(response.status, 415);
});

test("requires explicit server vision model configuration", async () => {
  const response = await handleImageAnalysisRequest(request(new File(["x"], "a.jpg", { type: "image/jpeg" })), { OPENROUTER_API_KEY: "key" });
  assert.equal(response.status, 503);
});

test("rejects unsupported media types", async () => {
  const response = await handleImageAnalysisRequest(request(new File(["x"], "a.mp4", { type: "video/mp4" })), env);
  assert.equal(response.status, 415);
});

test("sends image as multimodal content and returns analysis without storing it", async () => {
  let sent;
  const response = await handleImageAnalysisRequest(request(new File(["abc"], "a.jpg", { type: "image/jpeg" })), env, {
    fetchImpl: async (_url, options) => {
      sent = JSON.parse(options.body);
      return Response.json({ model: "vision-test", choices: [{ message: { content: "На фото изображён пейзаж." } }] });
    }
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.analysis.text, "На фото изображён пейзаж.");
  assert.equal(body.retention, "not_stored_by_this_endpoint");
  assert.equal(sent.model, "vision-test");
  assert.equal(sent.messages[0].content[1].image_url.url, "data:image/jpeg;base64,YWJj");
});

test("does not expose provider failure details", async () => {
  const response = await handleImageAnalysisRequest(request(new File(["abc"], "a.jpg", { type: "image/jpeg" })), env, {
    fetchImpl: async () => new Response("private upstream detail", { status: 500 })
  });
  const body = await response.json();
  assert.equal(response.status, 502);
  assert.equal(body.error.code, "VISION_PROVIDER_UNAVAILABLE");
  assert.equal(JSON.stringify(body).includes("private upstream detail"), false);
});
