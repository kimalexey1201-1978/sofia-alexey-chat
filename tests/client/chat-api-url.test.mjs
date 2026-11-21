import test from "node:test";
import assert from "node:assert/strict";
import { resolveChatApiUrl } from "../../src/client/chat-api-url.mjs";

test("routes GitHub Pages to the production Worker API", () => {
  assert.equal(
    resolveChatApiUrl({
      hostname: "kimalexey1201-1978.github.io",
      origin: "https://kimalexey1201-1978.github.io"
    }),
    "https://sofia.kim-alexey1201.workers.dev/api/chat"
  );
});

test("routes a Cloudflare Preview page to its same-origin Preview API", () => {
  const origin = "https://core-v0-1-admission-approval-guard-sofia.kim-alexey1201.workers.dev";
  assert.equal(
    resolveChatApiUrl({ hostname: new URL(origin).hostname, origin }),
    origin + "/api/chat"
  );
});

test("routes the Production Worker page to its same-origin Production API", () => {
  const origin = "https://sofia.kim-alexey1201.workers.dev";
  assert.equal(
    resolveChatApiUrl({ hostname: new URL(origin).hostname, origin }),
    origin + "/api/chat"
  );
});

test("rejects incomplete location input", () => {
  assert.throws(() => resolveChatApiUrl({ hostname: "example.com" }), TypeError);
});
