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
- The Durable Object class, Worker export, and Wrangler `SOFIA_PAIRING_GUARD` binding with SQLite storage declaration are included in this branch. The CI `wrangler deploy --dry-run` validates the build/configuration only; it does not deploy the Worker or provision a Durable Object namespace.
- Image uploads now enforce a streaming request-body limit of 5 MiB plus 64 KiB before multipart parsing, in addition to the 5 MiB file-size check.
- The owner token is a first access gate, not device attestation. It does not prove that a request came from an untampered APK or a particular physical phone.
- Do not enable file mutation, gallery-wide access, or other privileged actions on the basis of this token alone.

## Before enabling

1. Configure both secrets in the intended Worker environment using Cloudflare secret storage.
2. Confirm the Preview target is a separate Worker script named `sofia-preview`, not the Production Worker named `sofia`. The repository uses the same Wrangler config and overrides the script name for Preview; the CI dry-run validates this target with `--name sofia-preview`.
3. After the Preview script is created by its first code deployment, add two independently generated Preview-only secrets using `npx wrangler secret put SOFIA_OWNER_PAIRING_CODE --name sofia-preview` and `npx wrangler secret put SOFIA_SESSION_SIGNING_KEY --name sofia-preview`. Each `secret put` creates and deploys a new Worker version, so use these commands only against the confirmed Preview script. Never copy Production secret values into Preview.
4. Deploy the branch with `npx wrangler deploy --name sofia-preview`. Confirm the account and target script name in Wrangler output before proceeding. The first deployment provisions the SQLite-backed Durable Object namespace for that Worker script; it must not target the Production script.
5. Verify the fifth-failure lockout, persistence across object recreation, correct-code recovery after expiry, and fail-closed behavior.
6. Verify that missing, invalid, and expired tokens receive HTTP 401 for both protected endpoints.
7. Verify that valid Preview owner sessions can chat and analyze a harmless test image. Do not point the Android Production app at Preview.
8. Review the pending pull requests and confirm the Production rollout plan separately. Rotate both secrets immediately if either is exposed.

No secret values should be placed in this repository, APK resources, or chat messages.
