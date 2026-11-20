import { createEvidenceIntegrityEnvelope } from "./evidence-integrity.mjs";
import { createIntegrityVerifiedEvidenceReader } from "./integrity-evidence-reader.mjs";

/**
 * Integrity boundary for a storage adapter.
 * appendEntries MUST persist the complete entry batch atomically.
 */
export function createIntegrityProtectedEvidencePort({
  appendEntries,
  readEntries,
  resolveKey,
  sealEvidence
} = {}) {
  if (typeof appendEntries !== "function" ||
      typeof readEntries !== "function" ||
      typeof resolveKey !== "function" ||
      typeof sealEvidence !== "function") {
    throw new TypeError("INTEGRITY_EVIDENCE_PORT_DEPENDENCIES_INVALID");
  }

  const reader = createIntegrityVerifiedEvidenceReader({ readEntries, resolveKey });

  return {
    async appendEvidence(taskId, records) {
      if (typeof taskId !== "string" || !taskId ||
          !Array.isArray(records) || records.length === 0 ||
          records.some(record => !record || record.task_id !== taskId)) {
        return { appended: false, reasonCode: "EVIDENCE_APPEND_INPUT_INVALID" };
      }

      let entries;
      try {
        entries = await Promise.all(records.map(async record => ({
          record: structuredClone(record),
          envelope: await sealEvidence(record)
        })));
      } catch {
        return { appended: false, reasonCode: "EVIDENCE_INTEGRITY_SEAL_FAILED" };
      }

      if (entries.some(entry => !entry.envelope ||
          entry.envelope.binding?.task_id !== taskId)) {
        return { appended: false, reasonCode: "EVIDENCE_INTEGRITY_SEAL_FAILED" };
      }

      try {
        const result = await appendEntries(taskId, entries);
        if (result?.appended !== true) {
          return { appended: false, reasonCode: result?.reasonCode ??
            "EVIDENCE_ATOMIC_APPEND_FAILED" };
        }
        return { appended: true, count: entries.length };
      } catch {
        return { appended: false, reasonCode: "EVIDENCE_ATOMIC_APPEND_FAILED" };
      }
    },

    async listEvidence(taskId) {
      return reader.listEvidence(taskId);
    }
  };
}

export function createHmacEvidenceSealer({ key, keyId, acceptedAt } = {}) {
  return record => createEvidenceIntegrityEnvelope(record, {
    key, keyId, acceptedAt: typeof acceptedAt === "function" ? acceptedAt() : acceptedAt
  });
}
