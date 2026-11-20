import { validateTaskPlan } from "./task-planner.mjs";
import { assessExecutorCandidate } from "./executor-manager.mjs";
import { evaluateExecutionAdmission } from "./execution-supervisor.mjs";

/**
 * Preparation-only orchestration. It validates the plan, screens candidate
 * executors, and evaluates action-bound admission evidence. It never dispatches.
 * Evidence must be loaded and authenticated by trusted host services.
 */
export function prepareExecution(plan, candidates, task, now = new Date()) {
  const planCheck = validateTaskPlan(plan);
  if (!planCheck.ok) {
    return { ok: false, status: "REJECTED", reasonCodes: [planCheck.code], dispatchPerformed: false };
  }
  if (!Array.isArray(candidates) || !task || typeof task !== "object") {
    return { ok: false, status: "REJECTED", reasonCodes: ["INVALID_CANDIDATE_INPUT"], dispatchPerformed: false };
  }

  // The Core A0 inference-provider call is not an external executor task.
  // Keep it out of module selection and permissioned dispatch preparation.
  if (plan.autonomy_level === "A0" &&
      plan.steps.length === 1 &&
      plan.steps[0].step_type === "reason" &&
      plan.steps[0].required_capabilities.length === 0) {
    return { ok: true, status: "NOT_REQUIRED",
      reasonCodes: ["INTERNAL_INFERENCE_DOES_NOT_REQUIRE_EXECUTOR"],
      selectedModuleRef: null, dispatchPerformed: false };
  }
  if (!["approved", "running"].includes(plan.status)) {
    return { ok: false, status: "NOT_READY", reasonCodes: ["PLAN_NOT_APPROVED_FOR_EXECUTION"], dispatchPerformed: false };
  }
  const stepStates = new Map(plan.steps.map(step => [step.step_id, step.status]));
  const readySteps = plan.steps.filter(step =>
    (step.status === "ready" || step.status === "planned") &&
    step.depends_on.every(dependency => stepStates.get(dependency) === "succeeded")
  );
  if (readySteps.length !== 1) {
    return { ok: false, status: "NOT_READY", reasonCodes: ["EXPECTED_EXACTLY_ONE_DEPENDENCY_READY_STEP"], dispatchPerformed: false };
  }
  const step = readySteps[0];
  if (step.required_capabilities.length !== 1 ||
      step.required_capabilities[0] !== task.capabilityId) {
    return { ok: false, status: "REJECTED", reasonCodes: ["STEP_CAPABILITY_MISMATCH"], dispatchPerformed: false };
  }

  const assessments = candidates.map(candidate => {
    const eligibility = assessExecutorCandidate(candidate, task, now);
    if (!eligibility.eligible) {
      return { moduleRef: eligibility.moduleRef, eligible: false, stage: "eligibility",
        reasonCodes: eligibility.reasonCodes };
    }
    const admission = evaluateExecutionAdmission(candidate.executionEvidence, now);
    return { moduleRef: eligibility.moduleRef, eligible: admission.admitted,
      stage: "execution_admission", reasonCodes: admission.reasonCodes,
      requestId: admission.requestId ?? null };
  });

  const admitted = assessments.filter(item => item.eligible);
  if (admitted.length === 0) {
    return { ok: true, status: "BLOCKED", selectedModuleRef: null,
      assessments, dispatchPerformed: false };
  }

  // Stable input order is deliberate until a separately verified ranking policy exists.
  return { ok: true, status: "PREPARED", selectedModuleRef: admitted[0].moduleRef,
    assessments, dispatchPerformed: false };
}
