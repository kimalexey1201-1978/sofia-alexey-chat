const MAX_FAILED_ATTEMPTS = 5;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;
const MAX_BODY_BYTES = 1024;

function equalConstantTime(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

/**
 * One named instance is used for the single Sofia owner pairing gate.
 * State is persisted transactionally; the supplied secrets are never stored.
 */
export class PairingGuard {
  constructor(ctx) {
    this.storage = ctx.storage;
  }

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

    const now = Date.now();
    const result = await this.storage.transaction(async txn => {
      let state = await txn.get("pairing-state");
      // Check the active lockout before expiring the rolling failure window.
      if (state?.lockedUntil > now) return { status: 429 };
      if (!state || now - state.windowStartedAt >= FAILURE_WINDOW_MS) {
        state = { windowStartedAt: now, failedAttempts: 0, lockedUntil: 0 };
      }
      if (equalConstantTime(body.pairingCode, body.expectedCode)) {
        await txn.delete("pairing-state");
        return { status: 200 };
      }
      state.failedAttempts += 1;
      if (state.failedAttempts >= MAX_FAILED_ATTEMPTS) {
        state.lockedUntil = now + LOCKOUT_MS;
        await txn.put("pairing-state", state);
        return { status: 429 };
      }
      await txn.put("pairing-state", state);
      return { status: 401 };
    });

    if (result.status === 200) return Response.json({ valid: true });
    if (result.status === 429) {
      return Response.json({ error: "PAIRING_TEMPORARILY_BLOCKED" }, { status: 429, headers: { "Retry-After": "900" } });
    }
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}
