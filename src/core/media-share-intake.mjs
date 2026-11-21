const ACTION_SEND = "android.intent.action.SEND";
const ACTION_SEND_MULTIPLE = "android.intent.action.SEND_MULTIPLE";
const DEFAULT_MAX_ITEMS = 100;

function isImageMime(value) {
  return typeof value === "string" && /^image\/[a-z0-9.+-]+$/i.test(value.trim());
}

function normalizeUri(value) {
  if (typeof value !== "string") return null;
  const uri = value.trim();
  if (!uri || uri.length > 4096) return null;
  try {
    const parsed = new URL(uri);
    return parsed.protocol === "content:" ? uri : null;
  } catch {
    return null;
  }
}

/**
 * Normalize the bounded image selection delivered by Android Sharesheet.
 * This validates the envelope only: it does not read provider data, grant
 * permissions, scan MediaStore, or authorize copy/move operations.
 *
 * @param {{action:string,mimeType:string,streams?:Array<string|{uri:string,mimeType?:string}>,clipData?:Array<string|{uri:string,mimeType?:string}>,readPermission:boolean,maxItems?:number}} input
 */
export function normalizeMediaShareIntake(input) {
  const fail = (code, message) => ({ ok: false, error: { code, message } });
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return fail("INVALID_ENVELOPE", "Share payload must be an object");
  }
  const { action, mimeType, readPermission } = input;
  if (action !== ACTION_SEND && action !== ACTION_SEND_MULTIPLE) {
    return fail("UNSUPPORTED_ACTION", "Only single- and multiple-image shares are supported");
  }
  if (!isImageMime(mimeType)) {
    return fail("UNSUPPORTED_MIME", "The shared content must have an image MIME type");
  }
  if (readPermission !== true) {
    return fail("READ_GRANT_REQUIRED", "Android did not provide a read grant for the shared content");
  }
  const maxItems = input.maxItems === undefined ? DEFAULT_MAX_ITEMS : input.maxItems;
  if (!Number.isSafeInteger(maxItems) || maxItems < 1 || maxItems > 500) {
    return fail("INVALID_LIMIT", "The configured item limit is invalid");
  }

  const streams = Array.isArray(input.streams) ? input.streams : [];
  const clipData = Array.isArray(input.clipData) ? input.clipData : [];
  const candidates = [...streams, ...clipData];
  if (candidates.length === 0) {
    return fail("EMPTY_SELECTION", "No shared image URI was provided");
  }
  if (action === ACTION_SEND && candidates.length > 1) {
    const distinct = new Set(candidates.map(item =>
      typeof item === "string" ? item : item?.uri
    ));
    if (distinct.size > 1) {
      return fail("ACTION_PAYLOAD_MISMATCH", "A single-image share contained multiple distinct items");
    }
  }

  const accepted = [];
  const rejected = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const rawUri = typeof candidate === "string" ? candidate : candidate?.uri;
    const uri = normalizeUri(rawUri);
    const itemMime = typeof candidate === "object" && candidate !== null && candidate.mimeType
      ? candidate.mimeType : mimeType;
    if (!uri || !isImageMime(itemMime)) {
      rejected.push({ reason: !uri ? "INVALID_CONTENT_URI" : "NON_IMAGE_ITEM" });
      continue;
    }
    if (seen.has(uri)) continue;
    seen.add(uri);
    if (accepted.length >= maxItems) {
      return fail("SELECTION_LIMIT_EXCEEDED", `The share contains more than ${maxItems} unique items`);
    }
    accepted.push({ uri, mimeType: itemMime.trim().toLowerCase() });
  }
  if (accepted.length === 0) {
    return fail("NO_VALID_IMAGES", "The share did not contain any valid image URIs");
  }
  return {
    ok: true,
    selection: {
      action,
      items: accepted,
      itemCount: accepted.length,
      rejectedCount: rejected.length,
      intakeScope: "explicitly_shared_selection",
      requiresProviderReadValidation: true,
      grantsWholeGalleryAccess: false,
      permitsFileMutation: false
    }
  };
}
