import test from "node:test";
import assert from "node:assert/strict";
import { handleImageAnalysisRequest } from "../src/worker/image-analysis-route.mjs";
import { issueOwnerSession } from "../src/worker/session-auth.mjs";

const env = { OPENROUTER_API_KEY: "test-key", OPENROUTER_VISION_MODEL: "vision-test", SOFIA_OWNER_PAIRING_CODE: "a".repeat(32), SOFIA_SESSION_SIGNING_KEY: "s".repeat(48) };
let token;
test("prepare owner session for protected image endpoint tests", async () => {
  token = (await issueOwnerSession(env.SOFIA_OWNER_PAIRING_CODE, env)).token;
});
function request(file, prompt = "Опиши фото", authorization = token) {
  const form = new FormData();
  form.set("image", file);
  form.set("prompt", prompt);
  return new Request("https://example.test/api/analyze-image", { method: "POST", headers: authorization ? { Authorization: "Bearer " + authorization } : {}, body: form });
}
test("rejects image upload without owner session", async () => {
  const response = await handleImageAnalysisRequest(request(new File(["x"], "a.jpg", { type: "image/jpeg" }), "", null), env);
  assert.equal(response.status, 401);
});
test("requires multipart upload", async () => {
  const response = await handleImageAnalysisRequest(new Request("https://x.test", { method: "POST", headers: { Authorization: "Bearer " + token }, body: "{}" }), env);
  assert.equal(response.status, 415);
});
test("requires explicit server vision model configuration", async () => {
  const response = await handleImageAnalysisRequest(request(new File(["x"], "a.jpg", { type: "image/jpeg" })), { ...env, OPENROUTER_VISION_MODEL: "" });
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

test("rejects oversized streamed multipart body before parsing or provider invocation", async () => {
  let providerCalled = false;
  const chunk = new Uint8Array(1024 * 1024);
  const request = new Request("https://example.test/api/analyze-image", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "multipart/form-data; boundary=sofia-test-boundary"
    },
    body: new ReadableStream({
      start(controller) {
        for (let i = 0; i < 5; i++) controller.enqueue(chunk);
        controller.enqueue(new Uint8Array(128 * 1024));
        controller.close();
      }
    }),
    duplex: "half"
  });
  const response = await handleImageAnalysisRequest(request, env, {
    fetchImpl: async () => {
      providerCalled = true;
      throw new Error("provider must not be called for oversized upload");
    }
  });
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error.code, "IMAGE_TOO_LARGE");
  assert.equal(providerCalled, false);
});
