const IMAGE_MIME = /^image\//i;
const VIDEO_MIME = /^video\//i;

const SCREENSHOT_PATH = /(?:^|[\\/])(?:screenshots?|screen_shots?)(?:[\\/]|$)/i;
const SCREENSHOT_NAME = /^(?:screenshot|screen_shot|스크린샷|截屏|截图|capture)(?:[ _-]|\d|\.)/i;
const CAMERA_PATH = /(?:^|[\\/])(?:dcim[\\/]camera|camera|카메라)(?:[\\/]|$)/i;

function normalizedText(value) {
  return typeof value === "string" ? value.replace(/\\/g, "/").trim() : "";
}

/**
 * Classifies still images only. Video files are deliberately excluded.
 * Screenshot detection uses Android MediaStore metadata and is explainable;
 * semantic document recognition is a separate, not-yet-implemented stage.
 */
export function classifyMediaItem(item) {
  if (!item || typeof item !== "object" || Array.isArray(item) ||
      typeof item.mime_type !== "string") {
    return { ok: false, code: "MEDIA_ITEM_INVALID" };
  }
  if (VIDEO_MIME.test(item.mime_type)) {
    return { ok: true, applicable: false, media_kind: "video", category: null, method: "not_applicable" };
  }
  if (!IMAGE_MIME.test(item.mime_type)) {
    return { ok: true, applicable: false, media_kind: "other", category: null, method: "not_applicable" };
  }

  const path = normalizedText(item.relative_path);
  const name = normalizedText(item.display_name);
  const bucket = normalizedText(item.bucket_display_name);
  const screenshot = SCREENSHOT_PATH.test(path) ||
    SCREENSHOT_NAME.test(name) ||
    /^screenshots?$/i.test(bucket);

  if (screenshot) {
    return {
      ok: true, applicable: true, media_kind: "image",
      category: "screenshot", method: "android_media_metadata",
      confidence: "high"
    };
  }

  if (CAMERA_PATH.test(path) || /^camera$/i.test(bucket)) {
    return {
      ok: true, applicable: true, media_kind: "image",
      category: "photo", method: "android_media_metadata",
      confidence: "medium"
    };
  }

  return {
    ok: true, applicable: true, media_kind: "image",
    category: "unclassified_image", method: "requires_content_analysis",
    confidence: "none"
  };
}

/**
 * Converts a natural-language file request into a typed search target.
 * This resolves intent only; it does not search private files or display them.
 */
export function resolveMediaSearchIntent(text) {
  if (typeof text !== "string" || !text.trim()) {
    return { ok: false, code: "SEARCH_QUERY_REQUIRED" };
  }
  const query = text.toLocaleLowerCase();
  const identityTerms = /(?:удостоверени[ея]\s+личност[и]|удостоверени[ея]\s+личности|личн(?:ое|ого)\s+удостоверени[ея]|паспорт|id\s*card|identity\s+card|passport)/i;
  const screenshotTerms = /(?:скриншот|скриншоты|screenshot|screenshots)/i;
  const photoTerms = /(?:фотографи[яию]|фото|снимок|снимки|photo|picture)/i;

  if (identityTerms.test(query)) {
    return {
      ok: true, target: "personal_identity_document",
      media_kind: "image", requires_content_analysis: true,
      sensitive: true, display_requires_user_request: true
    };
  }
  if (screenshotTerms.test(query)) {
    return { ok: true, target: "screenshot", media_kind: "image", requires_content_analysis: false };
  }
  if (photoTerms.test(query)) {
    return { ok: true, target: "photo", media_kind: "image", requires_content_analysis: true };
  }
  return { ok: true, target: "image", media_kind: "image", requires_content_analysis: true };
}
