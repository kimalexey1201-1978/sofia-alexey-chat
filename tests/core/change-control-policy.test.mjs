import test from "node:test";
import assert from "node:assert/strict";
import { evaluateChangeAttempt, CHANGE_ATTEMPT_LIMIT } from "../../src/core/change-control-policy.mjs";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);

function valid(overrides = {}) {
  return {
    issue_id: "issue-001",
    initial_scope_digest: A,
    proposed_scope_digest: A,
    acceptance_criteria: ["All requested checks pass", "No unrelated files change"],
    attempt_number: 1,
    proposed_change_digest: B,
    prior_change_digests: [],
    last_evidence_digest: null,
    new_evidence_digest: null,
    owner_approved_scope_expansion: false,
    acceptance_verified: false,
    verification_evidence_digest: null,
    ...overrides
  };
}

test("allows an in-scope initial change and reports the finite correction budget", () => {
  const result = evaluateChangeAttempt(valid());
  assert.equal(CHANGE_ATTEMPT_LIMIT, 3);
  assert.equal(result.allowed, true);
  assert.equal(result.attemptsRemaining, 2);
});

test("blocks an out-of-scope change without explicit owner approval", () => {
  const result = evaluateChangeAttempt(valid({ proposed_scope_digest: C }));
  assert.equal(result.allowed, false);
  assert.equal(result.decisionCode, "SCOPE_EXPANSION_REQUIRES_OWNER_APPROVAL");
});

test("allows a scope change only when owner approval is explicit", () => {
  const result = evaluateChangeAttempt(valid({
    proposed_scope_digest: C,
    owner_approved_scope_expansion: true
  }));
  assert.equal(result.allowed, true);
  assert.equal(result.scopeExpansionApproved, true);
});

test("blocks repeating the same change without materially new evidence", () => {
  const result = evaluateChangeAttempt(valid({
    proposed_change_digest: B,
    prior_change_digests: [B],
    last_evidence_digest: A,
    new_evidence_digest: A
  }));
  assert.equal(result.allowed, false);
  assert.equal(result.decisionCode, "DUPLICATE_CHANGE_WITHOUT_NEW_EVIDENCE");
});

test("allows a repeated approach only when new evidence differs", () => {
  const result = evaluateChangeAttempt(valid({
    proposed_change_digest: B,
    prior_change_digests: [B],
    last_evidence_digest: A,
    new_evidence_digest: C
  }));
  assert.equal(result.allowed, true);
});

test("halts after one initial attempt plus two corrections", () => {
  const result = evaluateChangeAttempt(valid({ attempt_number: 4 }));
  assert.equal(result.allowed, false);
  assert.equal(result.decisionCode, "ATTEMPT_LIMIT_REACHED_OWNER_REVIEW_REQUIRED");
  assert.equal(result.attemptsRemaining, 0);
});

test("closes a verified issue and prevents unnecessary further corrections", () => {
  const result = evaluateChangeAttempt(valid({
    acceptance_verified: true,
    verification_evidence_digest: C
  }));
  assert.equal(result.allowed, false);
  assert.equal(result.decisionCode, "ACCEPTANCE_ALREADY_MET");
});

test("requires evidence before treating acceptance as verified", () => {
  const result = evaluateChangeAttempt(valid({ acceptance_verified: true }));
  assert.equal(result.allowed, false);
  assert.equal(result.decisionCode, "VERIFICATION_EVIDENCE_REQUIRED");
});

test("fails closed on malformed change records", () => {
  const result = evaluateChangeAttempt(valid({ proposed_change_digest: "not-a-digest" }));
  assert.equal(result.allowed, false);
  assert.equal(result.decisionCode, "INVALID_CHANGE_INPUT");
});
