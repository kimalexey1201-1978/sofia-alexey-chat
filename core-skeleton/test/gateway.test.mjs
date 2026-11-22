import test from "node:test";
import assert from "node:assert/strict";
import { ExecutorGateway } from "../src/gateway/executor-gateway.mjs";

test("timeout rejects even if executor resolves immediately on abort", async () => {
  let observedAbort = false;
  const entry = {
    executor: {
      execute: (_task, { signal }) => new Promise(resolve => {
        signal.addEventListener("abort", () => {
          observedAbort = true;
          resolve("executor stopped");
        }, { once: true });
      })
    }
  };

  await assert.rejects(
    () => new ExecutorGateway().execute(entry, {}, { timeoutMs: 15 }),
    /EXECUTOR_TIMEOUT/
  );
  assert.equal(observedAbort, true);
});

test("caller cancellation rejects even if executor resolves immediately on abort", async () => {
  const controller = new AbortController();
  let observedAbort = false;
  const entry = {
    executor: {
      execute: (_task, { signal }) => new Promise(resolve => {
        signal.addEventListener("abort", () => {
          observedAbort = true;
          resolve("executor stopped");
        }, { once: true });
      })
    }
  };

  const pending = new ExecutorGateway().execute(entry, {}, {
    timeoutMs: 1000,
    signal: controller.signal
  });
  controller.abort();

  await assert.rejects(() => pending, /EXECUTION_CANCELLED/);
  assert.equal(observedAbort, true);
});

test("gateway rejects a signal that was already aborted", async () => {
  const controller = new AbortController();
  controller.abort();
  const entry = { executor: { execute: async () => "must not execute" } };

  await assert.rejects(
    () => new ExecutorGateway().execute(entry, {}, { signal: controller.signal }),
    /EXECUTION_CANCELLED/
  );
});
