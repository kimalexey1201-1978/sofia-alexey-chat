import test from "node:test";
import assert from "node:assert/strict";
import { createInferencePlan, completeInferencePlan, validateTaskPlan } from "../../src/core/task-planner.mjs";

test("creates a bounded A0 FREE_ONLY inference plan", () => {
  const plan = createInferencePlan([
    { role: "assistant", content: "Привет" },
    { role: "user", content: "Помоги разобраться." }
  ], new Date("2026-11-20T14:00:00.000Z"));
  assert.equal(plan.owner_goal, "Помоги разобраться.");
  assert.equal(plan.autonomy_level, "A0");
  assert.equal(plan.resource_policy, "FREE_ONLY");
  assert.equal(plan.status, "running");
  assert.equal(plan.steps.length, 1);
  assert.deepEqual(plan.steps[0].depends_on, []);
  assert.deepEqual(plan.steps[0].required_capabilities, []);
  assert.equal(validateTaskPlan(plan).ok, true);
});

test("rejects duplicate step identifiers", () => {
  const plan = createInferencePlan([{ role: "user", content: "Test" }]);
  plan.steps.push({ ...plan.steps[0] });
  assert.equal(validateTaskPlan(plan).code, "INVALID_STEP_FIELDS");
});

test("rejects missing dependencies and cycles", () => {
  const plan = createInferencePlan([{ role: "user", content: "Test" }]);
  plan.steps[0].depends_on = ["missing"];
  assert.equal(validateTaskPlan(plan).code, "MISSING_OR_SELF_DEPENDENCY");
  const cyclic = createInferencePlan([{ role: "user", content: "Test" }]);
  cyclic.steps.push({ ...cyclic.steps[0], step_id: "second", depends_on: ["respond"] });
  cyclic.steps[0].depends_on = ["second"];
  assert.equal(validateTaskPlan(cyclic).code, "PLAN_CYCLE_DETECTED");
});

test("rejects plans that exceed the bounded goal size", () => {
  const plan = createInferencePlan([{ role: "user", content: "Test" }]);
  plan.owner_goal = "x".repeat(4001);
  assert.equal(validateTaskPlan(plan).code, "INVALID_PLAN_FIELDS");
});

test("completes the plan only after a non-empty verified response", () => {
  const plan = createInferencePlan([{ role: "user", content: "Test" }]);
  const rejected = completeInferencePlan(plan, "   ");
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "EMPTY_VERIFIED_RESPONSE");
  const completed = completeInferencePlan(plan, "Готово");
  assert.equal(completed.ok, true);
  assert.equal(completed.plan.status, "completed");
  assert.equal(completed.plan.steps[0].status, "succeeded");
  assert.equal(plan.status, "running");
});
