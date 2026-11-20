import { validateProviderResult } from "../core/ai-provider.mjs";

/**
 * Deterministic, network-free AI provider for contract and failure-path tests.
 * It never performs external I/O and must not be used as a production provider.
 *
 * @param {{providerId?:string,modelId?:string,response?:string,usage?:Record<string,number>,
 *   delayMs?:number,failWith?:Error,malformedResult?:unknown,onCall?:(request:object)=>void}} config
 */
export function createDeterministicMockProvider(config = {}) {
  const providerId = config.providerId || "mock";
  const modelId = config.modelId || "mock-model-v1";
  const response = config.response || "Mock provider response";
  const delayMs = Number.isSafeInteger(config.delayMs) && config.delayMs > 0
    ? config.delayMs : 0;
  const calls = [];

  return {
    calls,
    async generate(request) {
      if (!request || typeof request !== "object" || Array.isArray(request)) {
        throw new TypeError("Invalid mock provider request");
      }
      const call = {
        requestId: typeof request.requestId === "string" ? request.requestId : null,
        receivedAt: Date.now()
      };
      calls.push(call);
      config.onCall?.(request);

      if (request.signal?.aborted) {
        const error = new Error("Mock provider request cancelled");
        error.code = "SOFIA_PROVIDER_CANCELLED";
        throw error;
      }
      if (delayMs > 0) {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, delayMs);
          const abort = () => {
            clearTimeout(timer);
            const error = new Error("Mock provider request cancelled");
            error.code = "SOFIA_PROVIDER_CANCELLED";
            reject(error);
          };
          request.signal?.addEventListener("abort", abort, { once: true });
        });
      }
      if (config.failWith) throw config.failWith;
      const result = config.malformedResult ?? {
        text: response,
        providerId,
        modelId,
        ...(config.usage === undefined ? {} : { usage: config.usage })
      };
      return validateProviderResult(result);
    }
  };
}
