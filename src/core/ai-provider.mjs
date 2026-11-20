/**
 * Sofia Core v0.1 — provider boundary (scaffold only).
 *
 * This module is deliberately independent of Cloudflare and OpenRouter.
 * Production wiring is not performed in this step.
 */

/**
 * @typedef {Object} ProviderRequest
 * @property {string} requestId
 * @property {Array<{role: "user" | "assistant", content: string}>} messages
 * @property {string} systemInstruction
 * @property {string=} model
 * @property {number} maxOutputTokens
 * @property {number} timeoutMs
 */

/**
 * @typedef {Object} ProviderResult
 * @property {string} text
 * @property {string} providerId
 * @property {string} modelId
 * @property {Record<string, number>=} usage
 */

/**
 * Runtime contract for a provider adapter.
 * Implementations must expose generate(request) and return ProviderResult.
 *
 * @typedef {Object} AIProvider
 * @property {(request: ProviderRequest) => Promise<ProviderResult>} generate
 */

/**
 * Rejects objects that do not implement the provider boundary.
 * @param {unknown} provider
 * @returns {asserts provider is AIProvider}
 */
export function assertAIProvider(provider) {
  if (!provider || typeof provider !== "object" ||
      typeof provider.generate !== "function") {
    throw new TypeError("Invalid AIProvider: generate(request) is required");
  }
}

/**
 * Performs deterministic structural validation only.
 * It does not assess whether the generated text is factually correct.
 * @param {unknown} result
 * @returns {ProviderResult}
 */
export function validateProviderResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new TypeError("Invalid provider result");
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
    for (const [key, value] of Object.entries(usage)) {
      if (!key || !Number.isFinite(value) || value < 0) {
        throw new TypeError("Provider result usage values must be finite non-negative numbers");
      }
    }
  }

  return { text, providerId, modelId, ...(usage === undefined ? {} : { usage }) };
}

/**
 * Test-only provider. It is not used by the Worker or production endpoint.
 * @param {ProviderResult} result
 * @returns {AIProvider}
 */
export function createMockProvider(result = {
  text: "Mock response",
  providerId: "mock",
  modelId: "mock-model"
}) {
  return {
    async generate() {
      return result;
    }
  };
}
