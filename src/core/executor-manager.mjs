const DIGEST_RE = /^[a-fA-F0-9]{64}$/;

/**
 * Read-only AEMS eligibility screening.
 * This module does not load, invoke, authorize, or persist executors.
 */
export function assessExecutorCandidate(candidate, task, now = new Date()) {
  const reasons = [];
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return { eligible: false, reasonCodes: ["INVALID_CANDIDATE"] };
  }
  if (!task || typeof task !== "object" || Array.isArray(task) ||
      typeof task.capabilityId !== "string" || !task.capabilityId ||
      typeof task.platform !== "string" || !task.platform ||
      task.resourcePolicy !== "FREE_ONLY") {
    return { eligible: false, reasonCodes: ["INVALID_OR_UNSUPPORTED_TASK_POLICY"] };
  }

  const { registry, trust, health, provider, manifest } = candidate;
  if (!registry || registry.lifecycle_state !== "ACTIVE") reasons.push("MODULE_NOT_ACTIVE");
  if (!registry || !DIGEST_RE.test(registry.artifact_digest ?? "")) reasons.push("INVALID_ARTIFACT_DIGEST");
  if (!trust || trust.verdict !== "TRUSTED_WITH_SCOPE") reasons.push("TRUST_NOT_APPROVED");
  if (!trust || trust.publisher_identity_status !== "VERIFIED") reasons.push("PUBLISHER_NOT_VERIFIED");
  if (!trust || trust.signature_status !== "VALID") reasons.push("ARTIFACT_SIGNATURE_NOT_VALID");
  if (!trust || trust.supply_chain_status !== "PASS") reasons.push("SUPPLY_CHAIN_NOT_PASSED");
  if (!trust || trust.artifact_digest !== registry?.artifact_digest) reasons.push("TRUST_DIGEST_MISMATCH");
  if (!trust || !Array.isArray(trust.approved_capability_ids) ||
      !trust.approved_capability_ids.includes(task.capabilityId)) {
    reasons.push("CAPABILITY_NOT_TRUST_APPROVED");
  }
  if (!Array.isArray(registry?.capability_ids) ||
      !registry.capability_ids.includes(task.capabilityId)) {
    reasons.push("CAPABILITY_NOT_REGISTERED");
  }
  if (!health || health.availability !== "HEALTHY" ||
      health.circuit_breaker !== "CLOSED") reasons.push("EXECUTOR_NOT_HEALTHY");
  const freshUntil = Date.parse(health?.fresh_until ?? "");
  if (!Number.isFinite(freshUntil) || freshUntil <= now.getTime()) {
    reasons.push("HEALTH_EVIDENCE_STALE");
  }
  if (health?.module_id !== registry?.module_id ||
      health?.module_version !== registry?.module_version) {
    reasons.push("HEALTH_MODULE_MISMATCH");
  }
  const manifestCapabilities = Array.isArray(manifest?.capabilities)
    ? manifest.capabilities.map(item => item?.capability_id) : [];
  if (!manifestCapabilities.includes(task.capabilityId)) {
    reasons.push("CAPABILITY_NOT_IN_MANIFEST");
  }
  if (!Array.isArray(manifest?.compatibility?.platforms) ||
      !manifest.compatibility.platforms.includes(task.platform)) {
    reasons.push("PLATFORM_INCOMPATIBLE");
  }

  // FREE_ONLY is fail-closed: absent/unknown pricing evidence is not free.
  if (!provider || provider.pricing_status !== "VERIFIED_FREE" ||
      provider.additional_cost_minor_units !== 0 ||
      provider.currency !== task.currency) {
    reasons.push("FREE_ONLY_COST_NOT_VERIFIED");
  }

  return {
    eligible: reasons.length === 0,
    reasonCodes: [...new Set(reasons)],
    moduleRef: registry?.module_id && registry?.module_version
      ? `${registry.module_id}@${registry.module_version}` : null
  };
}

/** Filters candidates without ranking or invoking them. */
export function findEligibleExecutors(candidates, task, now = new Date()) {
  if (!Array.isArray(candidates)) {
    return { ok: false, code: "INVALID_CANDIDATE_LIST", assessments: [] };
  }
  const assessments = candidates.map(candidate =>
    assessExecutorCandidate(candidate, task, now)
  );
  return {
    ok: true,
    eligibleModuleRefs: assessments.filter(item => item.eligible).map(item => item.moduleRef),
    assessments
  };
}
