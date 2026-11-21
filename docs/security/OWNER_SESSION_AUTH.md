# Sofia owner session authentication

The chat and image-analysis endpoints require a short-lived owner session. The pairing code and signing key are server-side secrets; neither is committed to the repository or embedded in the APK.

## Required Cloudflare Worker secrets

Configure these secrets for each Worker environment that serves Sofia:

- `SOFIA_OWNER_PAIRING_CODE`: generate a cryptographically random value of at least 32 characters. Enter this value in Sofia's **Доступ** dialog to pair the app.
- `SOFIA_SESSION_SIGNING_KEY`: generate an independent cryptographically random value of at least 48 characters. This signs session tokens and must not be the pairing code.

Use Cloudflare Worker secret storage (not plaintext variables, source files, GitHub commits, or APK resources). Do not send either secret in chat or email.

## Session behavior

- `POST /api/session` exchanges the pairing code for an HMAC-SHA256 signed bearer token.
- Tokens identify the owner and expire after 12 hours.
- The Android app holds its token in memory. The web client holds its token in `sessionStorage`; clearing the browser tab session requires pairing again.
- `POST /api/chat` and `POST /api/analyze-image` both require a valid, unexpired owner token.
- Pairing codes are not returned by the endpoint.
- The web client uses the active same-origin Worker for Preview/Production; GitHub Pages uses the configured Production Worker endpoint. The native Android app currently targets the Production Worker endpoint.

## Security limitations before deployment

- The pairing endpoint enforces a 4 KiB streaming request-body limit, JSON content type, and strict top-level field validation.
- Pairing verification is delegated to one named SQLite-backed Durable Object. It allows four failed attempts in a 15-minute window; the fifth failure starts a 15-minute lockout. The state is persisted transactionally and is shared across Cloudflare locations.
- The Worker fails closed with HTTP 503 if the `SOFIA_PAIRING_GUARD` binding is absent or unavailable. The pairing code is passed only through the internal Worker-to-DO binding request and is never persisted by the Durable Object.
- The Durable Object class and runtime integration are implemented in this branch, but the Wrangler binding/export declaration is intentionally not added yet. It must be reviewed and configured as a separate deployment step.
- Image uploads now enforce a streaming request-body limit of 5 MiB plus 64 KiB before multipart parsing, in addition to the 5 MiB file-size check.
- The owner token is a first access gate, not device attestation. It does not prove that a request came from an untampered APK or a particular physical phone.
- Do not enable file mutation, gallery-wide access, or other privileged actions on the basis of this token alone.

## Before enabling

1. Configure both secrets in the intended Worker environment using Cloudflare secret storage.
2. Add the `SOFIA_PAIRING_GUARD` binding and declare `PairingGuard` as a SQLite-backed Durable Object in Wrangler configuration; review the Cloudflare lifecycle mechanism already used by the Worker before choosing `exports` or legacy `migrations`.
3. Deploy to a non-production Preview environment and verify the fifth-failure lockout, persistence, correct-code recovery after expiry, and fail-closed behavior.
4. Review the pending pull request and confirm the Worker deployment target.
5. Pair the Android app using the private pairing code.
6. Verify that missing, invalid, and expired tokens receive HTTP 401 for both protected endpoints.
7. Verify that valid owner sessions can chat and analyze a test image.
8. Rotate both secrets immediately if either is exposed.

No secret values should be placed in this repository, APK resources, or chat messages.
