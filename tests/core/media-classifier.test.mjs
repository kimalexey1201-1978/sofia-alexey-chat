import test from "node:test";
import assert from "node:assert/strict";
import { classifyMediaItem, resolveMediaSearchIntent } from "../../src/core/media-classifier.mjs";

test("classifies Android screenshot folders as screenshots", () => {
  const result = classifyMediaItem({
    mime_type: "image/png", display_name: "IMG_1234.png",
    relative_path: "Pictures/Screenshots/"
  });
  assert.equal(result.category, "screenshot");
  assert.equal(result.confidence, "high");
});

test("classifies conventional screenshot filenames", () => {
  const result = classifyMediaItem({
    mime_type: "image/png", display_name: "Screenshot_20261121-120000.png"
  });
  assert.equal(result.category, "screenshot");
});

test("classifies camera-folder images as photos with medium confidence", () => {
  const result = classifyMediaItem({
    mime_type: "image/jpeg", display_name: "IMG_1001.jpg",
    relative_path: "DCIM/Camera/"
  });
  assert.equal(result.category, "photo");
  assert.equal(result.confidence, "medium");
});

test("does not apply screenshot/photo classification to videos", () => {
  const result = classifyMediaItem({
    mime_type: "video/mp4", display_name: "Screenshot_video.mp4",
    relative_path: "Pictures/Screenshots/"
  });
  assert.equal(result.applicable, false);
  assert.equal(result.media_kind, "video");
  assert.equal(result.category, null);
});

test("does not guess photo category when metadata is inconclusive", () => {
  const result = classifyMediaItem({
    mime_type: "image/jpeg", display_name: "image_01.jpg",
    relative_path: "Download/"
  });
  assert.equal(result.category, "unclassified_image");
  assert.equal(result.method, "requires_content_analysis");
});

test("resolves a personal identity document request to sensitive image search", () => {
  const result = resolveMediaSearchIntent("София, выведи фотографию удостоверения моей личности");
  assert.equal(result.target, "personal_identity_document");
  assert.equal(result.media_kind, "image");
  assert.equal(result.sensitive, true);
  assert.equal(result.requires_content_analysis, true);
});

test("resolves screenshot requests separately from photos", () => {
  assert.equal(resolveMediaSearchIntent("Найди мои скриншоты").target, "screenshot");
  assert.equal(resolveMediaSearchIntent("Покажи фотографии").target, "photo");
});

test("rejects empty search intent and malformed media metadata", () => {
  assert.equal(resolveMediaSearchIntent(" ").ok, false);
  assert.equal(classifyMediaItem({ display_name: "x" }).ok, false);
});
