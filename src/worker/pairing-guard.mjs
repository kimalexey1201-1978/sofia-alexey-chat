const MAX_BODY_BYTES = 1024;

async function equalSecret(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(a)),
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(b))
  ]);
  const x = new Uint8Array(left);
  const y = new Uint8Array(right);
  let difference = 0;
  for (let i = 0; i < 32; i++) difference |= x[i] ^ y[i];
  return difference === 0;
}

/**
 * Stateless pairing verifier.
 *
 * Deliberately keeps no failed-attempt counter, lockout timestamp, or other
 * shared authentication state. An unauthenticated caller must never be able
 * to create a global lockout that prevents the owner from pairing.
 */
export class PairingGuard {
  constructor(_ctx) {}

  async fetch(request) {
    if (request.method !== "POST" || new URL(request.url).pathname !== "/verify") {
      return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
      return Response.json({ error: "UNSUPPORTED_MEDIA_TYPE" }, { status: 415 });
    }
    const length = Number(request.headers.get("content-length"));
    if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
      return Response.json({ error: "REQUEST_TOO_LARGE" }, { status: 413 });
    }
    if (!request.body) return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });

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
          return Response.json({ error: "REQUEST_TOO_LARGE" }, { status: 413 });
        }
        chunks.push(value);
      }
    } catch {
      try { await reader.cancel(); } catch {}
      return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
    } finally {
      reader.releaseLock();
    }

    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    let body;
    try {
      body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch {
      return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }
    if (!body || Array.isArray(body) || typeof body !== "object" ||
        Object.keys(body).length !== 2 ||
        typeof body.pairingCode !== "string" || typeof body.expectedCode !== "string" ||
        body.pairingCode.length < 20 || body.pairingCode.length > 256 ||
        body.expectedCode.length < 20 || body.expectedCode.length > 256) {
      return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }

    if (!(await equalSecret(body.pairingCode, body.expectedCode))) {
      return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    return Response.json({ valid: true });
  }
}
