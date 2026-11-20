const RISK = Object.freeze({ R0: 0, R1: 1, R2: 2, R3: 3 });

const TASK_TRANSITIONS = Object.freeze({
  created: ["admitted", "failed", "cancelled", "expired"],
  admitted: ["running", "failed", "cancelled", "expired"],
  running: ["paused", "checkpointed", "completed", "failed", "cancelled", "expired", "outcome_uncertain"],
  paused: ["resuming", "cancelled", "expired"],
  checkpointed: ["resuming", "cancelled", "expired"],
  resuming: ["running", "failed", "cancelled", "expired", "outcome_uncertain"],
  outcome_uncertain: ["completed", "failed"],
  completed: [],
  failed: [],
  cancelled: [],
  expired: []
});

function validTime(value, now) {
  const timestamp = Date.parse(value ?? "");
  return Number.isFinite(timestamp) && timestamp > now.getTime();
}

/**
 * Pure transition guard. Leaving outcome_uncertain requires verified,
 * authoritative reconciliation; it never transitions directly back to execution.
 */
export function evaluateRuntimeTaskTransition(input) {
  if (!input || typeof input !== "object") {
    return { allowed: false, reasonCode: "INVALID_TRANSITION_INPUT" };
  }
  const { from, to, reconciliationVerified = false } = input;
  if (!Object.hasOwn(TASK_TRANSITIONS, from) || !TASK_TRANSITIONS[from].includes(to)) {
    return { allowed: false, reasonCode: "TRANSITION_NOT_ALLOWED" };
  }
  if (from === "outcome_uncertain" && reconciliationVerified !== true) {
    return { allowed: false, reasonCode: "AUTHORITATIVE_RECONCILIATION_REQUIRED" };
  }
  return { allowed: true, reasonCode: null };
}

/**
 * A retry is permitted only after the prior external outcome is known not
 * to have been applied, or the capability contract explicitly declares the
 * exact operation naturally idempotent. Unknown outcomes are never retried.
 */
export function evaluateExecutionRetry(input) {
  if (!input || typeof input !== "object") {
    return { allowed: false, reasonCode: "INVALID_RETRY_INPUT" };
  }
  const {
    priorState, providerOutcome, idempotencyKey, retryIdempotencyKey,
    sameCanonicalOperation, naturallyIdempotent
  } = input;
  if (priorState === "outcome_uncertain" || providerOutcome === "UNKNOWN") {
    return { allowed: false, reasonCode: "OUTCOME_RECONCILIATION_REQUIRED" };
  }
  if (providerOutcome === "CONFIRMED_APPLIED") {
    return { allowed: false, reasonCode: "PRIOR_SIDE_EFFECT_ALREADY_APPLIED" };
  }
  if (providerOutcome !== "CONFIRMED_NOT_APPLIED" &&
      naturallyIdempotent !== true) {
    return { allowed: false, reasonCode: "RETRY_SAFETY_NOT_ESTABLISHED" };
  }
  if (typeof idempotencyKey !== "string" || idempotencyKey.length < 8 ||
      retryIdempotencyKey !== idempotencyKey || sameCanonicalOperation !== true) {
    return { allowed: false, reasonCode: "RETRY_BINDING_MISMATCH" };
  }
  if (!["failed", "cancelled", "expired"].includes(priorState)) {
    return { allowed: false, reasonCode: "PRIOR_TASK_NOT_RETRYABLE" };
  }
  return { allowed: true, reasonCode: null };
}

/**
 * Fail-closed, side-effect-free admission check for the future Execution Supervisor.
 * Inputs must be resolved from trusted internal stores; this function does not
 * authenticate their provenance, grant authority, reserve resources, or invoke code.
 */
export function evaluateExecutionAdmission(input, now = new Date()) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { admitted: false, reasonCodes: ["INVALID_ADMISSION_INPUT"] };
  }
  const { request, module, trust, grant, authority, securityDecision, reservation, resourcePolicy } = input;
  const reasons = [];

  if (!request || typeof request !== "object" || !module || !trust ||
      !grant || !authority || !securityDecision || !reservation) {
    return { admitted: false, reasonCodes: ["REQUIRED_EVIDENCE_MISSING"] };
  }

  const createdAt = Date.parse(request.created_at ?? "");
  const deadlineAt = Date.parse(request.deadline_at ?? "");
  if (request.contract_version !== "1.0.0" ||
      !request.request_id || !request.task_id || !request.correlation_id ||
      !request.principal_ref || !request.module_id || !request.module_version ||
      !request.capability_id || !request.operation || !request.target_ref ||
      !request.input_ref ||
      !["R0", "R1", "R2", "R3", "unknown"].includes(request.risk_tier) ||
      typeof request.artifact_digest !== "string" ||
      !/^[a-fA-F0-9]{64}$/.test(request.artifact_digest) ||
      !Number.isFinite(createdAt) ||
      createdAt > now.getTime() || !Number.isFinite(deadlineAt) ||
      deadlineAt <= now.getTime() || deadlineAt <= createdAt) {
    reasons.push("INVALID_OR_EXPIRED_EXECUTION_REQUEST");
  }
  if (resourcePolicy !== "FREE_ONLY") reasons.push("RESOURCE_POLICY_NOT_FREE_ONLY");

  if (module.lifecycle_state !== "ACTIVE" ||
      module.module_id !== request.module_id ||
      module.module_version !== request.module_version ||
      module.artifact_digest !== request.artifact_digest) {
    reasons.push("MODULE_IDENTITY_OR_LIFECYCLE_MISMATCH");
  }
  if (trust.verdict !== "TRUSTED_WITH_SCOPE" ||
      trust.module_id !== request.module_id ||
      trust.module_version !== request.module_version ||
      trust.artifact_digest !== request.artifact_digest ||
      trust.signature_status !== "VALID" ||
      trust.publisher_identity_status !== "VERIFIED" ||
      trust.supply_chain_status !== "PASS" ||
      !validTime(trust.expires_at, now) ||
      !trust.approved_capability_ids?.includes(request.capability_id)) {
    reasons.push("TRUST_EVIDENCE_INVALID");
  }

  if (grant.status !== "active" ||
      grant.principal_ref !== request.principal_ref ||
      grant.module_id !== request.module_id ||
      grant.capability_id !== request.capability_id ||
      !grant.allowed_operations?.includes(request.operation) ||
      !grant.target_scope?.includes(request.target_ref) ||
      !validTime(grant.expires_at, now) ||
      (RISK[request.risk_tier] ?? 99) > (RISK[grant.risk_ceiling] ?? -1)) {
    reasons.push("CAPABILITY_GRANT_INVALID_OR_OUT_OF_SCOPE");
  }

  if (authority.status !== "active" ||
      authority.task_id !== request.task_id ||
      authority.principal_id !== request.principal_ref ||
      !authority.allowed_capabilities?.includes(request.capability_id) ||
      !validTime(authority.expires_at, now) ||
      (RISK[request.risk_tier] ?? 99) >
        (RISK[authority.risk_constraints?.maximum_risk_tier] ?? -1)) {
    reasons.push("AUTHORITY_ENVELOPE_INVALID_OR_OUT_OF_SCOPE");
  }

  if (securityDecision.decision !== "ALLOW" ||
      securityDecision.principal_ref !== request.principal_ref ||
      securityDecision.task_id !== request.task_id ||
      securityDecision.capability_id !== request.capability_id ||
      securityDecision.target_ref !== request.target_ref ||
      securityDecision.risk_tier !== request.risk_tier ||
      !validTime(securityDecision.expires_at, now)) {
    reasons.push("SECURITY_DECISION_NOT_ALLOW_OR_NOT_BOUND");
  }

  if (!["reserved", "active"].includes(reservation.status) ||
      reservation.principal_ref !== request.principal_ref ||
      reservation.task_id !== request.task_id ||
      !validTime(reservation.expires_at, now)) {
    reasons.push("RESOURCE_RESERVATION_INVALID");
  }
  const limits = reservation.resource_limits ?? {};
  if (resourcePolicy === "FREE_ONLY" &&
      (limits.max_cost_minor_units !== 0 ||
       reservation.reserved_cost_minor_units !== 0)) {
    reasons.push("FREE_ONLY_ZERO_COST_RESERVATION_REQUIRED");
  }

  if (request.risk_tier === "R2" || request.risk_tier === "R3" ||
      request.risk_tier === "unknown") {
    reasons.push("OWNER_APPROVAL_REQUIRED_OR_RISK_UNKNOWN");
  }
  if (request.approval_ref && securityDecision.required_approval &&
      securityDecision.required_approval !== "none") {
    reasons.push("APPROVAL_EVIDENCE_NOT_VERIFIED_BY_V0_1");
  }

  return {
    admitted: reasons.length === 0,
    reasonCodes: [...new Set(reasons)],
    requestId: request.request_id ?? null,
    dispatchPerformed: false
  };
}
