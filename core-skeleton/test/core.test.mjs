import test from "node:test";
import assert from "node:assert/strict";
import { AgentRegistry } from "../src/registry/agent-registry.mjs";
import { ExecutorGateway } from "../src/gateway/executor-gateway.mjs";
import { Orchestrator } from "../src/core/orchestrator.mjs";

const task = () => ({
  protocol: "sofia.task.v1",
  task_id: "task-001",
  session_id: "session-001",
  created_at: new Date().toISOString(),
  type: "text_generation",
  priority: "normal",
  input: { content: "Hello Sofia", format: "text" },
  constraints: { timeout_ms: 1000 }
});

function setup({ allowed = true, passed = true } = {}) {
  const registry = new AgentRegistry();
  registry.register(
    { id: "test-llm", version: "0.1.0", capabilities: ["text_generation"], enabled: true },
    { execute: async () => ({ content: "Hello from test executor" }) }
  );
  return new Orchestrator({
    registry,
    gateway: new ExecutorGateway(),
    security: { authorize: async () => ({ allowed }) },
    critic: { verify: async () => ({ passed }) }
  });
}

test("runs a valid task through executor and verifier", async () => {
  const result = await setup().run(task());
  assert.equal(result.status, "completed");
  assert.equal(result.executor_id, "test-llm");
});

test("rejects invalid task envelopes", async () => {
  const result = await setup().run({ protocol: "wrong" });
  assert.equal(result.status, "failed");
  assert.ok(result.errors.includes("Unsupported protocol"));
});

test("denies execution when authorization fails", async () => {
  const result = await setup({ allowed: false }).run(task());
  assert.equal(result.status, "failed");
  assert.deepEqual(result.errors, ["AUTH_DENIED"]);
});

test("does not return unverified output as completed", async () => {
  const result = await setup({ passed: false }).run(task());
  assert.equal(result.status, "verification_failed");
});

test("registry does not resolve disabled executors", () => {
  const registry = new AgentRegistry();
  registry.register(
    { id: "disabled", version: "1.0.0", capabilities: ["text_generation"], enabled: false },
    { execute: async () => ({}) }
  );
  assert.equal(registry.resolve("text_generation"), null);
});
