const encoder = new TextEncoder();
const TOKEN_TTL_SECONDS = 43200;
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
function equal(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function sign(data, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));
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
  const parts = header.slice(7).split(".");
  if (parts.length !== 2 || typeof env?.SOFIA_SESSION_SIGNING_KEY !== "string") return false;
  try {
    if (!equal(parts[1], b64url(await sign(parts[0], env.SOFIA_SESSION_SIGNING_KEY)))) return false;
    const payload = JSON.parse(new TextDecoder().decode(decodeB64url(parts[0])));
    return payload.sub === "owner" && Number.isInteger(payload.iat) && Number.isInteger(payload.exp) &&
      payload.iat <= now + 60 && payload.exp > now && payload.exp - payload.iat <= TOKEN_TTL_SECONDS;
  } catch { return false; }
}
export async function handleSessionRequest(request, env) {
  const headers = { "Access-Control-Allow-Origin": "https://kimalexey1201-1978.github.io", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return Response.json({ error: { code: "METHOD_NOT_ALLOWED" } }, { status: 405, headers });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: { code: "INVALID_JSON" } }, { status: 400, headers }); }
  if (typeof body?.pairingCode !== "string" || body.pairingCode.length < 20 || body.pairingCode.length > 256) return Response.json({ error: { code: "INVALID_PAIRING_CODE" } }, { status: 400, headers });
  try {
    const session = await issueOwnerSession(body.pairingCode, env);
    if (!session) return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401, headers });
    return Response.json({ ok: true, ...session }, { headers });
  } catch { return Response.json({ error: { code: "SESSION_AUTH_NOT_CONFIGURED" } }, { status: 503, headers }); }
}
