import { verifyEvidenceIntegrityBatch } from "./evidence-integrity.mjs";

/**
 * Read-side decorator for a durable evidence adapter.
 * The underlying reader must return { record, envelope } entries from the same
 * consistent snapshot. No unverified record is exposed to callers.
 */
export function createIntegrityVerifiedEvidenceReader({
  readEntries,
  resolveKey
} = {}) {
  if (typeof readEntries !== "function" || typeof resolveKey !== "function") {
    throw new TypeError("INTEGRITY_EVIDENCE_READER_DEPENDENCIES_INVALID");
  }
  return {
    async listEvidence(taskId) {
      if (typeof taskId !== "string" || !taskId) {
        return { verified: false, reasonCode: "EVIDENCE_TASK_ID_INVALID" };
      }
      let entries;
      try {
        entries = await readEntries(taskId);
      } catch {
        return { verified: false, reasonCode: "PERSISTED_EVIDENCE_UNAVAILABLE" };
      }
      if (!Array.isArray(entries)) {
        return { verified: false, reasonCode: "PERSISTED_EVIDENCE_UNAVAILABLE" };
      }
      if (entries.length === 0) return { verified: true, records: [] };
      const result = await verifyEvidenceIntegrityBatch(entries, { resolveKey });
      if (!result.verified) return result;
      if (result.records.some(record => record.task_id !== taskId)) {
        return { verified: false, reasonCode: "EVIDENCE_INTEGRITY_BINDING_MISMATCH" };
      }
      return { verified: true, records: result.records };
    }
  };
}
