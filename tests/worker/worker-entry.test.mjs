import test from "node:test";
import assert from "node:assert/strict";
import worker from "../../_worker.js";

test("routes /api/chat to Core handler and keeps asset fallback", async () => {
  let assetCalls = 0;
  const env = {
    ASSETS: {
      async fetch(request) {
        assetCalls++;
        return new Response("static asset: " + new URL(request.url).pathname);
      }
    }
  };

  const preflight = await worker.fetch(
    new Request("https://sofia.example/api/chat", { method: "OPTIONS" }),
    env
  );
  assert.equal(preflight.status, 204);
  assert.equal(assetCalls, 0);

  const asset = await worker.fetch(
    new Request("https://sofia.example/index.html"),
    env
  );
  assert.equal(asset.status, 200);
  assert.equal(await asset.text(), "static asset: /index.html");
  assert.equal(assetCalls, 1);
});

test("routes unknown API paths to assets exactly as before", async () => {
  let assetPath = "";
  const env = {
    ASSETS: {
      async fetch(request) {
        assetPath = new URL(request.url).pathname;
        return new Response("asset");
      }
    }
  };
  const response = await worker.fetch(
    new Request("https://sofia.example/api/other"),
    env
  );
  assert.equal(response.status, 200);
  assert.equal(assetPath, "/api/other");
});
