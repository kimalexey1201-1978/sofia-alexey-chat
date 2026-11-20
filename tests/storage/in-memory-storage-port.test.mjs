import test from "node:test";
import assert from "node:assert/strict";
import {InMemoryStoragePort,StorageConflictError} from "../../src/core/storage/in-memory-storage-port.mjs";

const initial = () => ({
  taskId:"task-1",state:"outcome_uncertain",version:1,currentRequestId:"request-1",
  createdAt:"2026-11-21T00:00:00.000Z",updatedAt:"2026-11-21T00:00:00.000Z"
});
const decision = (id="decision-1",conclusion="CONFIRMED_APPLIED") => ({
  decisionId:id,conclusion,reasonCode:"provider_verified",evidenceSetDigest:"set-1",
  policyVersion:"v1",decidedAt:"2026-11-21T00:01:00.000Z"
});
const evidence = (digest="e-1",content={status:"applied"}) => ({evidenceDigest:digest,canonicalContent:content});
async function setup() {
  const store = new InMemoryStoragePort();
  await store.seedTask(initial());
  const lease = await store.acquireLease({taskId:"task-1",owner:"worker-a",now:1000,ttlMs:5000});
  return {store,lease};
}
const commit = (lease,overrides={}) => ({
  taskId:"task-1",requestId:"request-1",expectedTaskVersion:1,
  leaseOwner:"worker-a",fencingToken:lease.fencingToken,now:2000,
  decision:decision(),evidence:[evidence()],...overrides
});

test("commits task, evidence, decision and outbox as one aggregate",async()=>{
  const {store,lease}=await setup();
  const result=await store.commitDecision(commit(lease));
  assert.equal(result.task.state,"confirmed_applied");
  assert.equal(result.task.version,2);
  assert.equal((await store.listEvidence("task-1")).length,1);
  assert.equal((await store.listDecisions("task-1")).length,1);
  assert.equal((await store.listOutbox()).length,1);
});

test("serializes competing compare-and-swap commits; only one wins",async()=>{
  const {store,lease}=await setup();
  const results=await Promise.allSettled([
    store.commitDecision(commit(lease)),
    store.commitDecision(commit(lease,{decision:decision("decision-2")}))
  ]);
  assert.equal(results.filter(x=>x.status==="fulfilled").length,1);
  assert.equal(results.filter(x=>x.status==="rejected").length,1);
});

test("rejects stale fencing token after lease expiry and reacquisition",async()=>{
  const {store,lease}=await setup();
  const newer=await store.acquireLease({taskId:"task-1",owner:"worker-b",now:7000,ttlMs:5000});
  assert.ok(newer.fencingToken>lease.fencingToken);
  await assert.rejects(store.commitDecision(commit(lease)),e=>e.code==="STALE_FENCE");
});

test("deduplicates exact duplicate evidence",async()=>{
  const {store,lease}=await setup();
  const result=await store.commitDecision(commit(lease,{evidence:[evidence(),evidence()]}));
  assert.equal(result.insertedEvidence,1);
  assert.equal((await store.listEvidence("task-1")).length,1);
});

test("same digest with different content rejects without partial writes",async()=>{
  const {store,lease}=await setup();
  await assert.rejects(store.commitDecision(commit(lease,{
    evidence:[evidence("same",{a:1}),evidence("same",{a:2})]
  })),e=>e.code==="EVIDENCE_DIGEST_CONFLICT");
  assert.equal((await store.getTask("task-1")).version,1);
  assert.equal((await store.listEvidence("task-1")).length,0);
  assert.equal((await store.listDecisions("task-1")).length,0);
  assert.equal((await store.listOutbox()).length,0);
});

test("rejects stale request and task version",async()=>{
  const {store,lease}=await setup();
  await assert.rejects(store.commitDecision(commit(lease,{requestId:"old-request"})),e=>e.code==="REQUEST_MISMATCH");
  await assert.rejects(store.commitDecision(commit(lease,{expectedTaskVersion:9})),e=>e.code==="VERSION_CONFLICT");
});

test("release does not reset fencing generation",async()=>{
  const {store,lease}=await setup();
  assert.equal(await store.releaseLease({taskId:"task-1",owner:"worker-a",fencingToken:lease.fencingToken}),true);
  const next=await store.acquireLease({taskId:"task-1",owner:"worker-b",now:3000,ttlMs:5000});
  assert.ok(next.fencingToken>lease.fencingToken);
});

test("STILL_UNKNOWN records evidence and decision without resolving task",async()=>{
  const {store,lease}=await setup();
  const result=await store.commitDecision(commit(lease,{decision:decision("unknown-1","STILL_UNKNOWN")}));
  assert.equal(result.task.state,"outcome_uncertain");
  assert.equal(result.task.version,1);
  assert.equal((await store.listOutbox()).length,1);
});
