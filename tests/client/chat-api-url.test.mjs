import test from "node:test";
import assert from "node:assert/strict";
import { resolveChatApiUrl } from "../../src/client/chat-api-url.mjs";

const productionApi = "https://sofia.kim-alexey1201.workers.dev/api/chat";

test("GitHub Pages uses the production Worker API", () => {
  assert.equal(resolveChatApiUrl({
    hostname: "kimalexey1201-1978.github.io",
    origin: "https://kimalexey1201-1978.github.io"
  }), productionApi);
});

test("GitHub Pages hostname matching is case-insensitive", () => {
  assert.equal(resolveChatApiUrl({
    hostname: "KIMALEXEY1201-1978.GITHUB.IO",
    origin: "https://KIMALEXEY1201-1978.GITHUB.IO"
  }), productionApi);
});

test("a Cloudflare Preview page uses its own same-origin API", () => {
  const origin = "https://fix-preview-api-routing-20261121.sofia.kim-alexey1201.workers.dev";
  assert.equal(resolveChatApiUrl({ hostname: new URL(origin).hostname, origin }), origin + "/api/chat");
});

test("the Production Worker page uses its same-origin API", () => {
  const origin = "https://sofia.kim-alexey1201.workers.dev";
  assert.equal(resolveChatApiUrl({ hostname: new URL(origin).hostname, origin }), productionApi);
});

test("invalid location inputs are rejected", () => {
  assert.throws(() => resolveChatApiUrl(null), TypeError);
  assert.throws(() => resolveChatApiUrl({ hostname: "example.com" }), TypeError);
});
