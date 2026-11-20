# Sofia AI — data-flow privacy audit (prototype v0.1)

Status: source review completed; remediation proposals pending.
Reviewed ref: `core/v0.1-minimal-cycle`, commit `3a6a304e0fd9f46579ea2dd541f487273eb99fc7`.
Scope: current browser chat, Cloudflare Worker route, Sofia Core, and OpenRouter adapter. This is a source-code review, not a live Cloudflare account inspection or a provider contractual/privacy assessment.

## 1. Executive summary

The prototype has a useful server-side credential boundary and several request/response safeguards. However, it is not yet ready to process private email, KakaoTalk messages, attachments, or other sensitive communications. There is no runtime consent/purpose gate, no user authentication in the inspected chat route, and the browser stores the conversation in localStorage. Every submitted conversation context is sent from the Worker to OpenRouter for inference.

No production deployment was performed as part of this audit.

## 2. Observed data flow

1. The browser app stores chat messages under localStorage key `sofia-chat-v3`; avatar data is stored under `sofia-avatars-v1`.
2. On send/retry, the browser creates a request snapshot containing the system message and up to the latest 30 chat entries.
3. The browser sends that snapshot to the configured Cloudflare Worker endpoint using HTTPS.
4. The Worker enforces a 64 KiB request-body limit, parses the JSON, discards the first legacy client system message, and rejects unsupported request fields/roles through Core validation.
5. The Worker constructs the OpenRouter adapter using server-side `env.OPENROUTER_API_KEY` and `env.OPENROUTER_MODEL` (default model fallback: `openrouter/free`).
6. The adapter sends the server-owned system instruction and validated user/assistant messages to `https://openrouter.ai/api/v1/chat/completions`.
7. The provider response is validated and normalized; the Worker returns the assistant text to the browser, which stores the resulting assistant message in localStorage.

## 3. Positive controls verified in source

- OpenRouter API key is read from Worker environment and is not embedded in the browser request.
- The browser cannot override the server-owned system instruction through the legacy first system message.
- The Worker limits request bodies to 64 KiB and validates JSON shape.
- Core validates message roles, per-message length, aggregate text length, message count and response length.
- Provider calls have timeouts; provider errors are normalized so upstream response bodies and credentials are not returned to the browser.
- The frontend keeps transient transport/provider errors out of the saved chat transcript.
- Existing browser storage keys are preserved by the current frontend changes.
- Cloudflare dashboard state observed by the owner: Logs enabled, Invocation Logs disabled, persistence enabled, Traces disabled, Issues disabled. Wrangler configuration now mirrors those values on the development branch. This does not establish that every platform-generated metadata field is disabled.

## 4. Findings and risks

### F-01 — No authenticated owner identity at the Worker chat route (high priority)

The inspected `handleChatRequest` checks HTTP method, provider secret presence, request shape and CORS headers, but does not authenticate a user/session or bind the request to an owner principal. A fixed CORS origin is a browser cross-origin policy, not API authentication; direct non-browser HTTP clients are not constrained by CORS. If the Worker endpoint is publicly reachable, an external caller may invoke it and consume the configured provider quota.

Required follow-up: add an owner-authenticated session/token mechanism, server-side authorization, rate/concurrency limits, abuse controls and revocation before exposing private integrations or treating the endpoint as private. Keep secrets server-side. Do not mistake an obscured URL or CORS for authentication.

### F-02 — Conversation history is stored in browser localStorage (high privacy relevance)

The frontend persists the chat transcript in `sofia-chat-v3` using localStorage. This is convenient for the current prototype but is not encrypted durable storage and is accessible to same-origin JavaScript. Device compromise, malicious same-origin script, browser profile access or XSS could expose it.

Required follow-up: classify local history as confidential; document device/browser access risks; add clear user controls for export and deletion; assess a safer storage strategy and encryption/key lifecycle before sensitive integrations. Do not claim localStorage is secure memory.

### F-03 — Full recent conversation context is disclosed to OpenRouter for inference (high privacy relevance)

The browser sends up to 30 recent chat messages to the Worker. The Worker forwards validated user/assistant message content plus its server-owned system instruction to OpenRouter. This is required for current inference behavior, but it means chat content leaves the browser and Cloudflare Worker boundary.

Required follow-up: implement a provider-disclosure gate based on purpose, data classification, user consent, provider approval and task minimization. For private messages/files, block external processing by default unless the user has authorized the specific disclosure. Never silently fail over to another provider.

### F-04 — Provider-side retention and processing terms are not verified by this source audit (open)

The source confirms the OpenRouter endpoint and request contents, but cannot establish the applicable retention, logging, training, subprocessors, processing region or model-specific data handling for the selected route/model.

Required follow-up: review current OpenRouter terms and privacy documentation, model/provider routing disclosures, account controls and any applicable contractual settings. Treat unknown provider handling as unknown; do not promise zero retention or no training without evidence. Record the exact selected provider/model route and policy version.

### F-05 — No runtime consent, purpose, classification or retention enforcement in v0.1 (high priority before integrations)

Architecture documents define a Privacy & Data Governance Manager and consent/classification/retention contracts, but the inspected Worker/Core path does not call a runtime policy engine. The architecture document itself states enforcement is pending.

Required follow-up: add a deterministic policy enforcement point before provider egress and before any storage/integration operation. Missing or ambiguous consent/purpose/provider policy must fail closed. Keep consent granular by channel, data category and purpose.

### F-06 — No rate limiting or request budget enforcement is visible in the inspected route (high operational priority)

The route enforces payload size and provider timeout but no per-owner/IP rate limit, concurrency ceiling, or spend budget is visible in the inspected code.

Required follow-up: add server-side rate/concurrency controls and provider spend/usage budgets. Tie limits to authenticated principals once authentication exists. Avoid arbitrary user-facing daily message caps; protect the service from abuse and unexpected provider charges.

### F-07 — Observability settings do not prove all metadata collection is disabled (medium)

Invocation Logs are disabled, while Logs and persistence remain enabled. Cloudflare may generate platform-level request/network metadata independently of application logs. This source review cannot prove exactly which metadata is retained by the platform or whether any account-level settings differ from Wrangler.

Required follow-up: document the effective Cloudflare settings and retention from the dashboard and current plan; inspect a representative event after configuration changes without generating unnecessary traffic. Keep application logs allowlisted and content-free.

## 5. What is not currently implemented

The inspected runtime path does not implement:
- authenticated owner sessions or per-user authorization;
- a runtime Privacy & Data Governance Manager / consent gate;
- local or durable memory independent of the model;
- provider disclosure approval or data-classification enforcement;
- email/messenger connectors;
- attachment ingestion or file processing;
- outgoing message composition/approval/delivery;
- a durable consent, retention, export or deletion workflow;
- application-level structured audit events for privacy decisions.

Architecture specifications and JSON schemas exist for several of these domains, but specifications/contracts are not runtime enforcement.

## 6. Recommended remediation order

1. **Protect the Worker endpoint:** owner authentication, authorization, rate limiting, concurrency and spend controls.
2. **Implement provider egress policy:** data classification, purpose, consent, provider allowlist, minimization/redaction and fail-closed behavior.
3. **Verify provider handling:** current terms, retention, training use, routing/subprocessors and region; capture evidence and date.
4. **Harden local history:** user-visible retention/export/delete controls and a reviewed storage/security design.
5. **Add privacy-safe audit/telemetry:** allowlisted metadata only, no message bodies or secrets, access controls and retention.
6. **Only then connect private channels:** Gmail, KakaoTalk and other integrations with least-privilege scopes, channel-specific consent and explicit approval for outbound messages.

## 7. Acceptance criteria before private communication integrations

- The Worker requires an authenticated owner session and applies server-side authorization.
- Rate, concurrency and provider-spend controls are enforced.
- Every provider egress has a purpose, data classification, consent decision and approved provider/model route.
- Private channel content is not sent externally by default.
- No unapproved fallback widens disclosure.
- Logs and audit records contain no message bodies, attachments, credentials or unnecessary identifiers.
- Local conversation retention, export and deletion behavior is documented and user-controlled.
- Outbound messages require a canonical preview and explicit owner approval; retries are idempotent.
- Tests prove denial on missing/revoked consent, unapproved provider, unknown classification and unauthenticated requests.

