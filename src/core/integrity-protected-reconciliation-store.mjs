import { createIntegrityVerifiedEvidenceReader } from "./integrity-evidence-reader.mjs";

/**
 * Adapts a durable reconciliation store to the coordinator API.
 *
 * Required durable-store contract:
 * - listEvidenceEntries(taskId) returns {record,envelope} pairs from one snapshot.
 * - commitDecision atomically persists evidenceEntries with decision, task,
 *   and audit outbox changes, or persists none of them.
 * - raw evidenceRecords are never accepted by the durable adapter.
 */
export function createIntegrityProtectedReconciliationStore({
  store,
  sealEvidence,
  resolveKey
} = {}) {
  if (!store || typeof store.getTask !== "function" ||
      typeof store.acquireLease !== "function" ||
      typeof store.commitDecision !== "function" ||
      typeof store.listEvidenceEntries !== "function" ||
      typeof store.releaseLease !== "function" ||
      typeof sealEvidence !== "function" || typeof resolveKey !== "function") {
    throw new TypeError("INTEGRITY_PROTECTED_STORE_CONTRACT_INVALID");
  }

  const reader = createIntegrityVerifiedEvidenceReader({
    readEntries: taskId => store.listEvidenceEntries(taskId),
    resolveKey
  });

  return {
    getTask: (...args) => store.getTask(...args),
    acquireLease: (...args) => store.acquireLease(...args),
    releaseLease: (...args) => store.releaseLease(...args),

    async listEvidence(taskId) {
      const result = await reader.listEvidence(taskId);
      if (!result.verified) {
        const error = new Error(result.reasonCode || "PERSISTED_EVIDENCE_UNVERIFIED");
        error.code = result.reasonCode || "PERSISTED_EVIDENCE_UNVERIFIED";
        throw error;
      }
      return result.records;
    },

    async commitDecision(input) {
      if (!input || typeof input.taskId !== "string" ||
          !Array.isArray(input.evidenceRecords) || input.evidenceRecords.length === 0 ||
          input.evidenceRecords.some(record => record?.task_id !== input.taskId)) {
        return { committed: false, reasonCode: "EVIDENCE_APPEND_INPUT_INVALID" };
      }

      let evidenceEntries;
      try {
        evidenceEntries = await Promise.all(input.evidenceRecords.map(async record => ({
          record: structuredClone(record),
          envelope: await sealEvidence(record)
        })));
      } catch {
        return { committed: false, reasonCode: "EVIDENCE_INTEGRITY_SEAL_FAILED" };
      }

      if (evidenceEntries.some(entry => !entry.envelope ||
          entry.envelope.binding?.task_id !== input.taskId)) {
        return { committed: false, reasonCode: "EVIDENCE_INTEGRITY_SEAL_FAILED" };
      }

      const { evidenceRecords, ...decisionInput } = input;
      try {
        return await store.commitDecision({
          ...decisionInput,
          evidenceEntries
        });
      } catch {
        return { committed: false, reasonCode: "ATOMIC_INTEGRITY_COMMIT_FAILED" };
      }
    }
  };
}
