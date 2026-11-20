const ACTIVE_STATUS = "enabled";

/**
 * Pure, fail-closed admission check for a normalized provider-adapter route.
 * This evaluates metadata only; it does not verify signatures, authorize users,
 * fetch secrets, validate network destinations or invoke an adapter.
 */
export function evaluateProviderAdapterAdmission(input) {
  const deny = reasonCode => ({ allowed: false, reasonCode });
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return deny("INVALID_ADAPTER_ADMISSION_INPUT");
  }
  const { adapter, operation, platform, expectedContractVersion, targetHost } = input;
  if (!adapter || typeof adapter !== "object") return deny("ADAPTER_RECORD_REQUIRED");
  if (adapter.status !== ACTIVE_STATUS) return deny("ADAPTER_NOT_ENABLED");
  if (typeof adapter.adapter_id !== "string" || !adapter.adapter_id ||
      typeof adapter.provider_id !== "string" || !adapter.provider_id ||
      typeof adapter.adapter_version !== "string" || !adapter.adapter_version) {
    return deny("ADAPTER_IDENTITY_INCOMPLETE");
  }
  if (typeof adapter.artifact_digest !== "string" ||
      !/^[a-fA-F0-9]{64}$/.test(adapter.artifact_digest)) {
    return deny("ADAPTER_ARTIFACT_DIGEST_INVALID");
  }
  if (typeof expectedContractVersion !== "string" ||
      adapter.contract_version !== expectedContractVersion) {
    return deny("ADAPTER_CONTRACT_VERSION_INCOMPATIBLE");
  }
  if (typeof operation !== "string" || !Array.isArray(adapter.supported_operations) ||
      !adapter.supported_operations.includes(operation)) {
    return deny("ADAPTER_OPERATION_NOT_DECLARED");
  }
  if (typeof platform !== "string" || !Array.isArray(adapter.platforms) ||
      !adapter.platforms.includes(platform)) {
    return deny("ADAPTER_PLATFORM_UNSUPPORTED");
  }
  if (targetHost !== undefined) {
    if (typeof targetHost !== "string" || !Array.isArray(adapter.network_egress_allowlist) ||
        !adapter.network_egress_allowlist.includes(targetHost.toLowerCase())) {
      return deny("ADAPTER_EGRESS_TARGET_NOT_ALLOWLISTED");
    }
  }
  return {
    allowed: true,
    reasonCode: "ADAPTER_METADATA_ADMISSION_PASSED",
    adapterRef: {
      adapter_id: adapter.adapter_id,
      adapter_version: adapter.adapter_version,
      provider_id: adapter.provider_id,
      artifact_digest: adapter.artifact_digest.toLowerCase(),
      contract_version: adapter.contract_version
    }
  };
}
