const encoder = new TextEncoder();
const TOKEN_TTL_SECONDS = 43200;
const MAX_SESSION_BODY_BYTES = 4096;
const PAIRING_CHALLENGE_TTL_SECONDS = 120;
const PAIRING_WORK_DIFFICULTY_BITS = 16;

function hasLeadingZeroBits(bytes, bits) {
  const wholeBytes = Math.floor(bits / 8);
  const remainingBits = bits % 8;
  for (let i = 0; i < wholeBytes; i++) if (bytes[i] !== 0) return false;
  return remainingBits === 0 || (bytes[wholeBytes] >>> (8 - remainingBits)) === 0;
}
async function issuePairingChallenge(env, now = Math.floor(Date.now() / 1000)) {
  if (typeof env?.SOFIA_SESSION_SIGNING_KEY !== "string" || env.SOFIA_SESSION_SIGNING_KEY.length < 32) {
    throw new Error("AUTH_NOT_CONFIGURED");
  }
  const nonce = crypto.getRandomValues(new Uint8Array(16));
  const payload = b64url(encoder.encode(JSON.stringify({
    sub: "pairing-challenge",
    nonce: b64url(nonce),
    iat: now,
    exp: now + PAIRING_CHALLENGE_TTL_SECONDS,
    difficulty: PAIRING_WORK_DIFFICULTY_BITS
  })));
  return {
    challenge: payload + "." + b64url(await sign(payload, env.SOFIA_SESSION_SIGNING_KEY)),
    nonce: b64url(nonce),
    difficulty: PAIRING_WORK_DIFFICULTY_BITS,
    expiresAt: now + PAIRING_CHALLENGE_TTL_SECONDS
  };
}
async function verifyPairingProof(code, challenge, proofCounter, env, now = Math.floor(Date.now() / 1000)) {
  if (typeof code !== "string" || code.length < 20 || code.length > 256 ||
      typeof challenge !== "string" || challenge.length > 512 ||
      typeof proofCounter !== "string" || !/^(0|[1-9][0-9]{0,15})$/.test(proofCounter) ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(challenge) ||
      typeof env?.SOFIA_SESSION_SIGNING_KEY !== "string") return false;
  try {
    const [payloadPart, signaturePart] = challenge.split(".");
    const validSignature = await verifySignature(payloadPart, decodeB64url(signaturePart), env.SOFIA_SESSION_SIGNING_KEY);
    if (!validSignature) return false;
    const payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decodeB64url(payloadPart)));
    if (payload.sub !== "pairing-challenge" || !Number.isInteger(payload.iat) ||
        !Number.isInteger(payload.exp) || payload.iat > now + 30 ||
        payload.exp <= now || payload.exp <= payload.iat ||
        payload.exp - payload.iat > PAIRING_CHALLENGE_TTL_SECONDS ||
        payload.difficulty !== PAIRING_WORK_DIFFICULTY_BITS ||
        typeof payload.nonce !== "string" || !/^[A-Za-z0-9_-]{22}$/.test(payload.nonce)) return false;
    const codeDigest = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(code))));
    const workInput = encoder.encode(payload.nonce + "." + codeDigest + "." + proofCounter);
    const workDigest = new Uint8Array(await crypto.subtle.digest("SHA-256", workInput));
    return hasLeadingZeroBits(workDigest, payload.difficulty);
  } catch { return false; }
}

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
async function equalSecret(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length > 256 || b.length > 256) return false;
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b))
  ]);
  const x = new Uint8Array(left);
  const y = new Uint8Array(right);
  let difference = 0;
  for (let i = 0; i < 32; i++) difference |= x[i] ^ y[i];
  return difference === 0;
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
  if (!(await equalSecret(code, env.SOFIA_OWNER_PAIRING_CODE))) return null;
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
  const headers = { "Access-Control-Allow-Origin": "https://kimalexey1201-1978.github.io", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method === "GET" && new URL(request.url).pathname.endsWith("/challenge")) {
    try {
      return Response.json(await issuePairingChallenge(env), { headers });
    } catch {
      return Response.json({ error: { code: "SESSION_AUTH_NOT_CONFIGURED" } }, { status: 503, headers });
    }
  }
  if (request.method !== "POST") return Response.json({ error: { code: "METHOD_NOT_ALLOWED" } }, { status: 405, headers });
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return Response.json({ error: { code: "UNSUPPORTED_MEDIA_TYPE" } }, { status: 415, headers });
  }
  const parsed = await readBoundedJson(request);
  if (parsed.error === "TOO_LARGE") return Response.json({ error: { code: "REQUEST_TOO_LARGE" } }, { status: 413, headers });
  if (parsed.error) return Response.json({ error: { code: "INVALID_JSON" } }, { status: 400, headers });
  const body = parsed.body;
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).length !== 3 ||
      Object.keys(body).some(key => !["pairingCode", "challenge", "proofCounter"].includes(key)) ||
      typeof body.pairingCode !== "string" || body.pairingCode.length < 20 || body.pairingCode.length > 256 ||
      typeof body.challenge !== "string" || typeof body.proofCounter !== "string") {
    return Response.json({ error: { code: "INVALID_PAIRING_CODE" } }, { status: 400, headers });
  }
  try {
    if (!(await verifyPairingProof(body.pairingCode, body.challenge, body.proofCounter, env))) {
      return Response.json({ error: { code: "INVALID_PAIRING_PROOF" } }, { status: 401, headers });
    }
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
