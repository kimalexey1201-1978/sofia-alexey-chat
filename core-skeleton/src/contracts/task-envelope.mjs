const ALLOWED_PRIORITIES = new Set(["low", "normal", "high"]);
const ALLOWED_TYPES = new Set(["text_generation", "tool_call", "analysis", "workflow"]);

export function validateTaskEnvelope(task) {
  const errors = [];
  if (!task || typeof task !== "object" || Array.isArray(task)) {
    return { valid: false, errors: ["Task must be an object"] };
  }

  if (task.protocol !== "sofia.task.v1") errors.push("Unsupported protocol");
  if (typeof task.task_id !== "string" || !task.task_id.trim()) errors.push("task_id is required");
  if (typeof task.session_id !== "string" || !task.session_id.trim()) errors.push("session_id is required");
  if (typeof task.created_at !== "string" || Number.isNaN(Date.parse(task.created_at))) errors.push("created_at must be a valid date");
  if (!ALLOWED_TYPES.has(task.type)) errors.push("Unsupported task type");
  if (!ALLOWED_PRIORITIES.has(task.priority)) errors.push("Unsupported priority");
  if (!task.input || typeof task.input !== "object" || Array.isArray(task.input)) errors.push("input must be an object");
  else if (typeof task.input.content !== "string") errors.push("input.content must be a string");

  if (task.constraints !== undefined && (!task.constraints || typeof task.constraints !== "object" || Array.isArray(task.constraints))) {
    errors.push("constraints must be an object");
  }
  if (task.constraints?.timeout_ms !== undefined &&
      (!Number.isInteger(task.constraints.timeout_ms) || task.constraints.timeout_ms < 1 || task.constraints.timeout_ms > 120000)) {
    errors.push("timeout_ms must be an integer between 1 and 120000");
  }

  return { valid: errors.length === 0, errors };
}
