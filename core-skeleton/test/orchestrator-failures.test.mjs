import test from "node:test";
import assert from "node:assert/strict";
import { AgentRegistry } from "../src/registry/agent-registry.mjs";
import { ExecutorGateway } from "../src/gateway/executor-gateway.mjs";
import { Orchestrator } from "../src/core/orchestrator.mjs";

const makeTask = (extra = {}) => ({
  protocol: "sofia.task.v1",
  task_id: "failure-test-001",
  session_id: "session-001",
  created_at: new Date().toISOString(),
  type: "text_generation",
  priority: "normal",
  input: { content: "Test" },
  constraints: { timeout_ms: 100 },
  ...extra
});

function makeOrchestrator({
  execute = async () => ({ content: "ok" }),
  authorize = async () => ({ allowed: true }),
  verify = async () => ({ passed: true }),
  enabled = true,
  capability = "text_generation"
} = {}) {
  const registry = new AgentRegistry();
  registry.register(
    { id: "test-executor", version: "1.0.0", capabilities: [capability], enabled },
    { execute }
  );
  return new Orchestrator({
    registry,
    gateway: new ExecutorGateway(),
    security: { authorize },
    critic: { verify }
  });
}

test("executor rejection is normalized as execution failure", async () => {
  const result = await makeOrchestrator({
    execute: async () => { throw new Error("provider unavailable"); }
  }).run(makeTask());
  assert.equal(result.status, "failed");
  assert.deepEqual(result.errors, ["EXECUTION_FAILED"]);
});

test("unknown capability fails without calling executor", async () => {
  let called = false;
  const orchestrator = makeOrchestrator({
    execute: async () => { called = true; return {}; },
    capability: "analysis"
  });
  const result = await orchestrator.run(makeTask());
  assert.equal(result.status, "failed");
  assert.deepEqual(result.errors, ["EXECUTOR_UNAVAILABLE"]);
  assert.equal(called, false);
});

test("disabled executor is not selected by orchestrator", async () => {
  const result = await makeOrchestrator({ enabled: false }).run(makeTask());
  assert.equal(result.status, "failed");
  assert.deepEqual(result.errors, ["EXECUTOR_UNAVAILABLE"]);
});

test("authorization exception fails closed before executor runs", async () => {
  let called = false;
  const result = await makeOrchestrator({
    authorize: async () => { throw new Error("policy service unavailable"); },
    execute: async () => { called = true; return {}; }
  }).run(makeTask());
  assert.equal(result.status, "failed");
  assert.deepEqual(result.errors, ["EXECUTION_FAILED"]);
  assert.equal(called, false);
});

test("client-supplied permission claims cannot override server authorization denial", async () => {
  const task = makeTask({ security: { allowed: true, role: "admin" } });
  const result = await makeOrchestrator({
    authorize: async () => ({ allowed: false })
  }).run(task);
  assert.equal(result.status, "failed");
  assert.deepEqual(result.errors, ["AUTH_DENIED"]);
});

test("critic exception never produces a completed result", async () => {
  const result = await makeOrchestrator({
    verify: async () => { throw new Error("critic unavailable"); }
  }).run(makeTask());
  assert.notEqual(result.status, "completed");
  assert.equal(result.status, "failed");
  assert.deepEqual(result.errors, ["EXECUTION_FAILED"]);
});

test("malformed critic response never produces a completed result", async () => {
  const result = await makeOrchestrator({
    verify: async () => ({})
  }).run(makeTask());
  assert.equal(result.status, "verification_failed");
  assert.deepEqual(result.errors, ["VERIFICATION_FAILED"]);
});

test("orchestrator reports caller cancellation as cancelled", async () => {
  const controller = new AbortController();
  const orchestrator = makeOrchestrator({
    execute: (_task, { signal }) => new Promise(resolve => {
      signal.addEventListener("abort", () => resolve({ content: "late result" }), { once: true });
    })
  });
  const pending = orchestrator.run(makeTask(), { signal: controller.signal });
  controller.abort();
  const result = await pending;
  assert.equal(result.status, "cancelled");
  assert.deepEqual(result.errors, ["EXECUTION_CANCELLED"]);
});

test("registry rejects empty, whitespace-only, and duplicate capabilities", () => {
  const registry = new AgentRegistry();
  const executor = { execute: async () => ({}) };
  for (const capabilities of [[], [""], ["   "], ["analysis", "analysis"]]) {
    assert.throws(
      () => registry.register({ id: `bad-${registry.list().length}`, version: "1.0.0", capabilities, enabled: true }, executor),
      /capabilities/
    );
  }
});

test("registry rejects duplicate executor IDs", () => {
  const registry = new AgentRegistry();
  const manifest = { id: "same-id", version: "1.0.0", capabilities: ["analysis"], enabled: true };
  registry.register(manifest, { execute: async () => ({}) });
  assert.throws(
    () => registry.register(manifest, { execute: async () => ({}) }),
    /already registered/
  );
});
