import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateExecutionAdmission,
  evaluateRuntimeTaskTransition,
  evaluateExecutionRetry
} from "../../src/core/execution-supervisor.mjs";

const now = new Date("2026-11-20T15:00:00.000Z");
function validInput() {
  return {
    resourcePolicy: "FREE_ONLY",
    request: {
      request_id: "request-0001", task_id: "task-0001", correlation_id: "corr-0001",
      principal_ref: "owner-1", module_id: "fixture.executor", module_version: "1.0.0",
      artifact_digest: "a".repeat(64), capability_id: "text.generate",
      operation: "generate", target_ref: "provider:test", input_ref: "input:1",
      risk_tier: "R0", created_at: "2026-11-20T14:59:00.000Z",
      deadline_at: "2026-11-20T15:01:00.000Z", contract_version: "1.0.0"
    },
    module: { lifecycle_state: "ACTIVE", module_id: "fixture.executor",
      module_version: "1.0.0", artifact_digest: "a".repeat(64) },
    trust: { verdict: "TRUSTED_WITH_SCOPE", module_id: "fixture.executor",
      module_version: "1.0.0", artifact_digest: "a".repeat(64),
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
      reserved_cost_minor_units: 0, resource_limits: { max_cost_minor_units: 0, max_duration_ms: 5000 } }
  };
}

test("admits only a fully bound, low-risk, zero-cost request without dispatching", () => {
  const result = evaluateExecutionAdmission(validInput(), now);
  assert.equal(result.admitted, true);
  assert.equal(result.dispatchPerformed, false);
  assert.deepEqual(result.reasonCodes, []);
});

test("fails closed when any required authority evidence is missing", () => {
  const input = validInput();
  delete input.securityDecision;
  const result = evaluateExecutionAdmission(input, now);
  assert.equal(result.admitted, false);
  assert.ok(result.reasonCodes.includes("REQUIRED_EVIDENCE_MISSING"));
});

test("rejects mismatched target, principal, task, or capability", () => {
  const input = validInput();
  input.securityDecision.target_ref = "provider:other";
  input.grant.principal_ref = "another-owner";
  const result = evaluateExecutionAdmission(input, now);
  assert.equal(result.admitted, false);
  assert.ok(result.reasonCodes.includes("CAPABILITY_GRANT_INVALID_OR_OUT_OF_SCOPE"));
  assert.ok(result.reasonCodes.includes("SECURITY_DECISION_NOT_ALLOW_OR_NOT_BOUND"));
});

test("rejects expired, revoked, or nonzero-cost evidence", () => {
  const input = validInput();
  input.grant.status = "revoked";
  input.reservation.reserved_cost_minor_units = 1;
  const result = evaluateExecutionAdmission(input, now);
  assert.equal(result.admitted, false);
  assert.ok(result.reasonCodes.includes("CAPABILITY_GRANT_INVALID_OR_OUT_OF_SCOPE"));
  assert.ok(result.reasonCodes.includes("FREE_ONLY_ZERO_COST_RESERVATION_REQUIRED"));
});

test("requires owner approval for elevated or unknown risk", () => {
  const input = validInput();
  input.request.risk_tier = "R2";
  input.grant.risk_ceiling = "R3";
  input.authority.risk_constraints.maximum_risk_tier = "R3";
  input.securityDecision.risk_tier = "R2";
  const result = evaluateExecutionAdmission(input, now);
  assert.equal(result.admitted, false);
  assert.ok(result.reasonCodes.includes("OWNER_APPROVAL_REQUIRED_OR_RISK_UNKNOWN"));
});

test("rejects paid resource policy and non-ALLOW decisions", () => {
  const input = validInput();
  input.resourcePolicy = "OWNER_APPROVED_PAID_EXCEPTION";
  input.securityDecision.decision = "REQUIRE_OWNER_APPROVAL";
  const result = evaluateExecutionAdmission(input, now);
  assert.equal(result.admitted, false);
  assert.ok(result.reasonCodes.includes("RESOURCE_POLICY_NOT_FREE_ONLY"));
  assert.ok(result.reasonCodes.includes("SECURITY_DECISION_NOT_ALLOW_OR_NOT_BOUND"));
});

test("allows ordinary forward task transitions", () => {
  assert.equal(evaluateRuntimeTaskTransition({from:"created",to:"admitted"}).allowed, true);
  assert.equal(evaluateRuntimeTaskTransition({from:"running",to:"outcome_uncertain"}).allowed, true);
  assert.equal(evaluateRuntimeTaskTransition({from:"completed",to:"running"}).allowed, false);
});

test("uncertain outcome can only leave through verified reconciliation", () => {
  assert.equal(evaluateRuntimeTaskTransition({from:"outcome_uncertain",to:"completed"}).reasonCode,
    "AUTHORITATIVE_RECONCILIATION_REQUIRED");
  assert.equal(evaluateRuntimeTaskTransition({from:"outcome_uncertain",to:"running",reconciliationVerified:true}).allowed, false);
  assert.equal(evaluateRuntimeTaskTransition({from:"outcome_uncertain",to:"completed",reconciliationVerified:true}).allowed, true);
});

test("blocks retry for unknown or already-applied provider outcomes", () => {
  const base = { priorState:"outcome_uncertain", providerOutcome:"UNKNOWN",
    idempotencyKey:"idem-key-0001", retryIdempotencyKey:"idem-key-0001",
    sameCanonicalOperation:true, naturallyIdempotent:false };
  assert.equal(evaluateExecutionRetry(base).reasonCode, "OUTCOME_RECONCILIATION_REQUIRED");
  assert.equal(evaluateExecutionRetry({...base, priorState:"failed", providerOutcome:"CONFIRMED_APPLIED"}).reasonCode,
    "PRIOR_SIDE_EFFECT_ALREADY_APPLIED");
});

test("allows retry only with known-safe outcome and identical operation binding", () => {
  const base = { priorState:"failed", providerOutcome:"CONFIRMED_NOT_APPLIED",
    idempotencyKey:"idem-key-0001", retryIdempotencyKey:"idem-key-0001",
    sameCanonicalOperation:true, naturallyIdempotent:false };
  assert.equal(evaluateExecutionRetry(base).allowed, true);
  assert.equal(evaluateExecutionRetry({...base, retryIdempotencyKey:"different-key"}).reasonCode,
    "RETRY_BINDING_MISMATCH");
});
