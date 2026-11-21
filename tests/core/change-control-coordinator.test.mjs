import test from "node:test";
import assert from "node:assert/strict";
import { createChangeControlCoordinator } from "../../src/core/change-control-coordinator.mjs";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
function createStore() {
  const records = new Map();
  let queue = Promise.resolve();
  return {
    async transact(id, updater) {
      const operation = queue.then(() => {
        const outcome = updater(records.get(id) ?? null);
        if (outcome.state) records.set(id, structuredClone(outcome.state));
        return structuredClone(outcome.result);
      });
      queue = operation.catch(() => {});
      return operation;
    },
    get(id) { return structuredClone(records.get(id) ?? null); }
  };
}
function proposal(overrides = {}) {
  return {
    issue_id: "issue-001",
    proposed_scope_digest: A,
    acceptance_criteria: ["requested result verified", "no unrelated changes"],
    proposed_change_digest: B,
    new_evidence_digest: C,
    owner_approved_scope_expansion: false,
    attempted_at: "2026-11-21T08:00:00.000Z",
    ...overrides
  };
}

test("persists bounded attempts and prevents a fourth attempt", async () => {
  const store = createStore();
  const coordinator = createChangeControlCoordinator({ store });
  for (let i = 0; i < 3; i++) {
    const result = await coordinator.propose(proposal({
      proposed_change_digest: (i + 1).toString(16).padStart(64, "0"),
      new_evidence_digest: (i + 4).toString(16).padStart(64, "0")
    }));
    assert.equal(result.allowed, true);
  }
  const blocked = await coordinator.propose(proposal({
    proposed_change_digest: "d".repeat(64),
    new_evidence_digest: "e".repeat(64)
  }));
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.decisionCode, "ATTEMPT_LIMIT_REACHED_OWNER_REVIEW_REQUIRED");
  assert.equal(store.get("issue-001").attempts, 3);
});

test("freezes initial scope and acceptance criteria", async () => {
  const store = createStore();
  const coordinator = createChangeControlCoordinator({ store });
  assert.equal((await coordinator.propose(proposal())).allowed, true);
  const changedCriteria = await coordinator.propose(proposal({
    proposed_change_digest: "d".repeat(64),
    acceptance_criteria: ["different goal"]
  }));
  assert.equal(changedCriteria.decisionCode, "ISSUE_BASELINE_MISMATCH");
  assert.equal(store.get("issue-001").attempts, 1);
});

test("serializes concurrent proposals so the attempt limit cannot be bypassed", async () => {
  const store = createStore();
  const coordinator = createChangeControlCoordinator({ store });
  const results = await Promise.all([
    coordinator.propose(proposal({ proposed_change_digest: "1".repeat(64) })),
    coordinator.propose(proposal({ proposed_change_digest: "2".repeat(64) })),
    coordinator.propose(proposal({ proposed_change_digest: "3".repeat(64) })),
    coordinator.propose(proposal({ proposed_change_digest: "4".repeat(64) }))
  ]);
  assert.equal(results.filter(x => x.allowed).length, 3);
  assert.equal(results.filter(x => x.decisionCode === "ATTEMPT_LIMIT_REACHED_OWNER_REVIEW_REQUIRED").length, 1);
  assert.equal(store.get("issue-001").attempts, 3);
});

test("closes only with verification evidence and rejects later changes", async () => {
  const store = createStore();
  const coordinator = createChangeControlCoordinator({ store });
  await coordinator.propose(proposal());
  const missing = await coordinator.close({ issue_id: "issue-001" });
  assert.equal(missing.closed, false);
  const closed = await coordinator.close({
    issue_id: "issue-001",
    verification_evidence_digest: "f".repeat(64)
  });
  assert.equal(closed.closed, true);
  const later = await coordinator.propose(proposal({
    proposed_change_digest: "9".repeat(64),
    new_evidence_digest: "8".repeat(64)
  }));
  assert.equal(later.decisionCode, "ISSUE_NOT_OPEN");
});

test("requires a host-provided atomic store", () => {
  assert.throws(() => createChangeControlCoordinator(), /ATOMIC_CHANGE_CONTROL_STORE_REQUIRED/);
});
