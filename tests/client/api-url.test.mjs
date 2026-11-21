import test from "node:test";
import assert from "node:assert/strict";
import { resolveApiUrl } from "../../src/client/api-url.mjs";

const pages = { hostname: "kimalexey1201-1978.github.io", origin: "https://kimalexey1201-1978.github.io" };
const previewOrigin = "https://fix-storage-api-origin-routing-20261121.sofia.kim-alexey1201.workers.dev";

test("GitHub Pages routes all supported API paths to Production Worker", () => {
  for (const path of ["/api/session", "/api/chat", "/api/analyze-image"]) {
    assert.equal(resolveApiUrl(path, pages), "https://sofia.kim-alexey1201.workers.dev" + path);
  }
});
test("Cloudflare Preview routes API calls to its own origin", () => {
  const locationLike = { hostname: new URL(previewOrigin).hostname, origin: previewOrigin };
  assert.equal(resolveApiUrl("/api/session", locationLike), previewOrigin + "/api/session");
  assert.equal(resolveApiUrl("/api/chat", locationLike), previewOrigin + "/api/chat");
  assert.equal(resolveApiUrl("/api/analyze-image", locationLike), previewOrigin + "/api/analyze-image");
});
test("Production Worker page uses same-origin API", () => {
  const origin = "https://sofia.kim-alexey1201.workers.dev";
  assert.equal(resolveApiUrl("/api/chat", { hostname: new URL(origin).hostname, origin }), origin + "/api/chat");
});
test("rejects unsupported API paths and invalid locations", () => {
  assert.throws(() => resolveApiUrl("https://evil.example/api/chat", pages), TypeError);
  assert.throws(() => resolveApiUrl("/api/chat/../secret", pages), TypeError);
  assert.throws(() => resolveApiUrl("/api/chat", null), TypeError);
});
