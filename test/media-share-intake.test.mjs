import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMediaShareIntake } from "../src/core/media-share-intake.mjs";

const SEND = "android.intent.action.SEND";
const MULTI = "android.intent.action.SEND_MULTIPLE";
const base = { action: MULTI, mimeType: "image/jpeg", readPermission: true };

test("accepts one image from ACTION_SEND", () => {
  const result = normalizeMediaShareIntake({ ...base, action: SEND, streams: ["content://gallery/1"] });
  assert.equal(result.ok, true);
  assert.equal(result.selection.itemCount, 1);
});

test("merges EXTRA_STREAM and ClipData, preserves order, and deduplicates", () => {
  const result = normalizeMediaShareIntake({
    ...base,
    streams: ["content://gallery/1", "content://gallery/2"],
    clipData: ["content://gallery/2", "content://gallery/3"]
  });
  assert.deepEqual(result.selection.items.map(item => item.uri), [
    "content://gallery/1", "content://gallery/2", "content://gallery/3"
  ]);
});

test("rejects unsupported actions", () => {
  assert.equal(normalizeMediaShareIntake({ ...base, action: "VIEW", streams: ["content://x/1"] }).error.code, "UNSUPPORTED_ACTION");
});

test("rejects missing Android read grant", () => {
  assert.equal(normalizeMediaShareIntake({ ...base, readPermission: false, streams: ["content://x/1"] }).error.code, "READ_GRANT_REQUIRED");
});

test("rejects non-image top-level MIME type", () => {
  assert.equal(normalizeMediaShareIntake({ ...base, mimeType: "video/mp4", streams: ["content://x/1"] }).error.code, "UNSUPPORTED_MIME");
});

test("rejects file and network paths", () => {
  const result = normalizeMediaShareIntake({ ...base, streams: ["file:///sdcard/a.jpg", "https://example/a.jpg"] });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "NO_VALID_IMAGES");
});

test("filters item-level non-image entries and reports partial intake", () => {
  const result = normalizeMediaShareIntake({
    ...base,
    streams: [
      { uri: "content://x/1", mimeType: "image/jpeg" },
      { uri: "content://x/2", mimeType: "video/mp4" }
    ]
  });
  assert.equal(result.selection.itemCount, 1);
  assert.equal(result.selection.rejectedCount, 1);
});

test("rejects multiple distinct items in ACTION_SEND", () => {
  const result = normalizeMediaShareIntake({ ...base, action: SEND, streams: ["content://x/1", "content://x/2"] });
  assert.equal(result.error.code, "ACTION_PAYLOAD_MISMATCH");
});

test("enforces maximum unique item count", () => {
  const result = normalizeMediaShareIntake({
    ...base, maxItems: 2,
    streams: ["content://x/1", "content://x/2", "content://x/3"]
  });
  assert.equal(result.error.code, "SELECTION_LIMIT_EXCEEDED");
});

test("does not imply gallery access or mutation permission", () => {
  const result = normalizeMediaShareIntake({ ...base, streams: ["content://x/1"] });
  assert.equal(result.selection.grantsWholeGalleryAccess, false);
  assert.equal(result.selection.permitsFileMutation, false);
  assert.equal(result.selection.requiresProviderReadValidation, true);
});
