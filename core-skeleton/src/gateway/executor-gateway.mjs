export class ExecutorGateway {
  async execute(entry, task, { timeoutMs = 30000, signal } = {}) {
    if (!entry?.executor || typeof entry.executor.execute !== "function") {
      throw new TypeError("A valid registered executor is required");
    }
    if (signal?.aborted) throw new Error("Execution cancelled");

    let timeoutId;
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error("EXECUTOR_TIMEOUT")), timeoutMs);
    });

    try {
      return await Promise.race([
        entry.executor.execute(task, { signal }),
        timeout
      ]);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
