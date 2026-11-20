const encoder = new TextEncoder();

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map(key =>
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  if (typeof hex !== "string" || !/^(?:[a-f0-9]{2})+$/i.test(hex)) return null;
  return new Uint8Array(hex.match(/.{2}/g).map(pair => Number.parseInt(pair, 16)));
}

function requiredBinding(record) {
  const fields = ["task_id", "request_id", "provider_id", "schema_version", "evidence_digest"];
  const binding = {};
  for (const field of fields) {
    if (typeof record?.[field] !== "string" || !record[field]) {
      throw new TypeError("EVIDENCE_INTEGRITY_BINDING_INVALID");
    }
    binding[field] = record[field];
  }
  if (!/^[a-f0-9]{64}$/i.test(binding.evidence_digest)) {
    throw new TypeError("EVIDENCE_INTEGRITY_BINDING_INVALID");
  }
  return binding;
}

async function sha256(value) {
  return bytesToHex(await globalThis.crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

function envelopePayload(envelope) {
  return canonicalJson({
    version: envelope.version,
    algorithm: envelope.algorithm,
    key_id: envelope.key_id,
    accepted_at: envelope.accepted_at,
    record_digest: envelope.record_digest,
    binding: envelope.binding
  });
}

/**
 * Create an authenticated storage-integrity envelope.
 * The HMAC CryptoKey must be supplied by a trusted key-management boundary;
 * raw key material is deliberately not accepted or persisted here.
 */
export async function createEvidenceIntegrityEnvelope(record, { key, keyId, acceptedAt } = {}) {
  if (!key || typeof keyId !== "string" || !keyId ||
      typeof acceptedAt !== "string" || !Number.isFinite(Date.parse(acceptedAt))) {
    throw new TypeError("EVIDENCE_INTEGRITY_CONFIGURATION_INVALID");
  }
  const binding = requiredBinding(record);
  const envelope = {
    version: "1.0.0",
    algorithm: "HMAC-SHA-256",
    key_id: keyId,
    accepted_at: acceptedAt,
    record_digest: await sha256(canonicalJson(record)),
    binding
  };
  try {
    envelope.mac = bytesToHex(await globalThis.crypto.subtle.sign(
      "HMAC", key, encoder.encode(envelopePayload(envelope))));
  } catch {
    throw new TypeError("EVIDENCE_INTEGRITY_KEY_INVALID");
  }
  return envelope;
}

/**
 * Verify a stored record against its authenticated envelope and externally
 * resolved key. Returns false for any malformed, altered, or untrusted input.
 */
export async function verifyEvidenceIntegrityEnvelope(record, envelope, { key, keyId } = {}) {
  try {
    if (!record || !envelope || !key || typeof keyId !== "string" ||
        envelope.version !== "1.0.0" ||
        envelope.algorithm !== "HMAC-SHA-256" ||
        envelope.key_id !== keyId ||
        typeof envelope.accepted_at !== "string" ||
        !Number.isFinite(Date.parse(envelope.accepted_at)) ||
        !/^[a-f0-9]{64}$/i.test(envelope.record_digest ?? "")) return false;
    const binding = requiredBinding(record);
    if (canonicalJson(binding) !== canonicalJson(envelope.binding) ||
        await sha256(canonicalJson(record)) !== envelope.record_digest.toLowerCase()) return false;
    const mac = hexToBytes(envelope.mac);
    if (!mac) return false;
    return await globalThis.crypto.subtle.verify(
      "HMAC", key, mac, encoder.encode(envelopePayload(envelope)));
  } catch {
    return false;
  }
}

/**
 * Verify an entire historical evidence batch before it crosses the storage
 * trust boundary. Key resolution is delegated to a trusted external provider.
 * Returns a detached copy only when every record has a valid envelope.
 */
export async function verifyEvidenceIntegrityBatch(entries, { resolveKey } = {}) {
  if (!Array.isArray(entries) || entries.length === 0 ||
      typeof resolveKey !== "function") {
    return { verified: false, reasonCode: "EVIDENCE_INTEGRITY_BATCH_INVALID" };
  }
  const verifiedRecords = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || !entry.record || !entry.envelope ||
        typeof entry.envelope.key_id !== "string" || !entry.envelope.key_id) {
      return { verified: false, reasonCode: "EVIDENCE_INTEGRITY_ENVELOPE_MISSING" };
    }
    let key;
    try {
      key = await resolveKey(entry.envelope.key_id);
    } catch {
      return { verified: false, reasonCode: "EVIDENCE_INTEGRITY_KEY_UNAVAILABLE" };
    }
    if (!key) {
      return { verified: false, reasonCode: "EVIDENCE_INTEGRITY_KEY_UNAVAILABLE" };
    }
    const valid = await verifyEvidenceIntegrityEnvelope(entry.record, entry.envelope, {
      key, keyId: entry.envelope.key_id
    });
    if (!valid) {
      return { verified: false, reasonCode: "EVIDENCE_INTEGRITY_VERIFICATION_FAILED" };
    }
    verifiedRecords.push(structuredClone(entry.record));
  }
  return { verified: true, records: verifiedRecords };
}
