import test from "node:test";
import assert from "node:assert/strict";
import { evaluateMemoryWriteAdmission } from "../../src/core/memory-admission.mjs";

const NOW = "2026-11-24T01:00:00.000Z";

function makeCandidate(overrides = {}) {
  return {
    memory_id: "memory-test-001",
    schema_version: "1",
    domain: "project",
    item_type: "decision",
    memory_type: "project",
    content: "The project uses a modular core and separately registered executors.",
    source: {
      source_type: "user_approval",
      source_id: "conversation:project-decision-001",
      assertion_kind: "user_confirmed"
    },
    observed_at: NOW,
    created_at: NOW,
    status: "candidate",
    sensitivity: "personal",
    purpose: "Maintain continuity in the Sofia AI project.",
    allowed_scopes: ["project:sofia-ai"],
    retention: {
      retention_class: "project_lifecycle",
      review_at: "2027-01-01T00:00:00.000Z"
    },
    assertion_status: "owner_confirmed",
    ...overrides
  };
}

function makeInput(overrides = {}) {
  const candidate = makeCandidate();
  return {
    decisionId: "decision-test-001",
    now: NOW,
    candidate,
    policy: {
      policy_version: "1.0.0",
      persistence_enabled: true,
      allowed_memory_types: ["long_term", "episodic", "procedural", "project", "semantic"],
      allowed_sensitivities: ["public", "personal"]
    },
    retentionPolicyRef: "retention:project-lifecycle:v1",
    ownerApproval: {
      approved: true,
      approval_id: "approval-test-001",
      candidate_ref: candidate.memory_id,
      purpose: candidate.purpose,
      allowed_scopes: ["project:sofia-ai"]
    },
    ...overrides
  };
}

test("persists a valid, owner-approved project memory", () => {
  const decision = evaluateMemoryWriteAdmission(makeInput());
  assert.equal(decision.decision, "PERSIST");
  assert.equal(decision.reason_codes[0], "ADMISSION_CHECKS_PASSED");
  assert.equal(decision.owner_approval_ref, "approval-test-001");
  assert.equal(decision.retention_policy_ref, "retention:project-lifecycle:v1");
  assert.deepEqual(decision.allowed_scopes, ["project:sofia-ai"]);
});

test("rejects malformed candidates", () => {
  const input = makeInput({ candidate: { memory_id: "broken" } });
  assert.equal(evaluateMemoryWriteAdmission(input).decision, "REJECT");
});

test("rejects prohibited secret classification", () => {
  const candidate = makeCandidate({ sensitivity: "secret_prohibited" });
  const decision = evaluateMemoryWriteAdmission(makeInput({ candidate }));
  assert.equal(decision.decision, "REJECT");
  assert.equal(decision.reason_codes[0], "PROHIBITED_SECRET_CLASS");
});

test("never persists assistant-inferred content", () => {
  const candidate = makeCandidate({
    source: {
      source_type: "assistant_inference",
      source_id: "inference:001",
      assertion_kind: "assistant_inferred"
    }
  });
  const decision = evaluateMemoryWriteAdmission(makeInput({ candidate }));
  assert.equal(decision.decision, "KEEP_CANDIDATE");
  assert.equal(decision.reason_codes[0], "ASSISTANT_INFERENCE_NOT_PERSISTABLE");
});

test("keeps unverified claims as candidates even when confidence is high", () => {
  const candidate = makeCandidate({
    assertion_status: "unverified",
    confidence: 1
  });
  const decision = evaluateMemoryWriteAdmission(makeInput({ candidate }));
  assert.equal(decision.decision, "KEEP_CANDIDATE");
  assert.equal(decision.reason_codes[0], "EVIDENCE_NOT_CONFIRMED");
});

test("requires explicit owner approval before persistence", () => {
  const decision = evaluateMemoryWriteAdmission(makeInput({ ownerApproval: null }));
  assert.equal(decision.decision, "REQUIRE_OWNER_CONFIRMATION");
});

test("does not accept approval for a different candidate", () => {
  const input = makeInput();
  input.ownerApproval.candidate_ref = "some-other-memory";
  const decision = evaluateMemoryWriteAdmission(input);
  assert.equal(decision.decision, "REQUIRE_OWNER_CONFIRMATION");
});

test("does not accept approval for a different purpose or scope", () => {
  const input = makeInput();
  input.ownerApproval.purpose = "unrelated purpose";
  const decision = evaluateMemoryWriteAdmission(input);
  assert.equal(decision.decision, "REQUIRE_OWNER_CONFIRMATION");
});

test("keeps working and contextual state transient", () => {
  for (const memoryType of ["working", "contextual"]) {
    const candidate = makeCandidate({ memory_type: memoryType });
    const decision = evaluateMemoryWriteAdmission(makeInput({ candidate }));
    assert.equal(decision.decision, "TRANSIENT_ONLY");
  }
});

test("does not persist when policy is absent or disabled", () => {
  for (const policy of [null, { policy_version: "1.0.0", persistence_enabled: false }]) {
    const decision = evaluateMemoryWriteAdmission(makeInput({ policy }));
    assert.equal(decision.decision, "TRANSIENT_ONLY");
  }
});

test("rejects a project memory without a project-scoped boundary", () => {
  const candidate = makeCandidate({ allowed_scopes: ["user:global"] });
  const decision = evaluateMemoryWriteAdmission(makeInput({ candidate }));
  assert.equal(decision.decision, "REJECT");
  assert.equal(decision.reason_codes[0], "PROJECT_SCOPE_REQUIRED");
});

test("rejects a durable record without a durable retention policy reference", () => {
  const decision = evaluateMemoryWriteAdmission(makeInput({ retentionPolicyRef: "" }));
  assert.equal(decision.decision, "REJECT");
  assert.equal(decision.reason_codes[0], "RETENTION_POLICY_REFERENCE_REQUIRED");
});

test("rejects restricted sensitivity classes not explicitly allowed by policy", () => {
  const candidate = makeCandidate({ sensitivity: "sensitive" });
  const decision = evaluateMemoryWriteAdmission(makeInput({ candidate }));
  assert.equal(decision.decision, "REJECT");
  assert.equal(decision.reason_codes[0], "SENSITIVITY_CLASS_NOT_ALLOWED");
});

test("rejects disputed and deleted candidates", () => {
  for (const candidate of [
    makeCandidate({ assertion_status: "disputed" }),
    makeCandidate({ status: "deleted" })
  ]) {
    assert.equal(evaluateMemoryWriteAdmission(makeInput({ candidate })).decision, "REJECT");
  }
});

test("rejects invalid decision metadata", () => {
  const decision = evaluateMemoryWriteAdmission(makeInput({ now: "not-a-date" }));
  assert.equal(decision.decision, "REJECT");
  assert.equal(decision.reason_codes[0], "DECISION_METADATA_INVALID");
});
