# Sofia owner session authentication

The image-analysis endpoint is private and requires a short-lived owner session. The pairing code and signing key are server-side secrets; neither is committed to the repository or embedded in the APK.

## Required Cloudflare Worker secrets

Configure these secrets for the Worker environment that serves `sofia.kim-alexey1201.workers.dev`:

- `SOFIA_OWNER_PAIRING_CODE`: generate a random value of at least 32 characters. Enter this value in Sofia's **Доступ** dialog to pair the app.
- `SOFIA_SESSION_SIGNING_KEY`: generate an independent random value of at least 48 characters. This signs session tokens and must not be the pairing code.

Use Cloudflare Worker secret storage (not plaintext variables, source files, GitHub commits, or APK resources). Generate independent values with a cryptographically secure password generator. Do not send either secret in chat or email.

## Session behavior

- `POST /api/session` exchanges the pairing code for an HMAC-SHA256 signed bearer token.
- Tokens identify the owner and expire after 12 hours.
- The Android app holds the token in memory only. Closing/restarting the app requires pairing again.
- `POST /api/analyze-image` rejects requests without a valid, unexpired owner token.
- Pairing codes are not returned, logged by this module, or stored by the Android app.
- The current protection applies to image analysis. The existing `/api/chat` endpoint remains unchanged and must receive its own authorization design before it handles private data or privileged operations.

## Before enabling

1. Configure both Worker secrets in the correct production and preview environments as appropriate.
2. Deploy the feature branch only after reviewing the pending CI run and confirming the Worker deployment target.
3. Pair the Android app using the private pairing code.
4. Verify that missing, invalid, and expired tokens receive HTTP 401.
5. Verify that valid owner sessions can analyze a test image.
6. Rotate both secrets immediately if either is exposed.

This mechanism is a first owner gate, not device attestation. It does not prove that a request came from an untampered APK or a particular physical phone. Do not enable file mutation, gallery-wide access, or other privileged actions on the basis of this token alone.
