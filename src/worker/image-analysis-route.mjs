import { verifyOwnerSession } from "./session-auth.mjs";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const HEADERS = {
  "Access-Control-Allow-Origin": "https://kimalexey1201-1978.github.io",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer"
};
const json = (data, status = 200) => Response.json(data, { status, headers: HEADERS });

function toBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export async function handleImageAnalysisRequest(request, env, dependencies = {}) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: HEADERS });
  if (request.method !== "POST") return json({ error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } }, 405);
  if (!(await verifyOwnerSession(request, env))) return json({ error: { code: "UNAUTHORIZED", message: "Owner session is required" } }, 401);
  const type = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (type !== "multipart/form-data") return json({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Expected multipart image upload" } }, 415);

  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES + 64 * 1024) {
    return json({ error: { code: "IMAGE_TOO_LARGE", message: "Image exceeds the 5 MB limit" } }, 413);
  }
  if (!env?.OPENROUTER_API_KEY || !env?.OPENROUTER_VISION_MODEL) {
    return json({ error: { code: "VISION_NOT_CONFIGURED", message: "Image analysis is not configured on the server" } }, 503);
  }

  let form;
  try { form = await request.formData(); }
  catch { return json({ error: { code: "INVALID_MULTIPART", message: "Image upload could not be read" } }, 400); }
  const file = form.get("image");
  const prompt = form.get("prompt");
  if (!(file instanceof File)) return json({ error: { code: "IMAGE_REQUIRED", message: "One image file is required" } }, 400);
  if (!ALLOWED_TYPES.has(file.type.toLowerCase())) {
    return json({ error: { code: "UNSUPPORTED_IMAGE_TYPE", message: "Only JPEG, PNG, WebP and GIF images are supported" } }, 415);
  }
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    return json({ error: { code: "IMAGE_TOO_LARGE", message: "Image must be between 1 byte and 5 MB" } }, 413);
  }
  const userPrompt = typeof prompt === "string" && prompt.trim()
    ? prompt.trim().slice(0, 2000)
    : "Опиши изображение кратко и точно. Отделяй видимые факты от предположений. Не пытайся устанавливать личность людей.";
  const bytes = new Uint8Array(await file.arrayBuffer());
  const dataUrl = `data:${file.type.toLowerCase()};base64,${toBase64(bytes)}`;
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch;

  try {
    const response = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "X-Title": "Sofia AI"
      },
      body: JSON.stringify({
        model: env.OPENROUTER_VISION_MODEL,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: userPrompt },
            { type: "image_url", image_url: { url: dataUrl } }
          ]
        }],
        max_tokens: 700,
        temperature: 0.2
      })
    });
    if (!response?.ok) return json({ error: { code: "VISION_PROVIDER_UNAVAILABLE", message: "Image analysis provider is unavailable" } }, 502);
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    const text = typeof content === "string"
      ? content
      : Array.isArray(content) ? content.filter(part => part?.type === "text").map(part => part.text).join("\n") : "";
    if (!text.trim()) return json({ error: { code: "INVALID_VISION_RESPONSE", message: "Image analysis returned no usable text" } }, 502);
    return json({
      ok: true,
      analysis: { text: text.slice(0, 12000), providerId: "openrouter", modelId: data.model || env.OPENROUTER_VISION_MODEL },
      retention: "not_stored_by_this_endpoint"
    });
  } catch {
    return json({ error: { code: "VISION_PROVIDER_UNAVAILABLE", message: "Image analysis provider is unavailable" } }, 502);
  }
}
