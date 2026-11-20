# Owner Authentication and Worker Protection — Design Proposal v1

## Status

Proposed design for review. This document is not an implementation and does not enable or change authentication on the deployed Worker. No production settings, secrets, deployments, or the `main` branch are changed.

## 1. Security objective

Only the authenticated owner may invoke private Sofia Core capabilities. A public URL, CORS allowlist, GitHub Pages origin, device name, voice match, or model-generated statement is not proof of owner identity.

The current prototype remains inference-only. Personal mail, messaging, files, and other private integrations remain disabled until authentication, authorization, privacy egress controls, and audit acceptance tests are implemented.

## 2. Trust boundaries

1. **Browser / Android client:** untrusted. It may hold a short-lived access token in memory but must not contain provider API keys or long-lived client secrets.
2. **Sofia Worker API:** policy enforcement point. It validates identity evidence on every protected request before invoking Sofia Core.
3. **Identity provider (IdP):** authenticates the owner and issues signed tokens. It is not trusted merely because the client says authentication succeeded; Worker validates issuer, signature, audience, expiry and other required claims.
4. **Sofia Core:** receives a server-verified principal/session context from the Worker. It never accepts identity or permissions asserted in chat messages.
5. **External model provider:** receives only data permitted by the privacy/egress policy. It is not an identity provider or authorization authority.

## 3. Recommended authentication flow (provider-neutral)

Use OpenID Connect Authorization Code Flow with PKCE for the browser client, subject to selection and validation of a concrete identity provider.

1. Client starts login using a cryptographically random state and PKCE verifier/challenge.
2. Owner authenticates at the identity provider.
3. Client completes the authorization-code exchange using the supported secure flow; no client secret is embedded in the static GitHub Pages application.
4. Worker validates the resulting access token (or a securely exchanged Worker session) including signature against trusted issuer keys, exact issuer, audience, expiry, not-before, allowed algorithm, subject, and required scopes/claims.
5. Worker constructs a server-owned authentication context and passes it to Core.
6. Tokens are short-lived. Renewal and revocation behavior must be defined before production use.

The exact token delivery/session design must account for the current cross-origin topology (GitHub Pages frontend and Cloudflare Worker API), browser third-party-cookie restrictions, Android WebView behavior, CSRF, and logout. Do not assume a cookie or localStorage token strategy is safe or universally supported.

## 4. Token and session handling requirements

- Never place API keys, client secrets, signing keys, refresh tokens, or long-lived bearer credentials in frontend source, Git history, localStorage, or chat history.
- Prefer an HttpOnly, Secure, appropriately SameSite cookie only where the cross-origin and CSRF design is proven; otherwise use short-lived access tokens held in memory and a separately secured renewal mechanism.
- Validate tokens on every request; never trust decoded-but-unverified JWT claims.
- Pin accepted issuer, audience, algorithms, and JWKS source. Cache signing keys safely and handle key rotation.
- Reject expired, not-yet-valid, malformed, wrong-audience, wrong-issuer, revoked (where supported), or replayed request evidence.
- Bind high-risk approvals to the exact action, parameters, principal, and a short expiry.
- Provide logout, per-device revocation, global session revocation, and credential recovery.
- Use TLS only; never downgrade to an unauthenticated fallback if the IdP is unavailable.

## 5. Authorization and capability boundaries

Authentication identifies the principal; it does not grant every capability.

- Worker denies protected requests when no valid owner context exists.
- Core and tool adapters receive an explicit, minimal authority context, not a raw token.
- Default permissions are deny-by-default and scoped by capability, target, data class, and task.
- Read, draft, send, delete, export, and account-security operations are distinct capabilities.
- Sending messages, deleting/exporting private data, changing credentials, or connecting new accounts requires explicit action-bound owner confirmation and step-up authentication appropriate to risk.
- External providers and models cannot grant themselves permissions or alter owner identity.
- Private integrations remain feature-disabled until the full gate is enforced.

## 6. Abuse and spend protection

After identity is established, add server-side controls keyed by authenticated principal and, where appropriate, device/session:

- request rate and concurrent-request limits;
- provider/model spend and token budgets;
- replay protection for sensitive actions;
- anomaly signals and temporary lockout/risk escalation;
- safe, non-revealing error responses.

These controls protect the provider account and owner data. They must not introduce arbitrary daily conversation caps. Limits should be transparent, configurable, and distinguish abuse protection from ordinary product usage.

## 7. Cross-origin and deployment compatibility

The existing frontend is served from GitHub Pages and calls the Worker on a different origin. CORS remains a browser transport policy, not authentication. Any credentialed cross-origin design must use an exact origin allowlist, explicit allowed headers/methods, correct credential settings, and CSRF protections where cookies are used. Wildcard origins are prohibited for authenticated requests.

Do not make the current public chat suddenly require an unconfigured login. Implement authentication behind a versioned route or explicit feature flag, test a complete owner login and logout flow, and only then plan a separately approved cutover. Preserve the existing storage keys and chat transcript format.

## 8. Provider selection gate

No identity provider is selected in this proposal. Before implementation, compare candidates against:

- passkey support and account recovery;
- OIDC Authorization Code + PKCE support;
- stable issuer/audience and JWKS validation;
- short-lived access tokens and refresh-token rotation/revocation;
- account export/deletion and security event visibility;
- privacy, retention, data residency, availability and pricing;
- compatibility with GitHub Pages, Cloudflare Workers, Android browser/WebView and future native Android;
- ability to avoid embedding confidential credentials in a public client.

Do not choose a provider solely because it is easy to configure. Avoid custom password storage or custom cryptography.

## 9. Required tests before enabling protected traffic

1. No token, malformed token, invalid signature, wrong issuer, wrong audience, expired token and not-yet-valid token are rejected.
2. A client-supplied `principal_id`, role, assurance level, or system prompt cannot override the verified context.
3. A token for another application/API audience is rejected.
4. Key rotation works without accepting unknown issuers or algorithms.
5. Revoked or logged-out sessions are rejected according to the documented revocation model.
6. CORS preflight does not grant access; direct non-browser callers still require valid authentication.
7. Cookie-based sessions (if selected) pass CSRF tests; bearer-token flow does not persist long-lived credentials in localStorage.
8. Rate, concurrency and spend controls are enforced server-side and scoped to the verified principal.
9. Authentication/authorization failures do not leak secrets, token contents, personal data, or internal diagnostics.
10. Existing chat history, avatar storage, retry behavior and response contract remain compatible.
11. Existing public prototype remains available until the new flow is tested and a cutover is explicitly approved.
12. No deployment or production secret/configuration change occurs without separate owner approval.

## 10. Implementation sequence

A. Finalize the identity provider and session transport decision.
B. Implement an isolated token/session verifier with unit tests and injected JWKS/fetch fixtures.
C. Add Worker middleware that produces trusted authentication context; keep it disabled on the live route until tested.
D. Add principal-scoped rate/concurrency/spend protection.
E. Add authorization policy checks and action-bound approval interfaces.
F. Run integration, abuse, cross-origin, Android compatibility, and regression tests.
G. Conduct a security review; only then request approval for deployment and cutover.

## 11. Explicit non-goals

This proposal does not implement login, passkeys, biometric authentication, mail access, message sending, persistent sessions, or production enforcement. It does not claim that Cloudflare or any external provider currently authenticates the owner.
