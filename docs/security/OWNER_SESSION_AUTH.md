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

- The pairing endpoint still needs request-body size limiting and rate limiting / lockout protection against repeated guessing.
- Image uploads still need a streaming request-body limit before multipart parsing; the post-parse file-size check alone does not cap parser memory use.
- The owner token is a first access gate, not device attestation. It does not prove that a request came from an untampered APK or a particular physical phone.
- Do not enable file mutation, gallery-wide access, or other privileged actions on the basis of this token alone.

## Before enabling

1. Configure both secrets in the intended Worker environment using Cloudflare secret storage.
2. Complete request-size and pairing-rate-limit protections before exposing the endpoints.
3. Review the pending pull request and confirm the Worker deployment target.
4. Pair the Android app using the private pairing code.
5. Verify that missing, invalid, and expired tokens receive HTTP 401 for both protected endpoints.
6. Verify that valid owner sessions can chat and analyze a test image.
7. Rotate both secrets immediately if either is exposed.

No secret values should be placed in this repository, APK resources, or chat messages.
