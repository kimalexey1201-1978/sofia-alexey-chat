import { validateTaskPlan } from "./task-planner.mjs";

/**
 * Deterministic verification for the v0.1 inference-only cycle.
 * This checks structure and bounded completion, not factual correctness.
 */
export function verifyInferenceResult(plan, result, limits = {}) {
  const maxResponseChars = limits.maxResponseChars ?? 20000;
  const planCheck = validateTaskPlan(plan);
  if (!planCheck.ok) {
    return { ok: false, code: "INVALID_TASK_PLAN" };
  }
  if (plan.autonomy_level !== "A0" || plan.resource_policy !== "FREE_ONLY" ||
      plan.status !== "running" || plan.steps.length !== 1) {
    return { ok: false, code: "PLAN_OUTSIDE_INFERENCE_POLICY" };
  }

  const [step] = plan.steps;
  if (step.step_id !== "respond" || step.step_type !== "reason" ||
      step.required_capabilities.length !== 0 || step.status !== "running") {
    return { ok: false, code: "UNAUTHORIZED_INFERENCE_STEP" };
  }
  if (!result || typeof result !== "object" ||
      typeof result.text !== "string" || !result.text.trim()) {
    return { ok: false, code: "EMPTY_OR_INVALID_RESPONSE" };
  }
  if (!Number.isSafeInteger(maxResponseChars) || maxResponseChars <= 0 ||
      result.text.length > maxResponseChars) {
    return { ok: false, code: "RESPONSE_OUT_OF_BOUNDS" };
  }
  if (typeof result.providerId !== "string" || !result.providerId.trim() ||
      typeof result.modelId !== "string" || !result.modelId.trim()) {
    return { ok: false, code: "MISSING_PROVIDER_PROVENANCE" };
  }

  return {
    ok: true,
    evidence: {
      verifierId: "sofia-deterministic-inference-verifier",
      verifierVersion: "0.1.0",
      checks: [
        "task_plan_valid",
        "a0_free_only_inference_policy",
        "no_external_capabilities",
        "non_empty_response",
        "response_size_limit",
        "provider_provenance_present"
      ],
      factualAccuracyAssessed: false
    }
  };
}
