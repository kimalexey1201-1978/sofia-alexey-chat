const SHA256 = /^[a-f0-9]{64}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isDate(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validateInventoryItem(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return "FILE_RECORD_REQUIRED";
  }
  if (!UUID.test(item.file_id ?? "") ||
      typeof item.provider_id !== "string" || !item.provider_id.trim() ||
      typeof item.original_filename !== "string" || !item.original_filename.trim() ||
      !Number.isSafeInteger(item.size_bytes) || item.size_bytes < 0 ||
      typeof item.content_hash_sha256 !== "string" || !SHA256.test(item.content_hash_sha256) ||
      typeof item.owner_principal_id !== "string" || !item.owner_principal_id.trim() ||
      !["public", "internal", "confidential", "restricted"].includes(item.data_classification) ||
      !["quarantined", "validating", "available", "processing", "partially_available", "blocked", "deletion_pending", "deleted"].includes(item.lifecycle_state) ||
      !isDate(item.created_at)) {
    return "FILE_RECORD_INVALID";
  }
  for (const field of ["access_control_ref", "consent_ref", "purpose", "retention_expires_at"]) {
    if (item[field] !== undefined && typeof item[field] !== "string") {
      return "FILE_RECORD_INVALID";
    }
  }
  if (item.retention_expires_at !== undefined && !isDate(item.retention_expires_at)) {
    return "FILE_RECORD_INVALID";
  }
  return null;
}

function sameGovernanceScope(a, b) {
  return a.owner_principal_id === b.owner_principal_id &&
    a.data_classification === b.data_classification &&
    (a.access_control_ref ?? null) === (b.access_control_ref ?? null) &&
    (a.consent_ref ?? null) === (b.consent_ref ?? null) &&
    (a.purpose ?? null) === (b.purpose ?? null) &&
    (a.retention_expires_at ?? null) === (b.retention_expires_at ?? null);
}

/**
 * Compare provider inventories using verified SHA-256 content hashes.
 * This module performs metadata-only reconciliation: it never reads,
 * downloads, moves, overwrites, or deletes file content.
 */
export function reconcileFileInventories(inventories) {
  if (!Array.isArray(inventories)) {
    return { ok: false, code: "INVENTORIES_REQUIRED" };
  }

  const items = [];
  const invalid = [];
  for (const inventory of inventories) {
    if (!inventory || typeof inventory.provider_id !== "string" ||
        !inventory.provider_id.trim() || !Array.isArray(inventory.items)) {
      return { ok: false, code: "INVENTORY_INVALID" };
    }
    for (const item of inventory.items) {
      const error = validateInventoryItem(item);
      if (error) {
        invalid.push({ provider_id: inventory.provider_id, file_id: item?.file_id ?? null, reason: error });
        continue;
      }
      if (item.provider_id !== inventory.provider_id) {
        invalid.push({ provider_id: inventory.provider_id, file_id: item.file_id, reason: "PROVIDER_SCOPE_MISMATCH" });
        continue;
      }
      if (item.lifecycle_state === "deleted") continue;
      items.push({ ...item, content_hash_sha256: item.content_hash_sha256.toLowerCase() });
    }
  }

  const byHash = new Map();
  for (const item of items) {
    const group = byHash.get(item.content_hash_sha256) ?? [];
    group.push(item);
    byHash.set(item.content_hash_sha256, group);
  }

  const exactDuplicates = [];
  const sameContentNotMergeable = [];
  for (const [hash, group] of byHash) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i], b = group[j];
        if (a.provider_id === b.provider_id && a.file_id === b.file_id) continue;
        const pair = {
          content_hash_sha256: hash,
          left: { provider_id: a.provider_id, file_id: a.file_id, filename: a.original_filename },
          right: { provider_id: b.provider_id, file_id: b.file_id, filename: b.original_filename }
        };
        if (a.size_bytes !== b.size_bytes) {
          sameContentNotMergeable.push({ ...pair, reason: "HASH_SIZE_CONFLICT" });
        } else if (sameGovernanceScope(a, b)) {
          exactDuplicates.push(pair);
        } else {
          sameContentNotMergeable.push({ ...pair, reason: "GOVERNANCE_SCOPE_MISMATCH" });
        }
      }
    }
  }

  return {
    ok: true,
    scanned_count: items.length,
    invalid,
    exact_duplicates: exactDuplicates,
    same_content_not_mergeable: sameContentNotMergeable
  };
}
