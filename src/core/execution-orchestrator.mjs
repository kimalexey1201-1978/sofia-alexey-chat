import { validateTaskPlan } from "./task-planner.mjs";
import { assessExecutorCandidate } from "./executor-manager.mjs";
import { evaluateExecutionAdmission } from "./execution-supervisor.mjs";

/**
 * Composes planning, executor eligibility, and execution admission.
 * This is a preparation-only path: it never invokes a module or performs I/O.
 * Evidence objects must be loaded from trusted internal stores by the caller.
 */
export function prepareExecution(plan, candidates, task, now = new Date()) {
  const planCheck = validateTaskPlan(plan);
  if (!planCheck.ok) {
    return { ok: false, status: "REJECTED", reasonCodes: [planCheck.code], dispatchPerformed: false };
  }
  if (!Array.isArray(candidates) || !task || typeof task !== "object") {
    return { ok: false, status: "REJECTED", reasonCodes: ["INVALID_CANDIDATE_INPUT"], dispatchPerformed: false };
  }

  const steps = plan.steps.filter(step => step.status === "ready" || step.status === "planned");
  if (steps.length !== 1) {
    return { ok: false, status: "NOT_READY", reasonCodes: ["EXPECTED_EXACTLY_ONE_READY_STEP"], dispatchPerformed: false };
  }
  const step = steps[0];
  if (step.required_capabilities?.length !== 1 ||
      step.required_capabilities[0] !== task.capabilityId) {
    return { ok: false, status: "REJECTED", reasonCodes: ["STEP_CAPABILITY_MISMATCH"], dispatchPerformed: false };
  }

  const assessments = candidates.map(candidate => {
    const eligibility = assessExecutorCandidate(candidate, task, now);
    if (!eligibility.eligible) {
      return { moduleRef: eligibility.moduleRef, eligible: false,
        reasonCodes: eligibility.reasonCodes };
    }
    const admission = evaluateExecutionAdmission(candidate.executionEvidence, now);
    return { moduleRef: eligibility.moduleRef, eligible: admission.admitted,
      reasonCodes: admission.reasonCodes, admissionChecked: true };
  });

  const admitted = assessments.filter(item => item.eligible);
  if (admitted.length === 0) {
    return { ok: true, status: "BLOCKED", selectedModuleRef: null,
      assessments, dispatchPerformed: false };
  }

  // Preserve input order. Ranking is intentionally deferred until suitability
  // metrics and an independently verified ranking policy are implemented.
  return { ok: true, status: "PREPARED",
    selectedModuleRef: admitted[0].moduleRef,
    assessments, dispatchPerformed: false };
}
