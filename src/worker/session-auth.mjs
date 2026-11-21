const encoder = new TextEncoder();
const TOKEN_TTL_SECONDS = 43200;
const MAX_SESSION_BODY_BYTES = 4096;

function b64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).split("=").join("").replaceAll("+", "-").replaceAll("/", "_");
}
function decodeB64url(value) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
async function hmacKey(secret, usages) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, usages);
}
async function sign(data, secret) {
  const key = await hmacKey(secret, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));
}
async function verifySignature(data, signature, secret) {
  const key = await hmacKey(secret, ["verify"]);
  return crypto.subtle.verify("HMAC", key, signature, encoder.encode(data));
}
async function readBoundedJson(request) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SESSION_BODY_BYTES) return { error: "TOO_LARGE" };
  if (!request.body) return { error: "INVALID" };
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_SESSION_BODY_BYTES) {
        try { await reader.cancel(); } catch {}
        return { error: "TOO_LARGE" };
      }
      chunks.push(value);
    }
  } catch {
    try { await reader.cancel(); } catch {}
    return { error: "INVALID" };
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
    return { body: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) };
  } catch {
    return { error: "INVALID" };
  }
}
export async function issueOwnerSession(code, env, now = Math.floor(Date.now() / 1000)) {
  if (typeof env?.SOFIA_OWNER_PAIRING_CODE !== "string" || env.SOFIA_OWNER_PAIRING_CODE.length < 20 ||
      typeof env?.SOFIA_SESSION_SIGNING_KEY !== "string" || env.SOFIA_SESSION_SIGNING_KEY.length < 32) throw new Error("AUTH_NOT_CONFIGURED");
  if (!equal(code, env.SOFIA_OWNER_PAIRING_CODE)) return null;
  const payload = b64url(encoder.encode(JSON.stringify({ sub: "owner", iat: now, exp: now + TOKEN_TTL_SECONDS })));
  return { token: payload + "." + b64url(await sign(payload, env.SOFIA_SESSION_SIGNING_KEY)), expiresAt: now + TOKEN_TTL_SECONDS };
}
export async function verifyOwnerSession(request, env, now = Math.floor(Date.now() / 1000)) {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) return false;
  if (header.length > 512) return false;
  const parts = header.slice(7).split(".");
  if (parts.length !== 2 || parts[0].length > 256 || parts[1].length > 128 ||
      !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]+$/.test(parts[1]) ||
      typeof env?.SOFIA_SESSION_SIGNING_KEY !== "string") return false;
  try {
    const valid = await verifySignature(parts[0], decodeB64url(parts[1]), env.SOFIA_SESSION_SIGNING_KEY);
    if (!valid) return false;
    const payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decodeB64url(parts[0])));
    return payload.sub === "owner" && Number.isInteger(payload.iat) && Number.isInteger(payload.exp) &&
      payload.iat <= now + 60 && payload.exp > now && payload.exp > payload.iat &&
      payload.exp - payload.iat <= TOKEN_TTL_SECONDS;
  } catch { return false; }
}
export async function handleSessionRequest(request, env) {
  const headers = { "Access-Control-Allow-Origin": "https://kimalexey1201-1978.github.io", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return Response.json({ error: { code: "METHOD_NOT_ALLOWED" } }, { status: 405, headers });
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return Response.json({ error: { code: "UNSUPPORTED_MEDIA_TYPE" } }, { status: 415, headers });
  }
  const parsed = await readBoundedJson(request);
  if (parsed.error === "TOO_LARGE") return Response.json({ error: { code: "REQUEST_TOO_LARGE" } }, { status: 413, headers });
  if (parsed.error) return Response.json({ error: { code: "INVALID_JSON" } }, { status: 400, headers });
  const body = parsed.body;
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some(key => key !== "pairingCode") ||
      typeof body.pairingCode !== "string" || body.pairingCode.length < 20 || body.pairingCode.length > 256) {
    return Response.json({ error: { code: "INVALID_PAIRING_CODE" } }, { status: 400, headers });
  }
  try {
    if (!env?.SOFIA_PAIRING_GUARD) {
      return Response.json({ error: { code: "PAIRING_PROTECTION_NOT_CONFIGURED" } }, { status: 503, headers });
    }
    const guardId = env.SOFIA_PAIRING_GUARD.idFromName("sofia-owner-pairing");
    const guard = env.SOFIA_PAIRING_GUARD.get(guardId);
    const guardResponse = await guard.fetch("https://pairing-guard.internal/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pairingCode: body.pairingCode, expectedCode: env.SOFIA_OWNER_PAIRING_CODE })
    });
    if (!guardResponse.ok) {
      if (guardResponse.status === 401) return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401, headers });
      return Response.json({ error: { code: "PAIRING_PROTECTION_UNAVAILABLE" } }, { status: 503, headers });
    }
    const session = await issueOwnerSession(body.pairingCode, env);
    if (!session) return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401, headers });
    return Response.json({ ok: true, ...session }, { headers });
  } catch { return Response.json({ error: { code: "SESSION_AUTH_NOT_CONFIGURED" } }, { status: 503, headers }); }
}
