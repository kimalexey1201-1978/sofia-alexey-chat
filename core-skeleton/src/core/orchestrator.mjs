import { validateTaskEnvelope } from "../contracts/task-envelope.mjs";

export class Orchestrator {
  constructor({ registry, gateway, security, critic }) {
    for (const [name, dependency] of Object.entries({ registry, gateway, security, critic })) {
      if (!dependency) throw new TypeError(`Missing dependency: ${name}`);
    }
    this.registry = registry;
    this.gateway = gateway;
    this.security = security;
    this.critic = critic;
  }

  async run(task, { signal } = {}) {
    const validation = validateTaskEnvelope(task);
    if (!validation.valid) {
      return { protocol: "sofia.result.v1", task_id: task?.task_id ?? null, status: "failed", errors: validation.errors };
    }

    try {
      // Authorization is derived by the trusted server policy, never from task.security supplied by a client.
      const authorization = await this.security.authorize(task);
      if (!authorization?.allowed) {
        return { protocol: "sofia.result.v1", task_id: task.task_id, status: "failed", errors: ["AUTH_DENIED"] };
      }

      const entry = this.registry.resolve(task.type);
      if (!entry) {
        return { protocol: "sofia.result.v1", task_id: task.task_id, status: "failed", errors: ["EXECUTOR_UNAVAILABLE"] };
      }

      const output = await this.gateway.execute(entry, task, {
        timeoutMs: task.constraints?.timeout_ms ?? 30000,
        signal
      });

      const verification = await this.critic.verify({ task, output });
      if (!verification?.passed) {
        return {
          protocol: "sofia.result.v1",
          task_id: task.task_id,
          executor_id: entry.manifest.id,
          executor_version: entry.manifest.version,
          status: "verification_failed",
          output,
          verification: verification ?? { passed: false },
          errors: ["VERIFICATION_FAILED"]
        };
      }

      return {
        protocol: "sofia.result.v1",
        task_id: task.task_id,
        executor_id: entry.manifest.id,
        executor_version: entry.manifest.version,
        status: "completed",
        output,
        verification,
        errors: []
      };
    } catch (error) {
      const code = error?.message === "EXECUTOR_TIMEOUT" ? "TIMEOUT" : "EXECUTION_FAILED";
      return { protocol: "sofia.result.v1", task_id: task.task_id, status: "failed", errors: [code] };
    }
  }
}
