import test from "node:test";
import assert from "node:assert/strict";
import { assessExecutorCandidate, findEligibleExecutors } from "../../src/core/executor-manager.mjs";

const now = new Date("2026-11-20T15:00:00.000Z");
const candidate = () => ({
  registry: {
    module_id: "fixture.executor",
    module_version: "1.0.0",
    artifact_digest: "a".repeat(64),
    lifecycle_state: "ACTIVE",
    capability_ids: ["text.generate"],
    compatible_platforms: ["server"]
  },
  trust: {
    verdict: "TRUSTED_WITH_SCOPE",
    publisher_identity_status: "VERIFIED",
    signature_status: "VALID",
    supply_chain_status: "PASS",
    artifact_digest: "a".repeat(64),
    approved_capability_ids: ["text.generate"]
  },
  health: {
    module_id: "fixture.executor",
    module_version: "1.0.0",
    availability: "HEALTHY",
    circuit_breaker: "CLOSED",
    fresh_until: "2026-11-20T15:05:00.000Z"
  },
  provider: {
    pricing_status: "VERIFIED_FREE",
    additional_cost_minor_units: 0,
    currency: "USD"
  }
});
const task = {
  capabilityId: "text.generate",
  platform: "server",
  resourcePolicy: "FREE_ONLY",
  currency: "USD"
};

test("admits only a fully evidenced, compatible free executor candidate", () => {
  const result = assessExecutorCandidate(candidate(), task, now);
  assert.equal(result.eligible, true);
  assert.equal(result.moduleRef, "fixture.executor@1.0.0");
  assert.deepEqual(result.reasonCodes, []);
});

test("fails closed when pricing is unknown or paid", () => {
  const unknown = candidate();
  delete unknown.provider;
  assert.ok(assessExecutorCandidate(unknown, task, now).reasonCodes.includes("FREE_ONLY_COST_NOT_VERIFIED"));
  const paid = candidate();
  paid.provider.additional_cost_minor_units = 1;
  assert.ok(assessExecutorCandidate(paid, task, now).reasonCodes.includes("FREE_ONLY_COST_NOT_VERIFIED"));
});

test("excludes revoked, stale, unhealthy, or untrusted candidates", () => {
  const item = candidate();
  item.registry.lifecycle_state = "REVOKED";
  item.health.fresh_until = "2026-11-20T14:59:00.000Z";
  item.trust.signature_status = "UNKNOWN";
  const result = assessExecutorCandidate(item, task, now);
  assert.equal(result.eligible, false);
  assert.ok(result.reasonCodes.includes("MODULE_NOT_ACTIVE"));
  assert.ok(result.reasonCodes.includes("HEALTH_EVIDENCE_STALE"));
  assert.ok(result.reasonCodes.includes("ARTIFACT_SIGNATURE_NOT_VALID"));
});

test("excludes capability, platform, and digest mismatches", () => {
  const item = candidate();
  item.registry.artifact_digest = "b".repeat(64);
  const result = assessExecutorCandidate(item, { ...task, platform: "android", capabilityId: "mail.send" }, now);
  assert.equal(result.eligible, false);
  assert.ok(result.reasonCodes.includes("TRUST_DIGEST_MISMATCH"));
  assert.ok(result.reasonCodes.includes("CAPABILITY_NOT_REGISTERED"));
  assert.ok(result.reasonCodes.includes("PLATFORM_INCOMPATIBLE"));
});

test("returns explainable per-candidate assessments without dispatch", () => {
  const result = findEligibleExecutors([candidate(), candidate()], task, now);
  assert.equal(result.ok, true);
  assert.equal(result.eligibleModuleRefs.length, 2);
  assert.equal(result.assessments.length, 2);
  assert.equal(findEligibleExecutors("invalid", task, now).code, "INVALID_CANDIDATE_LIST");
});
