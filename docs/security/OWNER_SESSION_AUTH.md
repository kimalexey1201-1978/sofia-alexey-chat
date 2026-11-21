# Sofia owner session authentication

The chat and image-analysis endpoints require a short-lived owner session. The pairing code and signing key are server-side secrets; neither is committed to the repository or embedded in the APK.

## Required Cloudflare Worker secrets

Configure these secrets for each Worker environment that serves Sofia:

- `SOFIA_OWNER_PAIRING_CODE`: generate a cryptographically random value of at least 32 characters. Enter this value in Sofia's **Доступ** dialog to pair the app.
- `SOFIA_SESSION_SIGNING_KEY`: generate an independent cryptographically random value of at least 48 characters. This signs session tokens and must not be the pairing code.

Use Cloudflare Worker secret storage (not plaintext variables, source files, GitHub commits, or APK resources). Do not send either secret in chat or email.

## Session behavior

- `GET /api/session/challenge` issues a short-lived HMAC-signed challenge with a random nonce and a 16-bit Hashcash difficulty. The client searches for a counter whose SHA-256 digest over the nonce, SHA-256 hash of the candidate code, and counter has 16 leading zero bits; `POST /api/session` verifies this proof with one SHA-256 operation before checking the code and issuing an HMAC-SHA256 bearer token.
- Tokens identify the owner and expire after 12 hours.
- The Android app holds its token in memory. The web client holds its token in `sessionStorage`; clearing the browser tab session requires pairing again.
- `POST /api/chat` and `POST /api/analyze-image` both require a valid, unexpired owner token.
- Pairing codes are not returned by the endpoint.
- The web client uses the active same-origin Worker for Preview/Production; GitHub Pages uses the configured Production Worker endpoint. The native Android app currently targets the Production Worker endpoint.

## Security limitations before deployment

- The pairing endpoint enforces a 4 KiB streaming request-body limit, JSON content type, strict top-level field validation, a two-minute signed challenge, and a code-bound 16-bit Hashcash proof. This imposes roughly 65,536 SHA-256 trials per candidate while server-side proof verification requires only one hash. It stores no failed-attempt counters and cannot lock out the owner. It is an abuse-friction layer, not a strict rate limit, and does not replace a high-entropy random pairing code. It is not a strict rate limit and does not replace a high-entropy random pairing code; distributed attackers with substantial compute can still make guesses.
- Pairing verification is delegated to a named Durable Object, but the verifier is stateless: it stores no failed-attempt counter, lockout timestamp, or shared authentication state. Any number of incorrect attempts returns HTTP 401 and cannot create a global owner lockout. This intentionally removes the denial-of-service risk created by a shared lockout counter.
- The Worker fails closed with HTTP 503 if the `SOFIA_PAIRING_GUARD` binding is absent or unavailable. The pairing code is passed only through the internal Worker-to-DO binding request and is never persisted by the Durable Object.
- The Durable Object class, Worker export, and Wrangler `SOFIA_PAIRING_GUARD` binding are included in this branch. The class is stateless and is registered as a standard Durable Object (`new_classes`); it does not require SQLite storage. The CI `wrangler deploy --dry-run` validates the build/configuration only; it does not deploy the Worker or provision a Durable Object namespace.
- Image uploads now enforce a streaming request-body limit of 5 MiB plus 64 KiB before multipart parsing, in addition to the 5 MiB file-size check.
- The owner token is a first access gate, not device attestation. It does not prove that a request came from an untampered APK or a particular physical phone.
- Do not enable file mutation, gallery-wide access, or other privileged actions on the basis of this token alone.

## Before enabling

1. Configure both secrets in the intended Worker environment using Cloudflare secret storage.
2. Confirm the Preview target is a separate Worker script named `sofia-preview`, not the Production Worker named `sofia`. The repository uses the same Wrangler config and overrides the script name for Preview; the CI dry-run validates this target with `--name sofia-preview`.
3. From the reviewed branch, make the first code deployment with `npx wrangler deploy --name sofia-preview`. Confirm the Cloudflare account and target script name in Wrangler output before proceeding. This first deployment provisions the standard Durable Object namespace for the Preview script; the stateless class does not require SQLite storage. It must not target Production.
4. Add two independently generated Preview-only secrets using `npx wrangler secret put SOFIA_OWNER_PAIRING_CODE --name sofia-preview` and `npx wrangler secret put SOFIA_SESSION_SIGNING_KEY --name sofia-preview`. Each `secret put` creates and deploys a new Worker version, so use these commands only against the confirmed Preview script. Never copy Production secret values into Preview.
5. Verify that repeated incorrect attempts never block a subsequent correct owner pairing, including concurrent attempts and Durable Object restarts; also verify fail-closed behavior when the guard is unavailable. Before Production use, add an abuse-control mechanism that does not key a hard lockout to a shared mobile IP address. Cloudflare's approximate Rate Limiting binding is not a strict global limiter and its documentation cautions against IP-only keys because mobile networks and proxies share addresses.
6. Verify that missing, invalid, and expired tokens receive HTTP 401 for both protected endpoints.
7. Verify that valid Preview owner sessions can chat and analyze a harmless test image. Do not point the Android Production app at Preview.
8. Review the pending pull requests and confirm the Production rollout plan separately. Rotate both secrets immediately if either is exposed.

No secret values should be placed in this repository, APK resources, or chat messages.
