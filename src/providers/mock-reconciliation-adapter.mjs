/**
 * Read-only, deterministic reconciliation fixture adapter.
 *
 * Test-only: returns preloaded evidence records and performs no network I/O,
 * provider authentication, persistence, or external side effects. It must
 * never be registered as a production provider adapter.
 *
 * @param {{providerId?:string, evidenceByOperation?:Record<string, unknown[]>}} config
 */
export function createMockReconciliationAdapter(config = {}) {
  const providerId = config.providerId || "mock-reconciliation";
  const evidenceByOperation = config.evidenceByOperation || {};
  const calls = [];

  return {
    providerId,
    calls,
    async queryOperationStatus(request) {
      if (!request || typeof request !== "object" || Array.isArray(request) ||
          typeof request.provider_id !== "string" || request.provider_id.length === 0 ||
          typeof request.provider_operation_ref !== "string" ||
          request.provider_operation_ref.length === 0) {
        throw new TypeError("Invalid mock reconciliation request");
      }
      if (request.provider_id !== providerId) {
        throw new Error("Mock reconciliation provider identity mismatch");
      }

      calls.push({
        providerId,
        providerOperationRef: request.provider_operation_ref
      });

      const records = evidenceByOperation[request.provider_operation_ref] ?? [];
      if (!Array.isArray(records)) {
        throw new TypeError("Mock evidence records must be an array");
      }

      return {
        provider_id: providerId,
        provider_operation_ref: request.provider_operation_ref,
        evidence_records: records.map(record => structuredClone(record))
      };
    }
  };
}
