import test from "node:test";
import assert from "node:assert/strict";
import { evaluateAdapterLifecycleTransition } from "../../src/core/provider-adapter-registry.mjs";
import { evaluateProviderAdapterAdmission } from "../../src/core/provider-adapter-policy.mjs";
import { evaluateExecutionAdmission } from "../../src/core/execution-supervisor.mjs";
import { validateProviderResult } from "../../src/core/ai-provider.mjs";
import { createDeterministicMockProvider } from "../../src/providers/mock-provider.mjs";

const now = new Date("2026-11-20T15:00:00.000Z");

function fixture() {
  const adapter = {
    adapter_id: "mock.provider", adapter_version: "1.0.0",
    provider_id: "mock-provider", status: "enabled",
    artifact_digest: "a".repeat(64), contract_version: "1.0.0",
    supported_operations: ["generate"], platforms: ["server"],
    network_egress_allowlist: []
  };
  const admission = {
    resourcePolicy: "FREE_ONLY",
    request: {
      request_id: "request-mock-0001", task_id: "task-mock-0001",
      correlation_id: "corr-mock-0001", principal_ref: "owner-test",
      module_id: "mock.provider", module_version: "1.0.0",
      artifact_digest: "a".repeat(64), capability_id: "text.generate",
      operation: "generate", target_ref: "provider:mock", input_ref: "fixture:input",
      risk_tier: "R0", created_at: "2026-11-20T14:59:00.000Z",
      deadline_at: "2026-11-20T15:01:00.000Z", contract_version: "1.0.0"
    },
    module: { lifecycle_state: "ACTIVE", module_id: "mock.provider",
      module_version: "1.0.0", artifact_digest: "a".repeat(64) },
    trust: { verdict: "TRUSTED_WITH_SCOPE", module_id: "mock.provider",
      module_version: "1.0.0", artifact_digest: "a".repeat(64),
      signature_status: "VALID", publisher_identity_status: "VERIFIED",
      supply_chain_status: "PASS", expires_at: "2026-11-21T00:00:00.000Z",
      approved_capability_ids: ["text.generate"] },
    grant: { status: "active", principal_ref: "owner-test",
      module_id: "mock.provider", capability_id: "text.generate",
      allowed_operations: ["generate"], target_scope: ["provider:mock"],
      expires_at: "2026-11-21T00:00:00.000Z", risk_ceiling: "R1" },
    authority: { status: "active", task_id: "task-mock-0001",
      principal_id: "owner-test", allowed_capabilities: ["text.generate"],
      risk_constraints: { maximum_risk_tier: "R1" },
      expires_at: "2026-11-21T00:00:00.000Z" },
    securityDecision: { decision: "ALLOW", principal_ref: "owner-test",
      task_id: "task-mock-0001", capability_id: "text.generate",
      target_ref: "provider:mock", risk_tier: "R0",
      expires_at: "2026-11-20T15:00:30.000Z", required_approval: "none" },
    reservation: { status: "reserved", principal_ref: "owner-test",
      task_id: "task-mock-0001", expires_at: "2026-11-20T15:00:30.000Z",
      reserved_cost_minor_units: 0,
      resource_limits: { max_cost_minor_units: 0, max_duration_ms: 5000 } }
  };
  return { adapter, admission };
}

test("runs the mock route only after lifecycle, adapter and execution admission", async () => {
  const { adapter, admission } = fixture();
  const lifecycle = evaluateAdapterLifecycleTransition({ status: "pending_review" }, "enabled");
  assert.equal(lifecycle.allowed, true);

  const adapterGate = evaluateProviderAdapterAdmission({
    adapter, operation: "generate", platform: "server",
    expectedContractVersion: "1.0.0"
  });
  assert.equal(adapterGate.allowed, true);

  const executionGate = evaluateExecutionAdmission(admission, now);
  assert.equal(executionGate.admitted, true);
  assert.equal(executionGate.dispatchPerformed, false);

  const provider = createDeterministicMockProvider({
    providerId: "mock-provider", modelId: "mock-model-v1",
    response: "Conformance response", usage: { inputTokens: 3, outputTokens: 2 }
  });
  const rawResult = await provider.generate({
    requestId: admission.request.request_id,
    messages: [{ role: "user", content: "test" }],
    systemInstruction: "test-only",
    maxOutputTokens: 32,
    timeoutMs: 100
  });
  const result = validateProviderResult(rawResult);

  assert.equal(result.providerId, adapter.provider_id);
  assert.equal(result.text, "Conformance response");
  assert.equal(provider.calls.length, 1);
});

test("does not call provider when adapter admission is denied", async () => {
  const { adapter } = fixture();
  adapter.status = "disabled";
  const provider = createDeterministicMockProvider();
  const gate = evaluateProviderAdapterAdmission({
    adapter, operation: "generate", platform: "server",
    expectedContractVersion: "1.0.0"
  });
  assert.equal(gate.allowed, false);
  assert.equal(provider.calls.length, 0);
});

test("does not call provider when execution admission is denied", async () => {
  const { adapter, admission } = fixture();
  admission.securityDecision.decision = "DENY";
  const provider = createDeterministicMockProvider();
  const adapterGate = evaluateProviderAdapterAdmission({
    adapter, operation: "generate", platform: "server",
    expectedContractVersion: "1.0.0"
  });
  const executionGate = evaluateExecutionAdmission(admission, now);
  assert.equal(adapterGate.allowed, true);
  assert.equal(executionGate.admitted, false);
  assert.equal(provider.calls.length, 0);
});

test("lifecycle policy prevents direct activation from discovered", () => {
  const result = evaluateAdapterLifecycleTransition({ status: "discovered" }, "enabled");
  assert.equal(result.allowed, false);
});
