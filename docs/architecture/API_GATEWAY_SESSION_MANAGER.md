# API Gateway & Session Manager

**Status:** Architecture specification  
**Version:** 1.0  
**Applies to:** Web prototype, Android client, Sofia Core services, and external integrations

## 1. Purpose

The API Gateway & Session Manager (AGSM) is the controlled network boundary between Sofia clients and server-side capabilities. It authenticates and scopes requests, validates contracts, enforces quotas and abuse controls, protects server-owned instructions, and creates auditable session context for downstream services.

The gateway is a transport and security boundary. It is not the policy authority by itself: Security Manager remains the source of authorization decisions, and Task Orchestrator remains the owner of task execution.

## 2. Critical prototype boundary

The inspected prototype exposes `POST /api/chat` through a Cloudflare Worker. The browser currently supplies a system message as part of the message array forwarded to the model provider. This is not a trusted boundary.

The target design must:
- keep system instructions and policy prompts server-owned;
- reject or ignore client attempts to set system/developer roles, provider selection, privileged tool definitions, authority levels, or security policy;
- accept only explicitly supported user/assistant conversation data under a strict schema;
- reconstruct the provider request on the server from trusted configuration and validated client input;
- keep provider credentials in server-side secret bindings;
- avoid trusting browser storage, client-supplied identity, or client-provided authorization claims.

Migration must preserve the existing user experience and browser storage keys unless a separately tested migration is approved. Do not deploy or modify production as part of architecture-only work.

## 3. Responsibilities

AGSM owns:
- API route registration and versioning;
- request size, content type, schema, and rate validation;
- client/session authentication and session lifecycle;
- request correlation and idempotency;
- per-client, per-session, and per-route quotas;
- CSRF/origin protections where applicable to cookie-authenticated flows;
- server-side assembly of trusted provider requests;
- safe error normalization and response shaping;
- gateway audit events and operational telemetry.

AGSM does not own:
- final permission decisions;
- model selection policy;
- memory access policy;
- task planning or action execution;
- long-term user identity enrollment.

These are delegated to IAM, Security Manager, AI Provider Gateway, Knowledge & Memory Manager, and Task Orchestrator.

## 4. Trust zones

1. **Client zone:** browser/Android UI, local storage, user-entered content. Entirely untrusted.
2. **Gateway zone:** request parsing, authentication, schema validation, abuse controls, correlation.
3. **Trusted service zone:** Sofia Core services and server-owned policy/configuration.
4. **Provider zone:** external AI providers and other third-party APIs. Treat responses as untrusted.
5. **Secret zone:** platform secret bindings or approved secret manager. Secrets are never returned to clients.

Every boundary crossing must have an explicit contract and authorization decision. Network location alone does not confer trust.

## 5. Authentication and sessions

- Use platform-supported secure authentication appropriate to each client.
- Bind sessions to an authenticated principal and registered device/client where available.
- Use short-lived access tokens and rotating refresh credentials where supported.
- Store browser credentials in secure, platform-appropriate storage; avoid persistent bearer tokens in localStorage.
- Enforce expiry, revocation, idle timeout, and session concurrency policy.
- Support explicit logout and remote session revocation.
- Treat device identifiers supplied by a client as hints until cryptographically bound.
- Require step-up authentication for protected operations; a chat session or wake-word activation is not sufficient.
- Do not create an insecure anonymous identity that can access private memory or privileged functions.

## 6. Request validation and server-owned policy

For every request:
1. enforce HTTPS and accepted content type;
2. enforce maximum body size and bounded message count/length;
3. validate the versioned request schema;
4. authenticate caller and validate session state;
5. enforce route-specific rate and resource limits;
6. strip or reject forbidden fields and roles;
7. apply input normalization without altering user intent;
8. label client text and attachments as untrusted;
9. obtain Security Manager authorization for protected data/capabilities;
10. construct downstream requests using server-owned instructions and policy;
11. validate provider output before returning it.

The client may submit user content and supported conversation context, but cannot set system/developer instructions, provider credentials, provider routing overrides, hidden tool permissions, or autonomy/authority claims.

## 7. Conversation context integrity

Client-supplied conversation history may be modified, replayed, or fabricated. The gateway must not treat it as authoritative memory or proof of prior approval.

For the initial prototype migration:
- validate role values against an explicit allowlist;
- reject privileged roles and unknown message fields;
- impose bounded message counts and content lengths;
- attach a server-generated request/session correlation ID;
- use server-owned system instructions;
- progressively move authoritative conversation state to server-managed storage only after backup, migration, and rollback tests.

A client message that quotes previous approval is not a valid approval record. Protected approvals must be represented by server-verifiable, scoped records.

## 8. Abuse protection and quotas

Apply layered controls:
- per-IP or platform client throttling where lawful and appropriate;
- per-principal and per-session request limits;
- per-route concurrency and payload limits;
- token/compute/cost budgets;
- anomaly detection for repeated failures and automated abuse;
- bounded retries and idempotency for mutating requests;
- temporary suspension and recovery controls.

Do not use IP address as the sole identity or authorization factor. Rate-limit responses must be predictable and avoid leaking account existence or internal security details.

## 9. Attachments and multimodal input

Attachments are untrusted. Validate MIME type, file size, actual file signature where possible, parser limits, malware scanning where supported, and retention policy. Do not execute uploaded content.

Image, audio, and document extraction must run through approved adapters and purpose-limited processing. Remote processing requires the relevant data-classification and consent decision. Store attachments outside public asset paths with access-controlled references and expiry.

## 10. Response and error handling

Return versioned, typed responses with correlation IDs. Never return stack traces, provider credentials, internal prompts, raw provider errors, or sensitive policy internals.

Distinguish:
- invalid request;
- unauthenticated or expired session;
- forbidden capability;
- rate/quota limit;
- provider unavailable;
- policy service unavailable;
- internal transient failure.

Fail closed when authentication or policy dependencies are unavailable for protected routes. Do not silently bypass security to keep chat responsive.

## 11. Cross-origin and browser security

For browser clients:
- use a strict origin allowlist;
- configure CORS only for required origins and methods;
- protect cookie-authenticated state-changing routes against CSRF;
- set secure cookie attributes where cookies are used;
- apply content security policy and appropriate security headers;
- avoid exposing internal routes or debug endpoints;
- never treat CORS as authentication.

Android clients should use TLS, platform secure storage, certificate validation, and supported app-link/deep-link validation. Certificate pinning, if used, requires a safe rotation and recovery strategy.

## 12. Observability and audit

Log metadata needed for operations and security:
- correlation ID, route, method, status, latency;
- authenticated principal/device references where permitted;
- coarse request size and rate-limit outcomes;
- schema validation and policy decision references;
- provider adapter reference and normalized failure category.

Do not log full prompts, raw attachments, tokens, cookies, API keys, or unnecessary personal content. Security events are forwarded to Audit & Observability Manager with tamper-resistant correlation.

## 13. Migration sequence

1. Add server-owned prompt construction behind the existing `POST /api/chat` route.
2. Introduce strict request validation and reject privileged client roles/fields.
3. Add request/session correlation, payload limits, and rate limiting.
4. Confirm provider credentials remain in Worker environment bindings.
5. Add authenticated sessions and scoped grants before private memory or privileged tools are exposed.
6. Add contract and security tests, including prompt-role injection, oversized payloads, replay, origin abuse, and provider failure.
7. Stage rollout and verify existing UI/history compatibility.
8. Deploy only after explicit review, backup, rollback plan, and separate deployment authorization.

## 14. Acceptance criteria

1. Client cannot supply or override system/developer instructions.
2. Client cannot choose arbitrary provider, credentials, tools, or authority level.
3. All routes enforce versioned schemas and payload bounds.
4. Private memory and privileged capabilities require authenticated, scoped authorization.
5. Conversation history is treated as untrusted unless server-verified.
6. Secrets never appear in client assets, responses, or logs.
7. Rate limits and cost budgets are enforced.
8. Origin/CORS/CSRF controls are tested for browser flows.
9. Attachments are validated and never executed.
10. Protected routes fail closed when policy/authentication services are unavailable.
11. Errors do not expose internal prompts, stack traces, or provider secrets.
12. Migration preserves existing browser history/avatar data and has a tested rollback.
