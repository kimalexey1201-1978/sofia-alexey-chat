const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const MAX_PROVIDER_BODY_BYTES = 8 * 1024 * 1024;
const encoder = new TextEncoder();

/**
 * Trusted Sofia Core credential boundary.
 *
 * The Worker environment is accepted only here. The returned capability can
 * call one fixed OpenRouter endpoint with POST + JSON; it never returns or
 * exposes the credential to provider adapters or executor modules.
 */
export function createOpenRouterCredentialPort(env, fetchImpl = globalThis.fetch) {
  const secret = env?.OPENROUTER_API_KEY;
  if (typeof secret !== "string" || !secret.trim() || secret.length > 512) {
    throw new TypeError("PROVIDER_CREDENTIAL_NOT_CONFIGURED");
  }
  if (typeof fetchImpl !== "function") {
    throw new TypeError("PROVIDER_TRANSPORT_UNAVAILABLE");
  }

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

    // Only the cancellation signal crosses the capability boundary.
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
