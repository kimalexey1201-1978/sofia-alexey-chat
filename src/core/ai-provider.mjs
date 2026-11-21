/**
 * Sofia Core v0.1 — provider boundary.
 */

/**
 * @typedef {Object} ProviderRequest
 * @property {string} requestId
 * @property {Array<{role: "user" | "assistant", content: string}>} messages
 * @property {string} systemInstruction
 * @property {string=} model
 * @property {number} maxOutputTokens
 * @property {number} timeoutMs
 * @property {AbortSignal=} signal Cancellation signal owned by Sofia Core.
 */

/**
 * @typedef {Object} ProviderResult
 * @property {string} text
 * @property {string} providerId
 * @property {string} modelId
 * @property {{inputTokens?: number, outputTokens?: number}=} usage
 */

/**
 * Provider adapters must honor request.signal and stop upstream work when aborted.
 * @typedef {Object} AIProvider
 * @property {(request: ProviderRequest) => Promise<ProviderResult>} generate
 */

/** @param {unknown} provider @returns {asserts provider is AIProvider} */
export function assertAIProvider(provider) {
  if (!provider || typeof provider !== "object" ||
      typeof provider.generate !== "function") {
    throw new TypeError("Invalid AIProvider: generate(request) is required");
  }
}

/** @param {unknown} result @returns {ProviderResult} */
export function validateProviderResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new TypeError("Invalid provider result");
  }
  const allowedResultKeys = new Set(["text", "providerId", "modelId", "usage"]);
  if (Object.keys(result).some(key => !allowedResultKeys.has(key))) {
    throw new TypeError("Provider result contains unsupported fields");
  }

  const { text, providerId, modelId, usage } = result;
  if (typeof text !== "string" || text.trim().length === 0) {
    throw new TypeError("Provider result text must be a non-empty string");
  }
  if (typeof providerId !== "string" || providerId.trim().length === 0) {
    throw new TypeError("Provider result providerId is required");
  }
  if (typeof modelId !== "string" || modelId.trim().length === 0) {
    throw new TypeError("Provider result modelId is required");
  }
  if (usage !== undefined) {
    if (!usage || typeof usage !== "object" || Array.isArray(usage)) {
      throw new TypeError("Provider result usage must be an object");
    }
    const allowedUsageKeys = new Set(["inputTokens", "outputTokens"]);
    if (Object.keys(usage).some(key => !allowedUsageKeys.has(key))) {
      throw new TypeError("Provider result usage contains unsupported fields");
    }
    for (const [key, value] of Object.entries(usage)) {
      if (!Number.isSafeInteger(value) || value < 0) {
        throw new TypeError("Provider result usage values must be non-negative safe integers");
      }
    }
  }
  return {
    text,
    providerId,
    modelId,
    ...(usage === undefined ? {} : { usage: { ...usage } })
  };
}

/** @param {ProviderResult} result @returns {AIProvider} */
export function createMockProvider(result = {
  text: "Mock response", providerId: "mock", modelId: "mock-model"
}) {
  return { async generate() { return result; } };
}
