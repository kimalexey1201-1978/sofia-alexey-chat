import { createInferencePlan, completeInferencePlan } from "./task-planner.mjs";
import { verifyInferenceResult } from "./response-verifier.mjs";
import { assertAIProvider, validateProviderResult } from "./ai-provider.mjs";

const DEFAULTS = Object.freeze({
  maxMessages: 30,
  maxMessageChars: 8000,
  maxTotalChars: 30000,
  maxResponseChars: 20000,
  maxOutputTokens: 1200,
  timeoutMs: 20000
});
const HARD_LIMITS = Object.freeze({
  maxMessages: 100,
  maxMessageChars: 16000,
  maxTotalChars: 60000,
  maxResponseChars: 40000,
  maxOutputTokens: 8192,
  timeoutMs: 120000
});

function failure(code, message) {
  return { ok: false, error: { code, message } };
}

function resolveLimits(overrides) {
  if (overrides === undefined) return { ...DEFAULTS };
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) return null;
  const limits = { ...DEFAULTS };
  for (const [key, value] of Object.entries(overrides)) {
    if (!Object.hasOwn(DEFAULTS, key) || !Number.isSafeInteger(value) ||
        value <= 0 || value > HARD_LIMITS[key]) return null;
    limits[key] = value;
  }
  return limits;
}

function validateChatRequest(request, limits) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    return { error: failure("INVALID_REQUEST", "Request must be an object") };
  }
  if (Object.keys(request).some(key => key !== "messages")) {
    return { error: failure("INVALID_REQUEST", "Request contains unsupported fields") };
  }
  const { messages } = request;
  if (!Array.isArray(messages) || messages.length === 0) {
    return { error: failure("INVALID_REQUEST", "At least one message is required") };
  }
  if (messages.length > limits.maxMessages) {
    return { error: failure("REQUEST_TOO_LARGE", "Message count exceeds the limit") };
  }
  let totalChars = 0;
  const normalized = [];
  for (const message of messages) {
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      return { error: failure("INVALID_REQUEST", "Each message must be an object") };
    }
    if (Object.keys(message).some(key => key !== "role" && key !== "content")) {
      return { error: failure("INVALID_REQUEST", "Message contains unsupported fields") };
    }
    if (message.role !== "user" && message.role !== "assistant") {
      return { error: failure("UNSUPPORTED_ROLE", "Message role is not supported") };
    }
    if (typeof message.content !== "string" || message.content.trim().length === 0) {
      return { error: failure("INVALID_REQUEST", "Message content must be non-empty text") };
    }
    if (message.content.length > limits.maxMessageChars) {
      return { error: failure("REQUEST_TOO_LARGE", "Message exceeds the length limit") };
    }
    totalChars += message.content.length;
    normalized.push({ role: message.role, content: message.content });
  }
  if (totalChars > limits.maxTotalChars) {
    return { error: failure("REQUEST_TOO_LARGE", "Total message content exceeds the limit") };
  }
  return { messages: normalized };
}

function makeRequestId() {
  return globalThis.crypto?.randomUUID?.() ??
    `sofia-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Executes one inference-only chat cycle. Provider cancellation is propagated
 * through AbortSignal; no tools, memory writes, devices, or external actions exist here.
 * @param {import("./ai-provider.mjs").AIProvider} provider
 * @param {{messages: Array<{role:string,content:string}>}} request
 * @param {{systemInstruction:string, model?:string, maxOutputTokens?:number,
 *   timeoutMs?:number, limits?:Partial<typeof DEFAULTS>, requestId?:string}} config
 */
export async function runSofiaCore(provider, request, config = {}) {
  try { assertAIProvider(provider); }
  catch { return failure("INTERNAL_FAILURE", "Core configuration is invalid"); }

  const limits = resolveLimits(config.limits);
  if (!limits) return failure("INTERNAL_FAILURE", "Core configuration is invalid");
  const checked = validateChatRequest(request, limits);
  if (checked.error) return checked.error;
  if (typeof config.systemInstruction !== "string" || !config.systemInstruction.trim()) {
    return failure("INTERNAL_FAILURE", "Core configuration is invalid");
  }

  const timeoutMs = config.timeoutMs === undefined ? DEFAULTS.timeoutMs : config.timeoutMs;
  const maxOutputTokens = config.maxOutputTokens === undefined
    ? DEFAULTS.maxOutputTokens : config.maxOutputTokens;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 ||
      timeoutMs > HARD_LIMITS.timeoutMs ||
      !Number.isSafeInteger(maxOutputTokens) || maxOutputTokens <= 0 ||
      maxOutputTokens > HARD_LIMITS.maxOutputTokens) {
    return failure("INTERNAL_FAILURE", "Core configuration is invalid");
  }

  let taskPlan;
  try { taskPlan = createInferencePlan(checked.messages); }
  catch { return failure("INTERNAL_FAILURE", "Task planning could not create a valid plan"); }

  const controller = new AbortController();
  const providerRequest = {
    requestId: config.requestId || makeRequestId(),
    messages: checked.messages,
    systemInstruction: config.systemInstruction,
    maxOutputTokens,
    timeoutMs,
    signal: controller.signal,
    ...(typeof config.model === "string" && config.model ? { model: config.model } : {})
  };

  let timer;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error("Provider deadline exceeded");
        error.code = "SOFIA_PROVIDER_TIMEOUT";
        controller.abort(error);
        reject(error);
      }, timeoutMs);
    });

    let rawResult;
    try {
      rawResult = await Promise.race([
        Promise.resolve().then(() => provider.generate(providerRequest)),
        timeout
      ]);
    } catch (error) {
      if (error?.code === "SOFIA_PROVIDER_TIMEOUT") {
        return failure("PROVIDER_TIMEOUT", "The AI provider did not respond in time");
      }
      return failure("PROVIDER_UNAVAILABLE", "The AI provider is temporarily unavailable");
    }

    let result;
    try { result = validateProviderResult(rawResult); }
    catch { return failure("VERIFIER_REJECTED", "Provider response failed validation"); }
    const verification = verifyInferenceResult(taskPlan, result, {
      maxResponseChars: limits.maxResponseChars
    });
    if (!verification.ok) {
      return failure("VERIFIER_REJECTED", "Provider response failed independent verification");
    }
    const completedPlan = completeInferencePlan(taskPlan, result.text);
    if (!completedPlan.ok) {
      return failure("VERIFIER_REJECTED", "Task completion failed validation");
    }
    return {
      ok: true,
      requestId: providerRequest.requestId,
      taskPlan: completedPlan.plan,
      answer: {
        text: result.text,
        providerId: result.providerId,
        modelId: result.modelId,
        ...(result.usage === undefined ? {} : { usage: result.usage })
      }
    };
  } catch {
    return failure("INTERNAL_FAILURE", "Core could not complete the request");
  } finally {
    if (timer) clearTimeout(timer);
  }
}
