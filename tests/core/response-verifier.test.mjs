import test from "node:test";
import assert from "node:assert/strict";
import { createInferencePlan } from "../../src/core/task-planner.mjs";
import { verifyInferenceResult } from "../../src/core/response-verifier.mjs";

const messages = [{ role: "user", content: "Explain the test." }];
const result = { text: "A bounded response.", providerId: "openrouter", modelId: "free-model" };

test("accepts a bounded A0 inference result and states factual accuracy is not assessed", () => {
  const plan = createInferencePlan(messages);
  const checked = verifyInferenceResult(plan, result, { maxResponseChars: 100 });
  assert.equal(checked.ok, true);
  assert.equal(checked.evidence.factualAccuracyAssessed, false);
  assert.ok(checked.evidence.checks.includes("no_external_capabilities"));
});

test("rejects empty responses and oversized responses", () => {
  const plan = createInferencePlan(messages);
  assert.equal(verifyInferenceResult(plan, { ...result, text: " " }).code, "EMPTY_OR_INVALID_RESPONSE");
  assert.equal(verifyInferenceResult(plan, result, { maxResponseChars: 5 }).code, "RESPONSE_OUT_OF_BOUNDS");
});

test("rejects plans that include external capabilities", () => {
  const plan = createInferencePlan(messages);
  plan.steps[0].required_capabilities = ["device.camera.read"];
  assert.equal(verifyInferenceResult(plan, result).code, "UNAUTHORIZED_INFERENCE_STEP");
});

test("rejects missing provider provenance", () => {
  const plan = createInferencePlan(messages);
  assert.equal(verifyInferenceResult(plan, { ...result, providerId: "" }).code, "MISSING_PROVIDER_PROVENANCE");
});

test("rejects non-running or multi-step plans", () => {
  const plan = createInferencePlan(messages);
  plan.status = "completed";
  assert.equal(verifyInferenceResult(plan, result).code, "PLAN_OUTSIDE_INFERENCE_POLICY");
});
