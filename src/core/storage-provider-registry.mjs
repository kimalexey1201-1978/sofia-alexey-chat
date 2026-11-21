const PROVIDER_TYPES = new Set([
  "android_media_store", "android_saf", "google_drive",
  "cloud_object_storage", "network_share", "removable_storage", "other"
]);
const STATUSES = new Set([
  "discovered", "connecting", "connected", "degraded",
  "disconnected", "revoked", "error"
]);
const AUTH_STATES = new Set([
  "not_requested", "pending", "authorized", "expired", "revoked", "denied"
]);
const CAPABILITIES = new Set([
  "list", "read", "write", "create_container", "delete", "trash",
  "checksum", "resumable_upload", "resumable_download", "quota", "restore"
]);
const ALLOWED_FIELDS = new Set([
  "provider_id", "provider_type", "display_name", "status",
  "authorization_state", "account_ref", "capabilities", "quota_bytes",
  "used_bytes", "available_bytes", "provider_metadata",
  "last_verified_at", "created_at", "updated_at"
]);

function clone(value) {
  return structuredClone(value);
}

function validDate(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

/**
 * Validate provider metadata before it enters the runtime registry.
 * Credentials, tokens, endpoints and arbitrary permission grants are not
 * accepted as provider metadata.
 */
export function validateStorageProvider(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return { ok: false, code: "PROVIDER_RECORD_REQUIRED" };
  }
  if (Object.keys(record).some(key => !ALLOWED_FIELDS.has(key))) {
    return { ok: false, code: "PROVIDER_FIELD_NOT_ALLOWED" };
  }
  if (typeof record.provider_id !== "string" ||
      record.provider_id.length < 8 || record.provider_id.length > 160 ||
      !PROVIDER_TYPES.has(record.provider_type) ||
      typeof record.display_name !== "string" ||
      !record.display_name.trim() || record.display_name.length > 160 ||
      !STATUSES.has(record.status) || !AUTH_STATES.has(record.authorization_state) ||
      !Array.isArray(record.capabilities) || record.capabilities.length === 0 ||
      new Set(record.capabilities).size !== record.capabilities.length ||
      !record.capabilities.every(item => CAPABILITIES.has(item)) ||
      !validDate(record.created_at)) {
    return { ok: false, code: "PROVIDER_RECORD_INVALID" };
  }
  if (record.status === "connected" && record.authorization_state !== "authorized") {
    return { ok: false, code: "CONNECTED_PROVIDER_REQUIRES_AUTHORIZATION" };
  }
  for (const field of ["quota_bytes", "used_bytes", "available_bytes"]) {
    if (record[field] !== undefined &&
        (!Number.isSafeInteger(record[field]) || record[field] < 0)) {
      return { ok: false, code: "PROVIDER_QUOTA_INVALID" };
    }
  }
  if (record.quota_bytes !== undefined && record.used_bytes !== undefined &&
      record.used_bytes > record.quota_bytes) {
    return { ok: false, code: "PROVIDER_USAGE_EXCEEDS_QUOTA" };
  }
  if (record.available_bytes !== undefined && record.quota_bytes !== undefined &&
      record.used_bytes !== undefined &&
      record.available_bytes !== record.quota_bytes - record.used_bytes) {
    return { ok: false, code: "PROVIDER_AVAILABLE_SPACE_MISMATCH" };
  }
  if (record.provider_metadata !== undefined &&
      (!record.provider_metadata || typeof record.provider_metadata !== "object" ||
       Array.isArray(record.provider_metadata) ||
       Object.keys(record.provider_metadata).length > 32)) {
    return { ok: false, code: "PROVIDER_METADATA_INVALID" };
  }
  for (const field of ["last_verified_at", "updated_at"]) {
    if (record[field] !== undefined && !validDate(record[field])) {
      return { ok: false, code: "PROVIDER_TIMESTAMP_INVALID" };
    }
  }
  return { ok: true, record };
}

/**
 * Creates an isolated in-memory provider registry. This is a runtime
 * foundation only: persistence, credentials and provider API calls are
 * deliberately outside this module.
 */
export function createStorageProviderRegistry() {
  const providers = new Map();

  return Object.freeze({
    register(record) {
      const checked = validateStorageProvider(record);
      if (!checked.ok) return checked;
      if (providers.has(record.provider_id)) {
        return { ok: false, code: "PROVIDER_ALREADY_REGISTERED" };
      }
      providers.set(record.provider_id, clone(record));
      return { ok: true, provider: clone(record) };
    },

    get(providerId) {
      const record = providers.get(providerId);
      return record ? { ok: true, provider: clone(record) } :
        { ok: false, code: "PROVIDER_NOT_FOUND" };
    },

    list() {
      return [...providers.values()]
        .map(clone)
        .sort((a, b) => a.provider_id.localeCompare(b.provider_id));
    },

    resolveOperation(providerId, operation) {
      const record = providers.get(providerId);
      if (!record) return { allowed: false, reasonCode: "PROVIDER_NOT_FOUND" };
      if (record.status !== "connected" ||
          record.authorization_state !== "authorized") {
        return { allowed: false, reasonCode: "PROVIDER_NOT_CONNECTED_OR_AUTHORIZED" };
      }
      if (typeof operation !== "string" || !CAPABILITIES.has(operation)) {
        return { allowed: false, reasonCode: "UNSUPPORTED_PROVIDER_OPERATION" };
      }
      if (!record.capabilities.includes(operation)) {
        return { allowed: false, reasonCode: "PROVIDER_CAPABILITY_NOT_GRANTED" };
      }
      return { allowed: true, provider: clone(record), operation };
    }
  });
}
