import test from "node:test";
import assert from "node:assert/strict";
import { createInMemoryReconciliationStore, computeEvidenceSetDigest } from "../../src/core/reconciliation-storage.mjs";

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
async function commitInput(lease, overrides = {}) {
  const decision = {
    decision_id:"decision-0001", task_id:"task-0001", request_id:"request-0001",
    task_version_before:1, task_version_after:2,
    conclusion:"CONFIRMED_APPLIED", reason_code:"CONFIRMED_APPLIED",
    evidence_set_digest:"", policy_version:"1.0.0",
    decided_at:now, reconciler_ref:"reconciler:test"
  };
  const evidenceRecords = overrides.evidenceRecords ?? [evidence()];
  decision.evidence_set_digest = await computeEvidenceSetDigest(evidenceRecords);
  const auditEvent = {
    event_id:"event-0001", aggregate_id:"task-0001", aggregate_version:2,
    event_type:"reconciliation.confirmed_applied",
    payload:{conclusion:"CONFIRMED_APPLIED",reason_code:"CONFIRMED_APPLIED",
      evidence_set_digest:decision.evidence_set_digest},
    created_at:now, delivery_state:"pending", attempt_count:0
  };
  return {
    taskId:"task-0001", expectedVersion:1, leaseOwner:lease.lease_owner,
    fencingToken:lease.fencing_token, now, evidenceRecords,
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
  const result=await store.commitDecision(await commitInput(lease));
  assert.equal(result.committed,true);
  assert.equal(result.task.state,"completed");
  assert.equal(result.task.version,2);
  assert.equal((await store.listEvidence("task-0001")).length,1);
  assert.equal((await store.listDecisions("task-0001")).length,1);
  assert.equal((await store.listOutbox()).length,1);
});

test("compare-and-swap allows only one concurrent decision", async () => {
  const {store,lease}=await preparedStore();
  const a=await commitInput(lease);
  const b=await commitInput(lease,{decision:{...a.decision,decision_id:"decision-0002"},
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
  const result=await store.commitDecision(await commitInput(lease,{now:later}));
  assert.equal(result.reasonCode,"LEASE_FENCING_REJECTED");
});

test("keeps task unchanged when evidence digest conflicts", async () => {
  const {store,lease}=await preparedStore();
  const conflicting={...evidence(),conclusion:"CONFIRMED_NOT_APPLIED"};
  const result=await store.commitDecision(await commitInput(lease,{
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
  const input=await commitInput(lease);
  input.decision={...input.decision,decision_id:"decision-unknown",
    conclusion:"STILL_UNKNOWN",reason_code:"PROVIDER_STATE_STILL_UNKNOWN",
    task_version_after:1};
  input.evidenceRecords=[{...evidence(),conclusion:"STILL_UNKNOWN"}];
  input.decision.evidence_set_digest=await computeEvidenceSetDigest(input.evidenceRecords);
  input.auditEvent={...input.auditEvent,event_id:"event-unknown",
    event_type:"reconciliation.still_unknown",aggregate_version:1,
    payload:{conclusion:"STILL_UNKNOWN",reason_code:"PROVIDER_STATE_STILL_UNKNOWN",
      evidence_set_digest:input.decision.evidence_set_digest}};
  const result=await store.commitDecision(input);
  assert.equal(result.committed,true);
  assert.equal(result.task.state,"outcome_uncertain");
  assert.equal(result.task.version,1);
  assert.equal((await store.listOutbox()).length,1);
});

test("rejects expired lease and stale task version", async () => {
  const {store,lease}=await preparedStore();
  const expired=await store.commitDecision(await commitInput(lease,{now:"2026-11-20T15:00:31.000Z"}));
  assert.equal(expired.reasonCode,"LEASE_FENCING_REJECTED");
  const conflict=await store.commitDecision(await commitInput(lease,{expectedVersion:2}));
  assert.equal(conflict.reasonCode,"TASK_VERSION_CONFLICT");
});

test("deduplicates exact evidence delivery", async () => {
  const {store,lease}=await preparedStore();
  const input=await commitInput(lease);
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
  const first=await commitInput(lease);
  first.decision={...first.decision,conclusion:"STILL_UNKNOWN",
    reason_code:"PROVIDER_STATE_STILL_UNKNOWN",task_version_after:1};
  first.evidenceRecords=[{...evidence(),conclusion:"STILL_UNKNOWN"}];
  first.auditEvent={...first.auditEvent,event_type:"reconciliation.still_unknown",
    aggregate_version:1,payload:{conclusion:"STILL_UNKNOWN",
      reason_code:"PROVIDER_STATE_STILL_UNKNOWN",evidence_set_digest:"b".repeat(64)}};
  assert.equal((await store.commitDecision(first)).committed,true);
  assert.equal(await store.releaseLease({taskId:"task-0001",owner:lease.lease_owner,
    fencingToken:lease.fencing_token}),true);
  const next=await store.acquireLease({taskId:"task-0001",owner:"worker-b",
    now:"2026-11-20T15:00:01.000Z",ttlMs:30000});
  const duplicate=await commitInput(next,{now:"2026-11-20T15:00:01.000Z",
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
  const result=await store.commitDecision(await commitInput(lease,{
    evidenceRecords:[{...evidence(),conclusion:"CONFIRMED_NOT_APPLIED"}]
  }));
  assert.equal(result.committed,false);
  assert.equal(result.reasonCode,"EVIDENCE_RECORD_INVALID");
  assert.equal((await store.getTask("task-0001")).version,1);
  assert.equal((await store.listEvidence("task-0001")).length,0);
});

test("rejects an audit outbox payload that does not match the decision", async () => {
  const {store,lease}=await preparedStore();
  const input=await commitInput(lease);
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


test("treats evidence with reordered object keys as an exact duplicate", async () => {
  const {store,lease}=await preparedStore();
  const input=await commitInput(lease);
  const original=evidence();
  const reordered=Object.fromEntries(Object.entries(original).reverse());
  input.evidenceRecords=[original,reordered];
  const result=await store.commitDecision(input);
  assert.equal(result.committed,true);
  assert.equal((await store.listEvidence("task-0001")).length,1);
});


test("rejects an evidence-set digest that does not match the committed records", async () => {
  const {store,lease}=await preparedStore();
  const input=await commitInput(lease);
  input.decision.evidence_set_digest="f".repeat(64);
  input.auditEvent.payload.evidence_set_digest="f".repeat(64);
  const result=await store.commitDecision(input);
  assert.equal(result.committed,false);
  assert.equal(result.reasonCode,"EVIDENCE_SET_DIGEST_MISMATCH");
  assert.equal((await store.getTask("task-0001")).version,1);
  assert.equal((await store.listEvidence("task-0001")).length,0);
});

test("does not resolve a task from multiple distinct evidence records", async () => {
  const {store,lease}=await preparedStore();
  const records=[evidence(),{...evidence("c".repeat(64)),evidence_ref:"provider:evidence:2"}];
  const input=await commitInput(lease,{evidenceRecords:records});
  const result=await store.commitDecision(input);
  assert.equal(result.committed,false);
  assert.equal(result.reasonCode,"MULTIPLE_DISTINCT_EVIDENCE_RECORDS");
  assert.equal((await store.getTask("task-0001")).state,"outcome_uncertain");
});

test("evidence-set digest is independent of record and object-key order", async () => {
  const first=evidence("a".repeat(64));
  const second={...evidence("c".repeat(64)),evidence_ref:"provider:evidence:2"};
  const reordered=Object.fromEntries(Object.entries(first).reverse());
  assert.equal(
    await computeEvidenceSetDigest([first,second]),
    await computeEvidenceSetDigest([second,reordered])
  );
});
