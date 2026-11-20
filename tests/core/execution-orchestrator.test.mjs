import test from "node:test";
import assert from "node:assert/strict";
import { prepareExecution } from "../../src/core/execution-orchestrator.mjs";

const now = new Date("2026-11-20T15:00:00.000Z");
function makeCandidate() {
  const digest = "a".repeat(64);
  return {
    registry: { module_id: "fixture.executor", module_version: "1.0.0",
      artifact_digest: digest, lifecycle_state: "ACTIVE",
      capability_ids: ["text.generate"] },
    manifest: { compatibility: { platforms: ["cloud"] },
      capabilities: [{ capability_id: "text.generate" }] },
    trust: { verdict: "TRUSTED_WITH_SCOPE", publisher_identity_status: "VERIFIED",
      signature_status: "VALID", supply_chain_status: "PASS",
      artifact_digest: digest, approved_capability_ids: ["text.generate"] },
    health: { module_id: "fixture.executor", module_version: "1.0.0",
      availability: "HEALTHY", circuit_breaker: "CLOSED",
      fresh_until: "2026-11-20T15:05:00.000Z" },
    provider: { pricing_status: "VERIFIED_FREE",
      additional_cost_minor_units: 0, currency: "USD" },
    executionEvidence: {
      resourcePolicy: "FREE_ONLY",
      request: { request_id: "request-0001", task_id: "task-0001",
        correlation_id: "corr-0001", principal_ref: "owner-1",
        module_id: "fixture.executor", module_version: "1.0.0",
        artifact_digest: digest, capability_id: "text.generate",
        operation: "generate", target_ref: "provider:test", input_ref: "input:1",
        risk_tier: "R0", created_at: "2026-11-20T14:59:00.000Z",
        deadline_at: "2026-11-20T15:01:00.000Z", contract_version: "1.0.0" },
      module: { lifecycle_state: "ACTIVE", module_id: "fixture.executor",
        module_version: "1.0.0", artifact_digest: digest },
      trust: { verdict: "TRUSTED_WITH_SCOPE", module_id: "fixture.executor",
        module_version: "1.0.0", artifact_digest: digest,
        signature_status: "VALID", publisher_identity_status: "VERIFIED",
        supply_chain_status: "PASS", expires_at: "2026-11-21T00:00:00.000Z",
        approved_capability_ids: ["text.generate"] },
      grant: { status: "active", principal_ref: "owner-1",
        module_id: "fixture.executor", capability_id: "text.generate",
        allowed_operations: ["generate"], target_scope: ["provider:test"],
        expires_at: "2026-11-21T00:00:00.000Z", risk_ceiling: "R1" },
      authority: { status: "active", task_id: "task-0001", principal_id: "owner-1",
        allowed_capabilities: ["text.generate"],
        risk_constraints: { maximum_risk_tier: "R1" },
        expires_at: "2026-11-21T00:00:00.000Z" },
      securityDecision: { decision: "ALLOW", principal_ref: "owner-1",
        task_id: "task-0001", capability_id: "text.generate",
        target_ref: "provider:test", risk_tier: "R0",
        expires_at: "2026-11-20T15:00:30.000Z", required_approval: "none" },
      reservation: { status: "reserved", principal_ref: "owner-1",
        task_id: "task-0001", expires_at: "2026-11-20T15:00:30.000Z",
        reserved_cost_minor_units: 0,
        resource_limits: { max_cost_minor_units: 0, max_duration_ms: 5000 } }
    }
  };
}
function makePlan() {
  return { plan_id: "plan-000001", task_id: "task-0001", plan_version: 1,
    created_at: "2026-11-20T14:59:00.000Z", owner_goal: "Generate text",
    success_criteria: ["Output verified"], assumptions: [],
    steps: [{ step_id: "step-1", description: "Generate text",
      step_type: "execute", depends_on: [], required_capabilities: ["text.generate"],
      verification_criteria: ["Valid response"], status: "ready" }],
    autonomy_level: "A0", resource_policy: "FREE_ONLY",
    policy_version: "sofia-core-v0.1", status: "approved" };
}
const task = { capabilityId: "text.generate", platform: "cloud",
  resourcePolicy: "FREE_ONLY", currency: "USD" };

test("prepares a candidate only after plan, eligibility and admission checks", () => {
  const result = prepareExecution(makePlan(), [makeCandidate()], task, now);
  assert.equal(result.ok, true);
  assert.equal(result.status, "PREPARED");
  assert.equal(result.selectedModuleRef, "fixture.executor@1.0.0");
  assert.equal(result.dispatchPerformed, false);
});

test("blocks candidate when supervisor evidence is absent", () => {
  const candidate = makeCandidate();
  delete candidate.executionEvidence;
  const result = prepareExecution(makePlan(), [candidate], task, now);
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.selectedModuleRef, null);
});

test("rejects a step whose required capability differs from the task", () => {
  const plan = makePlan();
  plan.steps[0].required_capabilities = ["mail.send"];
  const result = prepareExecution(plan, [makeCandidate()], task, now);
  assert.equal(result.status, "REJECTED");
  assert.ok(result.reasonCodes.includes("STEP_CAPABILITY_MISMATCH"));
});

test("rejects invalid plans and never dispatches", () => {
  const plan = makePlan();
  plan.steps[0].depends_on = ["missing-step"];
  const result = prepareExecution(plan, [makeCandidate()], task, now);
  assert.equal(result.status, "REJECTED");
  assert.equal(result.dispatchPerformed, false);
});

test("does not select a candidate with unverified pricing", () => {
  const candidate = makeCandidate();
  candidate.provider.pricing_status = "UNKNOWN";
  const result = prepareExecution(makePlan(), [candidate], task, now);
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.selectedModuleRef, null);
});

test("does not prepare a step until all dependencies have succeeded", () => {
  const plan = makePlan();
  plan.steps = [
    { step_id: "step-0", description: "Prerequisite", step_type: "reason",
      depends_on: [], required_capabilities: [],
      verification_criteria: ["Prerequisite verified"], status: "running" },
    { step_id: "step-1", description: "Generate text", step_type: "execute",
      depends_on: ["step-0"], required_capabilities: ["text.generate"],
      verification_criteria: ["Valid response"], status: "ready" }
  ];
  const result = prepareExecution(plan, [makeCandidate()], task, now);
  assert.equal(result.ok, false);
  assert.equal(result.status, "NOT_READY");
  assert.ok(result.reasonCodes.includes("EXPECTED_EXACTLY_ONE_DEPENDENCY_READY_STEP"));
});

test("does not prepare a draft or awaiting-approval plan", () => {
  const plan = makePlan();
  plan.status = "awaiting_owner_approval";
  const result = prepareExecution(plan, [makeCandidate()], task, now);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes("PLAN_NOT_APPROVED_FOR_EXECUTION"));
});
