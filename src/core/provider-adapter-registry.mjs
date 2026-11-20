const TRANSITIONS = Object.freeze({
  discovered: new Set(["pending_review", "disabled"]),
  pending_review: new Set(["enabled", "restricted", "disabled", "error"]),
  enabled: new Set(["restricted", "disabled", "deprecated", "error"]),
  restricted: new Set(["pending_review", "disabled", "deprecated", "error"]),
  disabled: new Set(["pending_review", "deprecated"]),
  error: new Set(["pending_review", "disabled", "deprecated"]),
  deprecated: new Set()
});

const IMMUTABLE_FIELDS = [
  "adapter_id", "adapter_version", "provider_id", "integration_type",
  "api_version", "supported_operations", "platforms", "required_scopes"
];

function deny(reasonCode) {
  return { allowed: false, reasonCode };
}

/**
 * Checks a proposed registry lifecycle transition. This pure function does not
 * persist records, validate signatures or authorize external invocations.
 */
export function evaluateAdapterLifecycleTransition(current, nextStatus) {
  if (!current || typeof current !== "object" || Array.isArray(current)) {
    return deny("CURRENT_ADAPTER_RECORD_REQUIRED");
  }
  if (!Object.hasOwn(TRANSITIONS, current.status) ||
      !Object.hasOwn(TRANSITIONS, nextStatus)) {
    return deny("UNKNOWN_ADAPTER_LIFECYCLE_STATUS");
  }
  if (current.status === nextStatus) {
    return { allowed: true, reasonCode: "ADAPTER_STATUS_UNCHANGED" };
  }
  if (!TRANSITIONS[current.status].has(nextStatus)) {
    return deny("ADAPTER_LIFECYCLE_TRANSITION_NOT_ALLOWED");
  }
  return { allowed: true, reasonCode: "ADAPTER_LIFECYCLE_TRANSITION_ALLOWED" };
}

/**
 * Detects changes to adapter identity/scope fields between registry versions.
 * A changed release identity or permission surface requires a fresh review.
 */
export function evaluateAdapterRecordUpdate(current, proposed) {
  if (!current || !proposed || typeof current !== "object" ||
      typeof proposed !== "object" || Array.isArray(current) || Array.isArray(proposed)) {
    return deny("ADAPTER_RECORDS_REQUIRED");
  }
  const changedFields = IMMUTABLE_FIELDS.filter(field =>
    JSON.stringify(current[field] ?? null) !== JSON.stringify(proposed[field] ?? null)
  );
  const digestChanged = current.artifact_digest !== proposed.artifact_digest;
  const permissionSurfaceChanged =
    JSON.stringify(current.required_scopes ?? []) !== JSON.stringify(proposed.required_scopes ?? []);
  const releaseChanged = current.adapter_version !== proposed.adapter_version ||
    current.api_version !== proposed.api_version || digestChanged;
  return {
    allowed: true,
    requiresReview: changedFields.length > 0 || digestChanged,
    reviewReasons: [
      ...(releaseChanged ? ["ADAPTER_RELEASE_IDENTITY_CHANGED"] : []),
      ...(permissionSurfaceChanged ? ["ADAPTER_PERMISSION_SCOPE_CHANGED"] : []),
      ...(changedFields.some(field => field === "supported_operations") ? ["ADAPTER_OPERATION_SURFACE_CHANGED"] : []),
      ...(changedFields.some(field => field === "platforms") ? ["ADAPTER_PLATFORM_SURFACE_CHANGED"] : [])
    ],
    changedFields: [...new Set([...changedFields, ...(digestChanged ? ["artifact_digest"] : [])])]
  };
}
