import test from "node:test";
import assert from "node:assert/strict";
import { makePairingProof } from "../../src/client/pairing-proof.mjs";

test("browser pairing solver finds a 16-bit proof bound to the candidate code", async () => {
  const code = "owner-code-".padEnd(32, "x");
  const nonce = "AAECAwQFBgcICQoLDA0ODw";
  const counter = await makePairingProof(code, nonce, 16);
  assert.match(counter, /^(0|[1-9][0-9]{0,15})$/);
  const codeHashBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code)));
  let binary = "";
  for (const byte of codeHashBytes) binary += String.fromCharCode(byte);
  const codeHash = btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  const digest = new Uint8Array(await crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode(nonce + "." + codeHash + "." + counter)
  ));
  assert.equal(digest[0], 0);
  assert.equal(digest[1], 0);
});

test("browser pairing solver rejects malformed challenges", async () => {
  await assert.rejects(() => makePairingProof("short", "AAECAwQFBgcICQoLDA0ODw", 16), /INVALID_PAIRING_CHALLENGE/);
  await assert.rejects(() => makePairingProof("owner-code-".padEnd(32, "x"), "bad", 16), /INVALID_PAIRING_CHALLENGE/);
  await assert.rejects(() => makePairingProof("owner-code-".padEnd(32, "x"), "AAECAwQFBgcICQoLDA0ODw", 20), /INVALID_PAIRING_CHALLENGE/);
});
