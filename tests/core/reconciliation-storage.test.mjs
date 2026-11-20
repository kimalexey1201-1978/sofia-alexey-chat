import test from "node:test";
import assert from "node:assert/strict";
import { createInMemoryReconciliationStore } from "../../src/core/reconciliation-storage.mjs";

const now = "2026-11-20T15:00:00.000Z";
function task() {
  return { task_id:"task-0001", state:"outcome_uncertain", version:1,
    current_request_id:"request-0001", correlation_id:"corr-0001",
    created_at:now, updated_at:now };
}
function evidence(digest = "a".repeat(64)) {
  return { task_id:"task-0001", request_id:"request-0001",
    evidence_digest:digest, evidence_ref:"provider:evidence:1",
    conclusion:"CONFIRMED_APPLIED" };
}
function commitInput(lease, overrides = {}) {
  const decision = {
    decision_id:"decision-0001", task_id:"task-0001", request_id:"request-0001",
    task_version_before:1, task_version_after:2,
    conclusion:"CONFIRMED_APPLIED", reason_code:"CONFIRMED_APPLIED",
    evidence_set_digest:"b".repeat(64), policy_version:"1.0.0",
    decided_at:now, reconciler_ref:"reconciler:test"
  };
  const auditEvent = {
    event_id:"event-0001", aggregate_id:"task-0001", aggregate_version:2,
    event_type:"reconciliation.confirmed_applied",
    payload:{conclusion:"CONFIRMED_APPLIED",reason_code:"CONFIRMED_APPLIED",
      evidence_set_digest:"b".repeat(64)},
    created_at:now, delivery_state:"pending", attempt_count:0
  };
  return {
    taskId:"task-0001", expectedVersion:1, leaseOwner:lease.lease_owner,
    fencingToken:lease.fencing_token, now, evidenceRecords:[evidence()],
    decision, auditEvent, ...overrides
  };
}
async function preparedStore() {
  const store=createInMemoryReconciliationStore();
  await store.seedTask(task());
  const lease=await store.acquireLease({taskId:"task-0001",owner:"worker-a",now,ttlMs:30000});
  return {store,lease};
}

test("commits task transition, evidence, decision and outbox atomically", async () => {
  const {store,lease}=await preparedStore();
  const result=await store.commitDecision(commitInput(lease));
  assert.equal(result.committed,true);
  assert.equal(result.task.state,"completed");
  assert.equal(result.task.version,2);
  assert.equal((await store.listEvidence("task-0001")).length,1);
  assert.equal((await store.listDecisions("task-0001")).length,1);
  assert.equal((await store.listOutbox()).length,1);
});

test("compare-and-swap allows only one concurrent decision", async () => {
  const {store,lease}=await preparedStore();
  const a=commitInput(lease);
  const b=commitInput(lease,{decision:{...a.decision,decision_id:"decision-0002"},
    auditEvent:{...a.auditEvent,event_id:"event-0002"}});
  const results=await Promise.all([store.commitDecision(a),store.commitDecision(b)]);
  assert.equal(results.filter(x=>x.committed).length,1);
  assert.equal((await store.getTask("task-0001")).version,2);
  assert.equal((await store.listDecisions("task-0001")).length,1);
});

test("rejects stale fencing token after lease reacquisition", async () => {
  const {store,lease}=await preparedStore();
  const later="2026-11-20T15:00:31.000Z";
  const next=await store.acquireLease({taskId:"task-0001",owner:"worker-b",now:later,ttlMs:30000});
  assert.ok(next.fencing_token>lease.fencing_token);
  const result=await store.commitDecision(commitInput(lease,{now:later}));
  assert.equal(result.reasonCode,"LEASE_FENCING_REJECTED");
});

test("keeps task unchanged when evidence digest conflicts", async () => {
  const {store,lease}=await preparedStore();
  const conflicting={...evidence(),conclusion:"CONFIRMED_NOT_APPLIED"};
  const result=await store.commitDecision(commitInput(lease,{
    evidenceRecords:[evidence(),conflicting]
  }));
  assert.equal(result.committed,false);
  assert.equal(result.reasonCode,"EVIDENCE_DIGEST_CONFLICT");
  assert.equal((await store.getTask("task-0001")).state,"outcome_uncertain");
  assert.equal((await store.listDecisions("task-0001")).length,0);
  assert.equal((await store.listOutbox()).length,0);
});

test("unknown decision appends audit evidence but preserves state and version", async () => {
  const {store,lease}=await preparedStore();
  const input=commitInput(lease);
  input.decision={...input.decision,decision_id:"decision-unknown",
    conclusion:"STILL_UNKNOWN",reason_code:"PROVIDER_STATE_STILL_UNKNOWN",
    task_version_after:1};
  input.auditEvent={...input.auditEvent,event_id:"event-unknown",
    event_type:"reconciliation.still_unknown",aggregate_version:1,
    payload:{conclusion:"STILL_UNKNOWN",reason_code:"PROVIDER_STATE_STILL_UNKNOWN",
      evidence_set_digest:"b".repeat(64)}};
  const result=await store.commitDecision(input);
  assert.equal(result.committed,true);
  assert.equal(result.task.state,"outcome_uncertain");
  assert.equal(result.task.version,1);
  assert.equal((await store.listOutbox()).length,1);
});

test("rejects expired lease and stale task version", async () => {
  const {store,lease}=await preparedStore();
  const expired=await store.commitDecision(commitInput(lease,{now:"2026-11-20T15:00:31.000Z"}));
  assert.equal(expired.reasonCode,"LEASE_FENCING_REJECTED");
  const conflict=await store.commitDecision(commitInput(lease,{expectedVersion:2}));
  assert.equal(conflict.reasonCode,"TASK_VERSION_CONFLICT");
});

test("deduplicates exact evidence delivery", async () => {
  const {store,lease}=await preparedStore();
  const input=commitInput(lease);
  input.evidenceRecords=[evidence(),evidence()];
  const result=await store.commitDecision(input);
  assert.equal(result.committed,true);
  assert.equal((await store.listEvidence("task-0001")).length,1);
});


test("fencing tokens remain monotonic after explicit lease release", async () => {
  const {store,lease}=await preparedStore();
  assert.equal(await store.releaseLease({taskId:"task-0001",owner:lease.lease_owner,
    fencingToken:lease.fencing_token}),true);
  const next=await store.acquireLease({taskId:"task-0001",owner:"worker-b",
    now:"2026-11-20T15:00:01.000Z",ttlMs:30000});
  assert.equal(next.fencing_token,lease.fencing_token+1);
});

test("expired lease replacement increments the persistent fencing generation", async () => {
  const {store,lease}=await preparedStore();
  const next=await store.acquireLease({taskId:"task-0001",owner:"worker-b",
    now:"2026-11-20T15:00:31.000Z",ttlMs:30000});
  assert.equal(next.fencing_token,lease.fencing_token+1);
});

test("rejects duplicate decision and outbox identifiers without partial mutation", async () => {
  const {store,lease}=await preparedStore();
  const first=commitInput(lease);
  first.decision={...first.decision,conclusion:"STILL_UNKNOWN",
    reason_code:"PROVIDER_STATE_STILL_UNKNOWN",task_version_after:1};
  first.auditEvent={...first.auditEvent,event_type:"reconciliation.still_unknown",
    aggregate_version:1,payload:{conclusion:"STILL_UNKNOWN",
      reason_code:"PROVIDER_STATE_STILL_UNKNOWN",evidence_set_digest:"b".repeat(64)}};
  assert.equal((await store.commitDecision(first)).committed,true);
  const next=await store.acquireLease({taskId:"task-0001",owner:"worker-b",
    now:"2026-11-20T15:00:01.000Z",ttlMs:30000});
  const duplicate=commitInput(next,{now:"2026-11-20T15:00:01.000Z",
    decision:{...first.decision},auditEvent:{...first.auditEvent}});
  const result=await store.commitDecision(duplicate);
  assert.equal(result.committed,false);
  assert.equal(result.reasonCode,"DUPLICATE_COMMIT_ID");
  assert.equal((await store.listDecisions("task-0001")).length,1);
  assert.equal((await store.listOutbox()).length,1);
});


test("does not allow a second worker with the same owner identity to steal a live lease", async () => {
  const {store,lease}=await preparedStore();
  const duplicate=await store.acquireLease({taskId:"task-0001",owner:"worker-a",
    now:"2026-11-20T15:00:01.000Z",ttlMs:30000});
  assert.equal(duplicate,null);
  const renewed=await store.renewLease({taskId:"task-0001",owner:"worker-a",
    fencingToken:lease.fencing_token,now:"2026-11-20T15:00:01.000Z",ttlMs:30000});
  assert.equal(renewed.fencing_token,lease.fencing_token);
  assert.equal(renewed.renewed_at,"2026-11-20T15:00:01.000Z");
});

test("rejects lease renewal with a stale fencing token or after expiry", async () => {
  const {store,lease}=await preparedStore();
  const stale=await store.renewLease({taskId:"task-0001",owner:"worker-a",
    fencingToken:lease.fencing_token+1,now:"2026-11-20T15:00:01.000Z",ttlMs:30000});
  assert.equal(stale,null);
  const expired=await store.renewLease({taskId:"task-0001",owner:"worker-a",
    fencingToken:lease.fencing_token,now:"2026-11-20T15:00:31.000Z",ttlMs:30000});
  assert.equal(expired,null);
});

test("rejects evidence whose conclusion differs from the committed decision", async () => {
  const {store,lease}=await preparedStore();
  const result=await store.commitDecision(commitInput(lease,{
    evidenceRecords:[{...evidence(),conclusion:"CONFIRMED_NOT_APPLIED"}]
  }));
  assert.equal(result.committed,false);
  assert.equal(result.reasonCode,"EVIDENCE_RECORD_INVALID");
  assert.equal((await store.getTask("task-0001")).version,1);
  assert.equal((await store.listEvidence("task-0001")).length,0);
});

test("rejects an audit outbox payload that does not match the decision", async () => {
  const {store,lease}=await preparedStore();
  const input=commitInput(lease);
  input.auditEvent={...input.auditEvent,payload:{
    ...input.auditEvent.payload,conclusion:"CONFIRMED_NOT_APPLIED"
  }};
  const result=await store.commitDecision(input);
  assert.equal(result.committed,false);
  assert.equal(result.reasonCode,"COMMIT_DECISION_AUDIT_BINDING_INVALID");
  assert.equal((await store.getTask("task-0001")).version,1);
  assert.equal((await store.listDecisions("task-0001")).length,0);
  assert.equal((await store.listOutbox()).length,0);
});
