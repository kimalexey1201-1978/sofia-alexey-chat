const CONCLUSIONS = new Set([
  "CONFIRMED_APPLIED",
  "CONFIRMED_NOT_APPLIED",
  "STILL_UNKNOWN"
]);

/**
 * Pure decision function for reconciliation evidence already authenticated by
 * a trusted provider adapter. It does not query providers or verify signatures.
 * Missing, stale, untrusted or mismatched evidence keeps the task uncertain.
 */
export function evaluateReconciliation(input, now = new Date()) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { resolved: false, taskState: "outcome_uncertain",
      conclusion: "STILL_UNKNOWN", reasonCode: "INVALID_RECONCILIATION_INPUT" };
  }
  const { task, priorRequest, evidence, freshnessWindowMs = 300000 } = input;
  const unknown = reasonCode => ({ resolved: false, taskState: "outcome_uncertain",
    conclusion: "STILL_UNKNOWN", reasonCode });

  if (!task || !priorRequest || !evidence) return unknown("RECONCILIATION_EVIDENCE_MISSING");
  if (task.state !== "outcome_uncertain") return unknown("TASK_NOT_OUTCOME_UNCERTAIN");
  if (!CONCLUSIONS.has(evidence.conclusion)) return unknown("INVALID_PROVIDER_CONCLUSION");
  if (evidence.verification?.status !== "VERIFIED" ||
      !evidence.verification?.verifier_ref ||
      !evidence.verification?.verified_at) {
    return unknown("PROVIDER_EVIDENCE_NOT_VERIFIED");
  }
  if (!Number.isFinite(freshnessWindowMs) || freshnessWindowMs <= 0) {
    return unknown("INVALID_FRESHNESS_POLICY");
  }

  const observedAt = Date.parse(evidence.observed_at ?? "");
  const verifiedAt = Date.parse(evidence.verification.verified_at ?? "");
  const age = now.getTime() - observedAt;
  if (!Number.isFinite(observedAt) || !Number.isFinite(verifiedAt) ||
      observedAt > now.getTime() || verifiedAt > now.getTime() ||
      age > freshnessWindowMs) {
    return unknown("PROVIDER_EVIDENCE_STALE_OR_INVALID");
  }

  const expected = {
    task_id: task.task_id,
    request_id: priorRequest.request_id,
    provider_id: priorRequest.provider_id,
    provider_operation_ref: priorRequest.provider_operation_ref,
    target_ref: priorRequest.target_ref,
    operation_digest: priorRequest.operation_digest,
    idempotency_key_digest: priorRequest.idempotency_key_digest
  };
  for (const [field, value] of Object.entries(expected)) {
    if (typeof value !== "string" || value.length === 0 ||
        evidence[field] !== value) {
      return unknown("RECONCILIATION_BINDING_MISMATCH");
    }
  }
  if (typeof evidence.evidence_digest !== "string" ||
      !/^[a-fA-F0-9]{64}$/.test(evidence.evidence_digest)) {
    return unknown("EVIDENCE_DIGEST_INVALID");
  }

  if (evidence.conclusion === "STILL_UNKNOWN") {
    return { resolved: false, taskState: "outcome_uncertain",
      conclusion: "STILL_UNKNOWN", reasonCode: "PROVIDER_STATE_STILL_UNKNOWN",
      reconciliationRef: evidence.evidence_ref ?? null };
  }
  if (!evidence.evidence_ref || typeof evidence.evidence_ref !== "string") {
    return unknown("AUTHORITATIVE_EVIDENCE_REFERENCE_REQUIRED");
  }

  return {
    resolved: true,
    taskState: evidence.conclusion === "CONFIRMED_APPLIED" ? "completed" : "failed",
    conclusion: evidence.conclusion,
    reasonCode: evidence.conclusion,
    reconciliationRef: evidence.evidence_ref,
    retryMayBeConsidered: evidence.conclusion === "CONFIRMED_NOT_APPLIED"
  };
}
