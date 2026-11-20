const MAX_GOAL_CHARS = 4000;

function makeId(prefix) {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}

function hasOnlyKeys(value, allowed) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).every(key => allowed.has(key));
}

/** Deterministic plan-shape and dependency validation; never grants authority. */
export function validateTaskPlan(plan) {
  if (!hasOnlyKeys(plan, new Set([
    "plan_id", "task_id", "plan_version", "created_at", "owner_goal",
    "success_criteria", "assumptions", "steps", "autonomy_level",
    "resource_policy", "estimated_duration_seconds", "deadline_at",
    "authority_envelope_ref", "owner_approval_refs", "risk_tier",
    "policy_version", "status", "supersedes_plan_version"
  ]))) return { ok: false, code: "INVALID_PLAN_SHAPE" };

  if (typeof plan.plan_id !== "string" || plan.plan_id.length < 8 ||
      typeof plan.task_id !== "string" || !plan.task_id ||
      !Number.isSafeInteger(plan.plan_version) || plan.plan_version < 1 ||
      typeof plan.created_at !== "string" || !Number.isFinite(Date.parse(plan.created_at)) ||
      typeof plan.owner_goal !== "string" || !plan.owner_goal.trim() ||
      plan.owner_goal.length > MAX_GOAL_CHARS ||
      !Array.isArray(plan.success_criteria) || plan.success_criteria.length === 0 ||
      !Array.isArray(plan.steps) || plan.steps.length === 0 ||
      !["A0", "A1", "A2", "A3", "A4"].includes(plan.autonomy_level) ||
      plan.resource_policy !== "FREE_ONLY" ||
      typeof plan.policy_version !== "string" || !plan.policy_version ||
      !["draft", "awaiting_owner_approval", "approved", "running", "paused",
        "blocked", "completed", "partially_completed", "failed", "cancelled",
        "superseded"].includes(plan.status)) {
    return { ok: false, code: "INVALID_PLAN_FIELDS" };
  }

  const ids = new Set();
  const steps = new Map();
  for (const step of plan.steps) {
    if (!hasOnlyKeys(step, new Set([
      "step_id", "description", "step_type", "depends_on", "required_capabilities",
      "candidate_executor_refs", "input_refs", "output_schema_ref", "target_ref",
      "risk_tier", "data_classification", "purpose_id", "external_processor_refs",
      "estimated_cost_minor_units", "currency", "estimated_duration_seconds",
      "owner_approval_gate", "approval_scope_ref", "idempotency_required",
      "verification_criteria", "status"
    ]))) return { ok: false, code: "INVALID_STEP_SHAPE" };
    if (typeof step.step_id !== "string" || !step.step_id || ids.has(step.step_id) ||
        !Array.isArray(step.depends_on) ||
        !step.depends_on.every(value => typeof value === "string" && value.length > 0) ||
        !Array.isArray(step.required_capabilities) ||
        !step.required_capabilities.every(value => typeof value === "string" && value.length > 0) ||
        !Array.isArray(step.verification_criteria) || step.verification_criteria.length === 0 ||
        !step.verification_criteria.every(value => typeof value === "string" && value.trim().length > 0) ||
        !["planned", "ready", "running", "succeeded", "failed", "blocked", "skipped", "cancelled"].includes(step.status)) {
      return { ok: false, code: "INVALID_STEP_FIELDS" };
    }
    ids.add(step.step_id);
    steps.set(step.step_id, step);
  }

  for (const step of plan.steps) {
    for (const dependency of step.depends_on) {
      if (!steps.has(dependency) || dependency === step.step_id) {
        return { ok: false, code: "MISSING_OR_SELF_DEPENDENCY" };
      }
    }
  }

  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    visiting.add(id);
    for (const dependency of steps.get(id).depends_on) {
      if (!visit(dependency)) return false;
    }
    visiting.delete(id);
    visited.add(id);
    return true;
  }
  for (const id of steps.keys()) {
    if (!visit(id)) return { ok: false, code: "PLAN_CYCLE_DETECTED" };
  }
  return { ok: true, plan };
}

/** First bounded A0/FREE_ONLY plan: one inference step, no external actions. */
export function createInferencePlan(messages, now = new Date()) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new TypeError("At least one message is required");
  }
  const lastUserMessage = [...messages].reverse().find(message => message.role === "user");
  if (!lastUserMessage || typeof lastUserMessage.content !== "string") {
    throw new TypeError("A user goal is required");
  }
  const plan = {
    plan_id: makeId("plan"),
    task_id: makeId("task"),
    plan_version: 1,
    created_at: now.toISOString(),
    owner_goal: lastUserMessage.content.slice(0, MAX_GOAL_CHARS),
    success_criteria: ["Return a non-empty assistant response to the owner's request."],
    assumptions: ["This v0.1 plan covers one inference-only response; no tools or external actions are authorized."],
    steps: [{
      step_id: "respond",
      description: "Generate a bounded response using the configured AI provider.",
      step_type: "reason",
      depends_on: [],
      required_capabilities: [],
      risk_tier: "R0",
      data_classification: "internal",
      status: "running",
      verification_criteria: [
        "Provider result matches the response contract.",
        "Response is non-empty and within the configured character limit."
      ]
    }],
    autonomy_level: "A0",
    resource_policy: "FREE_ONLY",
    risk_tier: "R0",
    policy_version: "sofia-core-v0.1",
    status: "running"
  };
  const checked = validateTaskPlan(plan);
  if (!checked.ok) throw new Error(`Generated task plan rejected: ${checked.code}`);
  return plan;
}

/** Marks the single inference step successful only after a validated response exists. */
export function completeInferencePlan(plan, responseText) {
  if (typeof responseText !== "string" || responseText.trim().length === 0) {
    return { ok: false, code: "EMPTY_VERIFIED_RESPONSE" };
  }
  const completed = {
    ...plan,
    status: "completed",
    steps: plan.steps.map(step => ({
      ...step,
      status: step.step_id === "respond" ? "succeeded" : step.status
    }))
  };
  const checked = validateTaskPlan(completed);
  return checked.ok ? { ok: true, plan: completed } : checked;
}
