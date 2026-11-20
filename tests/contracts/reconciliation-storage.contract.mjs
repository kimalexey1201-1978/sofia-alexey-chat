import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { computeEvidenceSetDigest } from "../../src/core/reconciliation-storage.mjs";

/**
 * Reusable behavioral contract for any reconciliation storage adapter.
 *
 * Adapter requirements:
 * - createStore({ testId }) returns a fresh isolated store.
 * - optional reopenStore({ testId }) reopens the same durable namespace after
 *   the first store instance is discarded. This enables restart-persistence
 *   verification without making the in-memory test double pretend to persist.
 * - optional cleanup({ testId }) removes the test namespace.
 *
 * The suite intentionally tests only the public storage-port methods.
 */
export function defineReconciliationStorageContract({
  name = "reconciliation storage adapter",
  createStore,
  reopenStore,
  cleanup
} = {}) {
  if (typeof createStore !== "function") {
    throw new TypeError("STORAGE_CONTRACT_CREATE_STORE_REQUIRED");
  }

  describe(name, () => {
    let sequence = 0;
    async function withStore(run) {
      const testId = `${name.replace(/[^a-z0-9]+/gi, "-")}-${++sequence}`;
      let store;
      try {
        store = await createStore({ testId });
        await store.seedTask({
          task_id: "task-contract",
          state: "outcome_uncertain",
          version: 1,
          current_request_id: "request-contract",
          created_at: "2026-11-20T15:00:00.000Z",
          updated_at: "2026-11-20T15:00:00.000Z"
        });
        await run({ store, testId });
      } finally {
        if (typeof cleanup === "function") await cleanup({ testId });
      }
    }

    async function makeCommit(lease, overrides = {}) {
      const evidence = {
        task_id: "task-contract",
        request_id: "request-contract",
        evidence_digest: "a".repeat(64),
        evidence_ref: "provider:evidence:contract",
        conclusion: "CONFIRMED_APPLIED"
      };
      const evidenceRecords = overrides.evidenceRecords ?? [evidence];
      const evidenceSetDigest = await computeEvidenceSetDigest(evidenceRecords);
      const decision = {
        decision_id: "decision-contract",
        task_id: "task-contract",
        request_id: "request-contract",
        task_version_before: 1,
        task_version_after: 2,
        conclusion: "CONFIRMED_APPLIED",
        reason_code: "CONFIRMED_APPLIED",
        evidence_set_digest: evidenceSetDigest,
        policy_version: "1.0.0",
        decided_at: "2026-11-20T15:00:00.000Z",
        reconciler_ref: "contract-suite"
      };
      const auditEvent = {
        event_id: "event-contract",
        aggregate_id: "task-contract",
        aggregate_version: 2,
        event_type: "reconciliation.confirmed_applied",
        payload: {
          conclusion: "CONFIRMED_APPLIED",
          reason_code: "CONFIRMED_APPLIED",
          evidence_set_digest: evidenceSetDigest
        },
        created_at: "2026-11-20T15:00:00.000Z",
        delivery_state: "pending",
        attempt_count: 0
      };
      return {
        taskId: "task-contract",
        expectedVersion: 1,
        leaseOwner: lease.lease_owner,
        fencingToken: lease.fencing_token,
        now: "2026-11-20T15:00:00.000Z",
        evidenceRecords,
        decision,
        auditEvent,
        ...overrides
      };
    }

    test("atomically commits state, evidence, decision and audit outbox", async () => {
      await withStore(async ({ store }) => {
        const lease = await store.acquireLease({
          taskId: "task-contract", owner: "worker-a",
          now: "2026-11-20T15:00:00.000Z", ttlMs: 30000
        });
        assert.ok(lease);
        const result = await store.commitDecision(await makeCommit(lease));
        assert.equal(result.committed, true);
        assert.equal(result.task.state, "completed");
        assert.equal(result.task.version, 2);
        assert.equal((await store.listEvidence("task-contract")).length, 1);
        assert.equal((await store.listDecisions("task-contract")).length, 1);
        assert.equal((await store.listOutbox()).length, 1);
      });
    });

    test("compare-and-swap permits only one concurrent terminal decision", async () => {
      await withStore(async ({ store }) => {
        const lease = await store.acquireLease({
          taskId: "task-contract", owner: "worker-a",
          now: "2026-11-20T15:00:00.000Z", ttlMs: 30000
        });
        const first = await makeCommit(lease);
        const second = makeCommit(lease, {
          decision: { ...first.decision, decision_id: "decision-second" },
          auditEvent: { ...first.auditEvent, event_id: "event-second" }
        });
        const results = await Promise.all([
          store.commitDecision(first), store.commitDecision(second)
        ]);
        assert.equal(results.filter(item => item.committed).length, 1);
        assert.equal((await store.getTask("task-contract")).version, 2);
        assert.equal((await store.listDecisions("task-contract")).length, 1);
      });
    });

    test("rejects an expired lease and stale fencing token", async () => {
      await withStore(async ({ store }) => {
        const first = await store.acquireLease({
          taskId: "task-contract", owner: "worker-a",
          now: "2026-11-20T15:00:00.000Z", ttlMs: 30000
        });
        const second = await store.acquireLease({
          taskId: "task-contract", owner: "worker-b",
          now: "2026-11-20T15:00:31.000Z", ttlMs: 30000
        });
        assert.ok(second.fencing_token > first.fencing_token);
        const result = await store.commitDecision(await makeCommit(first, {
          now: "2026-11-20T15:00:31.000Z"
        }));
        assert.equal(result.committed, false);
        assert.equal(result.reasonCode, "LEASE_FENCING_REJECTED");
        assert.equal((await store.getTask("task-contract")).state, "outcome_uncertain");
      });
    });

    test("deduplicates exact evidence and rejects digest/content conflicts", async () => {
      await withStore(async ({ store }) => {
        const lease = await store.acquireLease({
          taskId: "task-contract", owner: "worker-a",
          now: "2026-11-20T15:00:00.000Z", ttlMs: 30000
        });
        const input = await makeCommit(lease);
        input.evidenceRecords = [input.evidenceRecords[0], { ...input.evidenceRecords[0] }];
        const result = await store.commitDecision(input);
        assert.equal(result.committed, true);
        assert.equal((await store.listEvidence("task-contract")).length, 1);
      });
      await withStore(async ({ store }) => {
        const lease = await store.acquireLease({
          taskId: "task-contract", owner: "worker-a",
          now: "2026-11-20T15:00:00.000Z", ttlMs: 30000
        });
        const input = await makeCommit(lease);
        input.evidenceRecords.push({
          ...input.evidenceRecords[0], conclusion: "CONFIRMED_NOT_APPLIED"
        });
        const result = await store.commitDecision(input);
        assert.equal(result.committed, false);
        assert.equal(result.reasonCode, "EVIDENCE_DIGEST_CONFLICT");
        assert.equal((await store.getTask("task-contract")).state, "outcome_uncertain");
        assert.equal((await store.listDecisions("task-contract")).length, 0);
        assert.equal((await store.listOutbox()).length, 0);
      });
    });

    test("keeps STILL_UNKNOWN auditable without advancing task version", async () => {
      await withStore(async ({ store }) => {
        const lease = await store.acquireLease({
          taskId: "task-contract", owner: "worker-a",
          now: "2026-11-20T15:00:00.000Z", ttlMs: 30000
        });
        const input = await makeCommit(lease);
        input.evidenceRecords[0].conclusion = "STILL_UNKNOWN";
        input.decision.evidence_set_digest = await computeEvidenceSetDigest(input.evidenceRecords);
        input.decision = {
          ...input.decision,
          decision_id: "decision-unknown",
          conclusion: "STILL_UNKNOWN",
          reason_code: "PROVIDER_STATE_STILL_UNKNOWN",
          task_version_after: 1
        };
        input.auditEvent = {
          ...input.auditEvent,
          event_id: "event-unknown",
          aggregate_version: 1,
          event_type: "reconciliation.still_unknown",
          payload: {
            conclusion: "STILL_UNKNOWN",
            reason_code: "PROVIDER_STATE_STILL_UNKNOWN",
            evidence_set_digest: input.decision.evidence_set_digest
          }
        };
        const result = await store.commitDecision(input);
        assert.equal(result.committed, true);
        assert.equal(result.task.state, "outcome_uncertain");
        assert.equal(result.task.version, 1);
        assert.equal((await store.listOutbox()).length, 1);
      });
    });

    if (typeof reopenStore === "function") {
      test("retains committed task and ledger records after store reopen", async () => {
        const testId = `${name.replace(/[^a-z0-9]+/gi, "-")}-restart-${++sequence}`;
        let store = await createStore({ testId });
        try {
          await store.seedTask({
            task_id: "task-restart",
            state: "outcome_uncertain",
            version: 1,
            current_request_id: "request-restart",
            created_at: "2026-11-20T15:00:00.000Z",
            updated_at: "2026-11-20T15:00:00.000Z"
          });
          const lease = await store.acquireLease({
            taskId: "task-restart", owner: "worker-a",
            now: "2026-11-20T15:00:00.000Z", ttlMs: 30000
          });
          assert.ok(lease);
          store = null; // discard the original adapter instance before reopening
          const reopened = await reopenStore({ testId });
          const task = await reopened.getTask("task-restart");
          assert.equal(task.state, "outcome_uncertain");
          assert.equal(task.version, 1);
          const nextLease = await reopened.acquireLease({
            taskId: "task-restart", owner: "worker-b",
            now: "2026-11-20T15:00:31.000Z", ttlMs: 30000
          });
          assert.ok(nextLease);
          assert.ok(nextLease.fencing_token > lease.fencing_token);
        } finally {
          if (typeof cleanup === "function") await cleanup({ testId });
        }
      });

      test("retains committed evidence, decision and outbox after store reopen", async () => {
        const testId = `${name.replace(/[^a-z0-9]+/gi, "-")}-ledger-restart-${++sequence}`;
        let store = await createStore({ testId });
        try {
          await store.seedTask({
            task_id: "task-ledger-restart",
            state: "outcome_uncertain",
            version: 1,
            current_request_id: "request-ledger-restart",
            created_at: "2026-11-20T15:00:00.000Z",
            updated_at: "2026-11-20T15:00:00.000Z"
          });
          const lease = await store.acquireLease({
            taskId: "task-ledger-restart", owner: "worker-ledger",
            now: "2026-11-20T15:00:00.000Z", ttlMs: 30000
          });
          assert.ok(lease);
          const evidence = {
            task_id: "task-ledger-restart",
            request_id: "request-ledger-restart",
            evidence_digest: "c".repeat(64),
            evidence_ref: "provider:evidence:ledger-restart",
            conclusion: "CONFIRMED_APPLIED"
          };
          const evidenceSetDigest = await computeEvidenceSetDigest([evidence]);
          const decision = {
            decision_id: "decision-ledger-restart",
            task_id: "task-ledger-restart",
            request_id: "request-ledger-restart",
            task_version_before: 1,
            task_version_after: 2,
            conclusion: "CONFIRMED_APPLIED",
            reason_code: "CONFIRMED_APPLIED",
            evidence_set_digest: evidenceSetDigest,
            policy_version: "1.0.0",
            decided_at: "2026-11-20T15:00:00.000Z",
            reconciler_ref: "contract-suite"
          };
          const auditEvent = {
            event_id: "event-ledger-restart",
            aggregate_id: "task-ledger-restart",
            aggregate_version: 2,
            event_type: "reconciliation.confirmed_applied",
            payload: {
              conclusion: "CONFIRMED_APPLIED",
              reason_code: "CONFIRMED_APPLIED",
              evidence_set_digest: evidenceSetDigest
            },
            created_at: "2026-11-20T15:00:00.000Z",
            delivery_state: "pending",
            attempt_count: 0
          };
          const committed = await store.commitDecision({
            taskId: "task-ledger-restart",
            expectedVersion: 1,
            leaseOwner: lease.lease_owner,
            fencingToken: lease.fencing_token,
            now: "2026-11-20T15:00:00.000Z",
            evidenceRecords: [evidence], decision, auditEvent
          });
          assert.equal(committed.committed, true);
          store = null; // discard the original adapter instance before reopening
          const reopened = await reopenStore({ testId });
          const task = await reopened.getTask("task-ledger-restart");
          assert.equal(task.state, "completed");
          assert.equal(task.version, 2);
          assert.equal((await reopened.listEvidence("task-ledger-restart")).length, 1);
          assert.equal((await reopened.listDecisions("task-ledger-restart")).length, 1);
          const outbox = await reopened.listOutbox();
          assert.equal(outbox.length, 1);
          assert.equal(outbox[0].event_id, "event-ledger-restart");
        } finally {
          if (typeof cleanup === "function") await cleanup({ testId });
        }
      });
    }
  });
}


    test("does not resolve a task from multiple distinct evidence records", async () => {
      await withStore(async ({ store }) => {
        const lease = await store.acquireLease({ taskId: "task-contract", owner: "worker-a", now: "2026-11-20T15:00:00.000Z", ttlMs: 30000 });
        const first = { task_id: "task-contract", request_id: "request-contract", evidence_digest: "a".repeat(64), evidence_ref: "provider:evidence:1", conclusion: "CONFIRMED_APPLIED" };
        const second = { ...first, evidence_digest: "c".repeat(64), evidence_ref: "provider:evidence:2" };
        const input = await makeCommit(lease, { evidenceRecords: [first, second] });
        const result = await store.commitDecision(input);
        assert.equal(result.committed, false);
        assert.equal(result.reasonCode, "MULTIPLE_DISTINCT_EVIDENCE_RECORDS");
        assert.equal((await store.getTask("task-contract")).state, "outcome_uncertain");
      });
    });
