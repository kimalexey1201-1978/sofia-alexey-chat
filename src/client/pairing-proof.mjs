const encoder = new TextEncoder();

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function makePairingProof(code, nonce, difficulty = 16) {
  if (typeof code !== "string" || code.length < 20 || code.length > 256 ||
      typeof nonce !== "string" || !/^[A-Za-z0-9_-]{22}$/.test(nonce) ||
      difficulty !== 16) throw new TypeError("INVALID_PAIRING_CHALLENGE");
  const codeHash = base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(code))));
  for (let counter = 0; counter < 0x7fffffff; counter++) {
    const digest = new Uint8Array(await crypto.subtle.digest(
      "SHA-256", encoder.encode(nonce + "." + codeHash + "." + counter)
    ));
    if (digest[0] === 0 && digest[1] === 0) return String(counter);
  }
  throw new Error("PAIRING_PROOF_NOT_FOUND");
}
