const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/**
 * OpenRouter adapter.
 *
 * It receives a narrowly scoped credential capability, never an API key or
 * the Worker environment. The capability is created by Sofia Core's trusted
 * provider credential port.
 * @param {{fetchImpl: typeof fetch, model?: string, siteUrl?: string, appName?: string}} config
 */
export function createOpenRouterProvider(config = {}) {
  const model = config.model || "openrouter/free";
  const fetchImpl = config.fetchImpl;
  if (typeof fetchImpl !== "function") {
    throw new TypeError("OpenRouter credential capability is required");
  }

  return {
    async generate(request) {
      if (!request || typeof request !== "object" ||
          !Array.isArray(request.messages) ||
          typeof request.systemInstruction !== "string") {
        throw new TypeError("Invalid provider request");
      }
      if (request.signal !== undefined &&
          (!request.signal || typeof request.signal.aborted !== "boolean" ||
           typeof request.signal.addEventListener !== "function" ||
           typeof request.signal.removeEventListener !== "function")) {
        throw new TypeError("Invalid provider cancellation signal");
      }
      const timeoutMs = Number.isSafeInteger(request.timeoutMs) && request.timeoutMs > 0
        ? request.timeoutMs : 20000;
      const controller = new AbortController();
      let timedOut = false;
      const abortFromCore = () => controller.abort(request.signal?.reason);
      if (request.signal?.aborted) abortFromCore();
      else request.signal?.addEventListener("abort", abortFromCore, { once: true });
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort(new Error("Provider deadline exceeded"));
      }, timeoutMs);

      const messages = [
        { role: "system", content: request.systemInstruction },
        ...request.messages.map(message => ({ role: message.role, content: message.content }))
      ];
      const headers = {
        "Content-Type": "application/json",
        "X-Title": config.appName || "Sofia AI"
      };
      if (typeof config.siteUrl === "string" && config.siteUrl) {
        headers["HTTP-Referer"] = config.siteUrl;
      }

      try {
        if (controller.signal.aborted) {
          throw new Error("Provider request was cancelled before dispatch");
        }
        const response = await fetchImpl(OPENROUTER_ENDPOINT, {
          method: "POST",
          headers,
          signal: controller.signal,
          body: JSON.stringify({
            model, messages, max_tokens: request.maxOutputTokens, temperature: 0.7
          })
        });
        if (!response || !response.ok) throw new Error("OpenRouter request failed");
        let data;
        try { data = await response.json(); }
        catch { throw new TypeError("OpenRouter returned invalid JSON"); }
        const text = data?.choices?.[0]?.message?.content;
        const modelId = typeof data?.model === "string" && data.model ? data.model : model;
        if (typeof text !== "string" || !text.trim()) {
          throw new TypeError("OpenRouter returned an invalid completion");
        }
        const usage = {};
        if (Number.isFinite(data?.usage?.prompt_tokens) && data.usage.prompt_tokens >= 0) {
          usage.inputTokens = data.usage.prompt_tokens;
        }
        if (Number.isFinite(data?.usage?.completion_tokens) && data.usage.completion_tokens >= 0) {
          usage.outputTokens = data.usage.completion_tokens;
        }
        return { text, providerId: "openrouter", modelId,
          ...(Object.keys(usage).length ? { usage } : {}) };
      } catch (error) {
        if (timedOut) {
          const timeoutError = new Error("Provider deadline exceeded");
          timeoutError.code = "SOFIA_PROVIDER_TIMEOUT";
          throw timeoutError;
        }
        throw new Error("OpenRouter provider unavailable");
      } finally {
        clearTimeout(timer);
        request.signal?.removeEventListener("abort", abortFromCore);
      }
    }
  };
}
