const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const MAX_PROVIDER_BODY_BYTES = 8 * 1024 * 1024;
const encoder = new TextEncoder();
const IMAGE_DATA_URL = /^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;

function hasOnlyKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).every(key => keys.includes(key)) &&
    keys.every(key => Object.hasOwn(value, key));
}

function validateChatPayload(body, policy) {
  if (!hasOnlyKeys(body, ["model", "messages", "max_tokens", "temperature"]) ||
      body.model !== policy.model ||
      !Number.isSafeInteger(body.max_tokens) || body.max_tokens < 1 || body.max_tokens > policy.maxTokens ||
      body.temperature !== policy.temperature ||
      !Array.isArray(body.messages) || body.messages.length < 2 || body.messages.length > 31) return false;

  if (body.messages[0]?.role !== "system") return false;
  return body.messages.every((message, index) => {
    if (!hasOnlyKeys(message, ["role", "content"]) ||
        !["system", "user", "assistant"].includes(message.role) ||
        typeof message.content !== "string" || message.content.length < 1 || message.content.length > 16000) return false;
    return index === 0 ? message.role === "system" : message.role !== "system";
  });
}

function validateVisionPayload(body, policy) {
  if (!hasOnlyKeys(body, ["model", "messages", "max_tokens", "temperature"]) ||
      body.model !== policy.model ||
      !Number.isSafeInteger(body.max_tokens) || body.max_tokens < 1 || body.max_tokens > policy.maxTokens ||
      body.temperature !== policy.temperature ||
      !Array.isArray(body.messages) || body.messages.length !== 1) return false;

  const message = body.messages[0];
  if (!hasOnlyKeys(message, ["role", "content"]) || message.role !== "user" ||
      !Array.isArray(message.content) || message.content.length !== 2) return false;
  const [textPart, imagePart] = message.content;
  return hasOnlyKeys(textPart, ["type", "text"]) && textPart.type === "text" &&
    typeof textPart.text === "string" && textPart.text.length > 0 && textPart.text.length <= 2000 &&
    hasOnlyKeys(imagePart, ["type", "image_url"]) && imagePart.type === "image_url" &&
    hasOnlyKeys(imagePart.image_url, ["url"]) && typeof imagePart.image_url.url === "string" &&
    imagePart.image_url.url.length <= 7 * 1024 * 1024 && IMAGE_DATA_URL.test(imagePart.image_url.url);
}

/**
 * Trusted Sofia Core credential boundary.
 *
 * The Worker environment is accepted only here. The returned capability can
 * call one fixed OpenRouter endpoint with POST + a validated, purpose-specific
 * JSON payload; it never returns or exposes the credential to provider adapters
 * or executor modules.
 */
export function createOpenRouterCredentialPort(env, fetchImpl = globalThis.fetch, options = {}) {
  const secret = env?.OPENROUTER_API_KEY;
  if (typeof secret !== "string" || !secret.trim() || secret.length > 512) {
    throw new TypeError("PROVIDER_CREDENTIAL_NOT_CONFIGURED");
  }
  if (typeof fetchImpl !== "function") {
    throw new TypeError("PROVIDER_TRANSPORT_UNAVAILABLE");
  }

  const mode = options.mode || "chat";
  const model = options.model;
  const maxTokens = options.maxTokens ?? (mode === "vision" ? 700 : 1200);
  const temperature = options.temperature ?? (mode === "vision" ? 0.2 : 0.7);
  if (!["chat", "vision"].includes(mode) || typeof model !== "string" || !model.trim() ||
      !Number.isSafeInteger(maxTokens) || maxTokens < 1 || maxTokens > 1200 ||
      typeof temperature !== "number" || temperature < 0 || temperature > 1) {
    throw new TypeError("PROVIDER_CAPABILITY_POLICY_INVALID");
  }
  const policy = { mode, model, maxTokens, temperature };

  return async function requestOpenRouter(input, init = {}) {
    let target;
    try {
      target = input instanceof URL ? input.href : String(input);
    } catch {
      throw new TypeError("PROVIDER_TARGET_NOT_ALLOWED");
    }
    if (target !== OPENROUTER_ENDPOINT) {
      throw new TypeError("PROVIDER_TARGET_NOT_ALLOWED");
    }
    if (!init || typeof init !== "object" || init.method !== "POST" ||
        typeof init.body !== "string" ||
        encoder.encode(init.body).byteLength > MAX_PROVIDER_BODY_BYTES) {
      throw new TypeError("PROVIDER_REQUEST_NOT_ALLOWED");
    }

    const suppliedHeaders = new Headers(init.headers || {});
    const contentType = suppliedHeaders.get("content-type") || "";
    if (contentType.split(";")[0].trim().toLowerCase() !== "application/json") {
      throw new TypeError("PROVIDER_CONTENT_TYPE_NOT_ALLOWED");
    }

    let payload;
    try { payload = JSON.parse(init.body); }
    catch { throw new TypeError("PROVIDER_PAYLOAD_NOT_ALLOWED"); }
    const validPayload = mode === "chat"
      ? validateChatPayload(payload, policy)
      : validateVisionPayload(payload, policy);
    if (!validPayload) throw new TypeError("PROVIDER_PAYLOAD_NOT_ALLOWED");

    const headers = new Headers({
      "Authorization": `Bearer ${secret}`,
      "Content-Type": "application/json"
    });
    const siteUrl = suppliedHeaders.get("HTTP-Referer");
    if (siteUrl && siteUrl.length <= 256) {
      try {
        const parsed = new URL(siteUrl);
        if (parsed.protocol === "https:") headers.set("HTTP-Referer", parsed.origin);
      } catch {}
    }
    const appName = suppliedHeaders.get("X-Title");
    if (appName && appName.length <= 64) headers.set("X-Title", appName);

    return fetchImpl(OPENROUTER_ENDPOINT, {
      method: "POST",
      headers,
      body: init.body,
      signal: init.signal,
      redirect: "error",
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer"
    });
  };
}
