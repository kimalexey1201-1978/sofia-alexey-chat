import test from "node:test";
import assert from "node:assert/strict";
import { evaluateProviderAdapterAdmission } from "../../src/core/provider-adapter-policy.mjs";

function fixture() {
  return {
    adapter: {
      adapter_id: "provider.example",
      adapter_version: "1.2.0",
      provider_id: "example",
      status: "enabled",
      artifact_digest: "a".repeat(64),
      contract_version: "1.0.0",
      supported_operations: ["generate", "get_status"],
      platforms: ["server"],
      network_egress_allowlist: ["api.example.com"]
    },
    operation: "generate",
    platform: "server",
    expectedContractVersion: "1.0.0"
  };
}

test("admits an enabled, digest-bound, compatible declared adapter route", () => {
  const result = evaluateProviderAdapterAdmission(fixture());
  assert.equal(result.allowed, true);
  assert.equal(result.adapterRef.adapter_id, "provider.example");
});

test("fails closed for disabled adapters and invalid artifact digests", () => {
  const disabled = fixture();
  disabled.adapter.status = "disabled";
  assert.equal(evaluateProviderAdapterAdmission(disabled).reasonCode, "ADAPTER_NOT_ENABLED");
  const digest = fixture();
  digest.adapter.artifact_digest = "not-a-digest";
  assert.equal(evaluateProviderAdapterAdmission(digest).reasonCode, "ADAPTER_ARTIFACT_DIGEST_INVALID");
});

test("rejects undeclared operations and incompatible contract versions", () => {
  const operation = fixture();
  operation.operation = "delete_account";
  assert.equal(evaluateProviderAdapterAdmission(operation).reasonCode, "ADAPTER_OPERATION_NOT_DECLARED");
  const version = fixture();
  version.expectedContractVersion = "2.0.0";
  assert.equal(evaluateProviderAdapterAdmission(version).reasonCode, "ADAPTER_CONTRACT_VERSION_INCOMPATIBLE");
});

test("rejects unsupported platforms and non-allowlisted egress targets", () => {
  const platform = fixture();
  platform.platform = "android";
  assert.equal(evaluateProviderAdapterAdmission(platform).reasonCode, "ADAPTER_PLATFORM_UNSUPPORTED");
  const egress = fixture();
  egress.targetHost = "attacker.example";
  assert.equal(evaluateProviderAdapterAdmission(egress).reasonCode, "ADAPTER_EGRESS_TARGET_NOT_ALLOWLISTED");
});

test("does not claim to perform cryptographic or user authorization", () => {
  const result = evaluateProviderAdapterAdmission(fixture());
  assert.deepEqual(Object.keys(result).sort(), ["adapterRef", "allowed", "reasonCode"].sort());
});
