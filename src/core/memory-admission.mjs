const MEMORY_TYPES = new Set([
  "working", "contextual", "long_term", "episodic",
  "procedural", "project", "semantic"
]);
const DURABLE_TYPES = new Set([
  "long_term", "episodic", "procedural", "project", "semantic"
]);
const DOMAINS = new Set([
  "preference", "user_fact", "project",
  "procedure", "knowledge_reference", "ephemeral"
]);
const SOURCE_TYPES = new Set([
  "user_message", "user_approval", "project_artifact",
  "connected_source", "assistant_inference", "system_event"
]);
const ASSERTIONS = new Set([
  "user_stated", "user_confirmed", "externally_verified",
  "assistant_inferred", "observed"
]);
const ITEM_STATUSES = new Set([
  "candidate", "pending_approval", "active", "stale",
  "superseded", "restricted", "deletion_pending", "deleted", "expired"
]);
const SENSITIVITIES = new Set([
  "public", "personal", "sensitive", "highly_sensitive", "secret_prohibited"
]);
const RETENTION_CLASSES = new Set([
  "ephemeral", "session", "project_lifecycle",
  "user_controlled", "policy_limited"
]);

function result(input, decision, reasonCode, extra = {}) {
  return {
    decision_id: input.decisionId,
    candidate_ref: input.candidate?.memory_id ?? "invalid-candidate",
    decided_at: input.now,
    decision,
    reason_codes: [reasonCode],
    policy_version: input.policy?.policy_version ?? "unavailable",
    ...extra
  };
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function approvalMatches(approval, candidate) {
  if (!approval || approval.approved !== true ||
      !isNonEmptyString(approval.approval_id) ||
      approval.candidate_ref !== candidate.memory_id ||
      approval.purpose !== candidate.purpose ||
      !Array.isArray(approval.allowed_scopes) ||
      !Array.isArray(candidate.allowed_scopes) ||
      candidate.allowed_scopes.length === 0) return false;

  const approvedScopes = new Set(approval.allowed_scopes);
  return candidate.allowed_scopes.every(scope =>
    isNonEmptyString(scope) && approvedScopes.has(scope)
  );
}

/**
 * Deterministic, metadata-only admission gate for a proposed memory record.
 *
 * This function does not classify the content itself, authenticate the owner,
 * validate JSON Schema, or write to storage. Those checks must happen before
 * or after this gate in their dedicated security and persistence layers.
 * Missing policy or evidence always fails closed.
 */
export function evaluateMemoryWriteAdmission(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      decision_id: "invalid-input",
      candidate_ref: "invalid-candidate",
      decided_at: "1970-01-01T00:00:00.000Z",
      decision: "REJECT",
      reason_codes: ["INVALID_ADMISSION_INPUT"],
      policy_version: "unavailable"
    };
  }

  const candidate = input.candidate;
  const policy = input.policy;
  if (!isNonEmptyString(input.decisionId) ||
      !isNonEmptyString(input.now) ||
      !Number.isFinite(Date.parse(input.now))) {
    return result(input, "REJECT", "DECISION_METADATA_INVALID");
  }

  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate) ||
      !isNonEmptyString(candidate.memory_id) ||
      candidate.schema_version !== "1" ||
      !DOMAINS.has(candidate.domain) ||
      !MEMORY_TYPES.has(candidate.memory_type) ||
      !isNonEmptyString(candidate.item_type) ||
      !isNonEmptyString(candidate.content) ||
      candidate.content.length > 12000 ||
      !candidate.source || typeof candidate.source !== "object" ||
      !SOURCE_TYPES.has(candidate.source.source_type) ||
      !isNonEmptyString(candidate.source.source_id) ||
      !ASSERTIONS.has(candidate.source.assertion_kind) ||
      !isNonEmptyString(candidate.observed_at) ||
      !Number.isFinite(Date.parse(candidate.observed_at)) ||
      !isNonEmptyString(candidate.created_at) ||
      !Number.isFinite(Date.parse(candidate.created_at)) ||
      !isNonEmptyString(candidate.purpose) ||
      !candidate.retention ||
      !RETENTION_CLASSES.has(candidate.retention.retention_class) ||
      !SENSITIVITIES.has(candidate.sensitivity) ||
      !ITEM_STATUSES.has(candidate.status)) {
    return result(input, "REJECT", "MEMORY_CANDIDATE_INVALID");
  }

  if (candidate.sensitivity === "secret_prohibited") {
    return result(input, "REJECT", "PROHIBITED_SECRET_CLASS");
  }

  if (candidate.status === "deleted" || candidate.status === "deletion_pending" ||
      candidate.status === "superseded" || candidate.status === "disputed" ||
      candidate.assertion_status === "disputed") {
    return result(input, "REJECT", "CANDIDATE_NOT_ELIGIBLE");
  }

  if (candidate.source.assertion_kind === "assistant_inferred") {
    return result(input, "KEEP_CANDIDATE", "ASSISTANT_INFERENCE_NOT_PERSISTABLE");
  }

  if (!DURABLE_TYPES.has(candidate.memory_type) || candidate.domain === "ephemeral") {
    return result(input, "TRANSIENT_ONLY", "NON_DURABLE_MEMORY_TYPE");
  }

  if (!policy || typeof policy !== "object" ||
      !isNonEmptyString(policy.policy_version) ||
      policy.persistence_enabled !== true) {
    return result(input, "TRANSIENT_ONLY", "PERSISTENCE_POLICY_NOT_ENABLED");
  }

  const allowedTypes = Array.isArray(policy.allowed_memory_types)
    ? new Set(policy.allowed_memory_types) : new Set();
  const allowedSensitivities = Array.isArray(policy.allowed_sensitivities)
    ? new Set(policy.allowed_sensitivities) : new Set();
  if (!allowedTypes.has(candidate.memory_type)) {
    return result(input, "REJECT", "MEMORY_TYPE_NOT_ALLOWED");
  }
  if (!allowedSensitivities.has(candidate.sensitivity)) {
    return result(input, "REJECT", "SENSITIVITY_CLASS_NOT_ALLOWED");
  }

  if (!Array.isArray(candidate.allowed_scopes) ||
      candidate.allowed_scopes.length === 0 ||
      candidate.allowed_scopes.some(scope => !isNonEmptyString(scope))) {
    return result(input, "REJECT", "MEMORY_SCOPE_REQUIRED");
  }
  if (candidate.memory_type === "project" &&
      !candidate.allowed_scopes.some(scope => scope.startsWith("project:"))) {
    return result(input, "REJECT", "PROJECT_SCOPE_REQUIRED");
  }

  if (!["project_lifecycle", "user_controlled", "policy_limited"]
      .includes(candidate.retention.retention_class)) {
    return result(input, "REJECT", "DURABLE_RETENTION_POLICY_REQUIRED");
  }
  if (!isNonEmptyString(input.retentionPolicyRef)) {
    return result(input, "REJECT", "RETENTION_POLICY_REFERENCE_REQUIRED");
  }

  const evidenceIsAdmissible = [
    "owner_confirmed", "externally_verified", "corroborated"
  ].includes(candidate.assertion_status);
  if (!evidenceIsAdmissible) {
    return result(input, "KEEP_CANDIDATE", "EVIDENCE_NOT_CONFIRMED");
  }

  if (!approvalMatches(input.ownerApproval, candidate)) {
    return result(input, "REQUIRE_OWNER_CONFIRMATION", "OWNER_APPROVAL_REQUIRED");
  }

  return result(input, "PERSIST", "ADMISSION_CHECKS_PASSED", {
    owner_approval_ref: input.ownerApproval.approval_id,
    retention_policy_ref: input.retentionPolicyRef,
    allowed_scopes: [...candidate.allowed_scopes],
    ...(isNonEmptyString(candidate.retention.expires_at)
      ? { expires_at: candidate.retention.expires_at } : {})
  });
}
