import { runSofiaCore } from "../core/sofia-core.mjs";
import { createOpenRouterProvider } from "../providers/openrouter-provider.mjs";

const MAX_BODY_BYTES = 64 * 1024;
const SYSTEM_INSTRUCTION = "Ты София, личный ИИ-собеседник. Отвечай по-русски, в женском роде. Обращайся «дорогой», когда уместно. При переводе с русского на корейский дай корейский текст и русскую транскрипцию. При переводе с корейского на русский дай русский перевод. Будь внимательной и точной.";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://kimalexey1201-1978.github.io",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const RESPONSE_HEADERS = {
  ...CORS_HEADERS,
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer"
};

function json(data, status = 200) {
  return Response.json(data, { status, headers: RESPONSE_HEADERS });
}

async function readBoundedBody(request) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return { error: json({ error: { code: "REQUEST_TOO_LARGE", message: "Request body exceeds the allowed size" } }, 413) };
  }
  if (!request.body) return { error: json({ error: { code: "INVALID_REQUEST", message: "Request body is required" } }, 400) };

  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        try { await reader.cancel(); } catch {}
        return { error: json({ error: { code: "REQUEST_TOO_LARGE", message: "Request body exceeds the allowed size" } }, 413) };
      }
      chunks.push(value);
    }
  } catch {
    try { await reader.cancel(); } catch {}
    return { error: json({ error: { code: "INVALID_REQUEST", message: "Request body could not be read" } }, 400) };
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { error: json({ error: { code: "INVALID_REQUEST", message: "Request body must use valid UTF-8 encoding" } }, 400) };
  }
}

/**
 * Compatibility adapter for the existing browser chat contract.
 * The legacy first system message is discarded; server-owned instruction wins.
 */
export async function handleChatRequest(request, env, dependencies = {}) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: RESPONSE_HEADERS });
  if (request.method !== "POST") {
    return json({ error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } }, 405);
  }
  const mediaType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (mediaType !== "application/json") {
    return json({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Content-Type must be application/json" } }, 415);
  }
  if (!env?.OPENROUTER_API_KEY) {
    return json({ error: { code: "PROVIDER_NOT_CONFIGURED", message: "AI provider is not configured" } }, 503);
  }

  const bounded = await readBoundedBody(request);
  if (bounded.error) return bounded.error;

  let body;
  try {
    body = JSON.parse(bounded.text);
  } catch {
    return json({ error: { code: "INVALID_REQUEST", message: "Request body must be valid JSON" } }, 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some(key => key !== "messages") || !Array.isArray(body.messages)) {
    return json({ error: { code: "INVALID_REQUEST", message: "Request must contain only a messages array" } }, 400);
  }

  let messages = body.messages;
  // Existing index.html sends one system message at position zero. Its content is untrusted.
  if (messages.length > 1 && messages[0]?.role === "system") messages = messages.slice(1);

  // Reject untrusted message structure and roles before constructing a provider.
  // This keeps invalid requests away from provider configuration and network adapters.
  if (messages.length === 0) {
    return json({ error: { code: "INVALID_REQUEST", message: "At least one message is required" } }, 400);
  }
  for (const message of messages) {
    if (!message || typeof message !== "object" || Array.isArray(message) ||
        Object.keys(message).some(key => key !== "role" && key !== "content")) {
      return json({ error: { code: "INVALID_REQUEST", message: "Message contains unsupported fields" } }, 400);
    }
    if (message.role !== "user" && message.role !== "assistant") {
      return json({ error: { code: "UNSUPPORTED_ROLE", message: "Message role is not supported" } }, 400);
    }
  }

  const createProvider = dependencies.createProvider ?? createOpenRouterProvider;
  const runCore = dependencies.runCore ?? runSofiaCore;
  let provider;
  try {
    provider = createProvider({
      apiKey: env.OPENROUTER_API_KEY,
      model: env.OPENROUTER_MODEL || "openrouter/free",
      siteUrl: new URL(request.url).origin,
      appName: "Sofia and Alexey",
      ...(dependencies.fetchImpl ? { fetchImpl: dependencies.fetchImpl } : {})
    });
  } catch {
    return json({ error: { code: "INTERNAL_FAILURE", message: "Core configuration is invalid" } }, 500);
  }

  let result;
  try {
    result = await runCore(provider, { messages }, {
      systemInstruction: SYSTEM_INSTRUCTION,
      maxOutputTokens: 1200,
      timeoutMs: 20000,
      signal: request.signal
    });
  } catch {
    return json({ error: { code: "INTERNAL_FAILURE", message: "Core could not complete the request" } }, 500);
  }

  if (!result || typeof result !== "object" || typeof result.ok !== "boolean") {
    return json({ error: { code: "INTERNAL_FAILURE", message: "Core returned an invalid result" } }, 500);
  }

  if (!result.ok) {
    const safeErrors = {
      INVALID_REQUEST: [400, "Request is invalid"],
      UNSUPPORTED_ROLE: [400, "Message role is not supported"],
      REQUEST_TOO_LARGE: [413, "Request exceeds the allowed size"],
      PROVIDER_TIMEOUT: [504, "The AI provider did not respond in time"],
      REQUEST_CANCELLED: [499, "Request was cancelled"],
      PROVIDER_UNAVAILABLE: [502, "The AI provider is temporarily unavailable"],
      VERIFIER_REJECTED: [502, "Provider response failed validation"],
      INTERNAL_FAILURE: [500, "Core could not complete the request"]
    };
    const safeError = result.error && safeErrors[result.error.code];
    if (!safeError) {
      return json({ error: { code: "INTERNAL_FAILURE", message: "Core returned an invalid error" } }, 500);
    }
    return json({
      error: {
        code: result.error.code,
        message: safeError[1]
      }
    }, safeError[0]);
  }

  if (!result.answer || typeof result.answer.text !== "string" ||
      typeof result.answer.providerId !== "string" || typeof result.answer.modelId !== "string") {
    return json({ error: { code: "INTERNAL_FAILURE", message: "Core returned an invalid answer" } }, 500);
  }

  // Preserve the OpenAI-compatible shape consumed by the existing index.html.
  return json({
    choices: [{
      message: {
        role: "assistant",
        content: result.answer.text
      }
    }]
  });
}
