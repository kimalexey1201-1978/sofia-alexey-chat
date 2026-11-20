import { runSofiaCore } from "../core/sofia-core.mjs";
import { createOpenRouterProvider } from "../providers/openrouter-provider.mjs";

const MAX_BODY_BYTES = 64 * 1024;
const SYSTEM_INSTRUCTION = "Ты София, личный ИИ-собеседник. Отвечай по-русски, в женском роде. Обращайся «дорогой», когда уместно. При переводе с русского на корейский дай корейский текст и русскую транскрипцию. При переводе с корейского на русский дай русский перевод. Будь внимательной и точной.";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://kimalexey1201-1978.github.io",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function json(data, status = 200) {
  return Response.json(data, { status, headers: CORS_HEADERS });
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
        await reader.cancel();
        return { error: json({ error: { code: "REQUEST_TOO_LARGE", message: "Request body exceeds the allowed size" } }, 413) };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder().decode(bytes) };
}

/**
 * Compatibility adapter for the existing browser chat contract.
 * The legacy first system message is discarded; server-owned instruction wins.
 */
export async function handleChatRequest(request, env, dependencies = {}) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (request.method !== "POST") {
    return json({ error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } }, 405);
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
  if (messages[0]?.role === "system") messages = messages.slice(1);

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

  const result = await runCore(provider, { messages }, {
    systemInstruction: SYSTEM_INSTRUCTION,
    maxOutputTokens: 1200,
    timeoutMs: 20000
  });

  if (!result.ok) {
    const statusByCode = {
      INVALID_REQUEST: 400,
      UNSUPPORTED_ROLE: 400,
      REQUEST_TOO_LARGE: 413,
      PROVIDER_TIMEOUT: 504,
      PROVIDER_UNAVAILABLE: 502,
      VERIFIER_REJECTED: 502,
      INTERNAL_FAILURE: 500
    };
    return json({
      error: {
        code: result.error.code,
        message: result.error.message
      }
    }, statusByCode[result.error.code] || 500);
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
