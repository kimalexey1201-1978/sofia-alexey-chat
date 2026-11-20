import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateAdapterLifecycleTransition,
  evaluateAdapterRecordUpdate
} from "../../src/core/provider-adapter-registry.mjs";

function record() {
  return {
    adapter_id: "provider.example", adapter_version: "1.0.0",
    provider_id: "example", integration_type: "official_api",
    api_version: "v1", supported_operations: ["read_status"],
    platforms: ["server"], required_scopes: ["status:read"],
    artifact_digest: "a".repeat(64), status: "pending_review"
  };
}

test("allows reviewed adapter activation and controlled restriction", () => {
  assert.equal(evaluateAdapterLifecycleTransition(record(), "enabled").allowed, true);
  const enabled = record();
  enabled.status = "enabled";
  assert.equal(evaluateAdapterLifecycleTransition(enabled, "restricted").allowed, true);
});

test("rejects activation from discovery and reactivation from deprecated", () => {
  const discovered = record();
  discovered.status = "discovered";
  assert.equal(evaluateAdapterLifecycleTransition(discovered, "enabled").reasonCode,
    "ADAPTER_LIFECYCLE_TRANSITION_NOT_ALLOWED");
  const deprecated = record();
  deprecated.status = "deprecated";
  assert.equal(evaluateAdapterLifecycleTransition(deprecated, "pending_review").allowed, false);
});

test("requires review when release digest or operation surface changes", () => {
  const current = record();
  const proposed = { ...current, artifact_digest: "b".repeat(64),
    supported_operations: ["read_status", "send_message"] };
  const result = evaluateAdapterRecordUpdate(current, proposed);
  assert.equal(result.requiresReview, true);
  assert.ok(result.reviewReasons.includes("ADAPTER_RELEASE_IDENTITY_CHANGED"));
  assert.ok(result.reviewReasons.includes("ADAPTER_OPERATION_SURFACE_CHANGED"));
});

test("requires review when platform or permission scope expands", () => {
  const current = record();
  const proposed = { ...current, platforms: ["server", "android"],
    required_scopes: ["status:read", "message:write"] };
  const result = evaluateAdapterRecordUpdate(current, proposed);
  assert.equal(result.requiresReview, true);
  assert.ok(result.reviewReasons.includes("ADAPTER_PERMISSION_SCOPE_CHANGED"));
  assert.ok(result.reviewReasons.includes("ADAPTER_PLATFORM_SURFACE_CHANGED"));
});

test("does not require review for operational metadata outside immutable scope", () => {
  const current = record();
  const proposed = { ...current, status: "restricted", last_verified_at: "2026-11-20T20:00:00Z" };
  const result = evaluateAdapterRecordUpdate(current, proposed);
  assert.equal(result.requiresReview, false);
});
