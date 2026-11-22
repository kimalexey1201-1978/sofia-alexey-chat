export class ExecutorGateway {
  async execute(entry, task, { timeoutMs = 30000, signal } = {}) {
    if (!entry?.executor || typeof entry.executor.execute !== "function") {
      throw new TypeError("A valid registered executor is required");
    }
    if (signal?.aborted) throw new Error("EXECUTION_CANCELLED");

    const controller = new AbortController();
    let rejectCancellation;
    const cancellation = new Promise((_, reject) => { rejectCancellation = reject; });
    const relayAbort = () => {
      controller.abort(signal.reason);
      rejectCancellation(new Error("EXECUTION_CANCELLED"));
    };
    signal?.addEventListener("abort", relayAbort, { once: true });

    let timeoutId;
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort(new Error("EXECUTOR_TIMEOUT"));
        reject(new Error("EXECUTOR_TIMEOUT"));
      }, timeoutMs);
    });

    try {
      return await Promise.race([
        entry.executor.execute(task, { signal: controller.signal }),
        timeout,
        cancellation
      ]);
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", relayAbort);
    }
  }
}
