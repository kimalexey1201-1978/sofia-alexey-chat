# Sofia AI Communication & Integration Gateway — Architecture Specification v1

## Status and implementation boundary
Architecture specification only. No live OAuth flow, connector installation, token vault, webhook receiver, email/messaging client, browser automation or external service connection is implemented here. The current v0.1 chat cycle remains inference-only. Existing module manifest, Capability & Permission Registry, Security Manager, Data Governance, Resource & Budget Manager and Execution Supervisor remain authoritative. No production deployment, Cloudflare setting, secret, `main` branch or existing chat/storage behavior is changed.

## 1. Mission
The Communication & Integration Gateway (CIG) provides one governed interface for Sofia to exchange information with external services, applications, accounts and devices. It hides provider-specific API details behind versioned connector adapters while preserving consistent identity, permissions, consent, privacy, cost, audit and failure semantics.

Target integration categories include:
- email and mailboxes;
- messaging and collaboration services;
- calendar, tasks and contacts;
- telephony and communications;
- browser and approved web services;
- cloud file storage and document platforms;
- media, photo and video services;
- smart-home, vehicle and device ecosystems;
- future third-party services and owner-built connectors.

These are architectural targets, not claims that any connector is currently installed or available.

## 2. Authority and trust boundaries
All connector operations follow:
**Sofia Core → Task Planning & Orchestration → Security Manager + Resource & Budget Manager + Data Governance → Execution Supervisor → Integration Gateway → isolated connector adapter → external service**

- **Core** owns task intent, orchestration and owner-facing decisions.
- **TPOE** describes and schedules bounded integration steps.
- **SSM** authorizes each exact operation, principal, account, target and data scope.
- **DGLM** enforces purpose, classification, processor, retention and data-egress policy.
- **RBM** reserves and meters provider, network, device and financial resources.
- **ES** is the only supported module invocation boundary.
- **CIG** resolves connector contracts, account bindings, API versions, credential handles, request normalization and response normalization.
- **Connector adapter** translates one narrow capability contract to a provider API. It is untrusted code and cannot grant itself permissions or invoke another connector.
- **External provider** remains outside Sofia's trust boundary; its responses and webhooks are untrusted data.

No model, agent, connector, webhook or external content may directly call an integration or change policy.

## 3. Connector model and registry
A connector is a versioned module registered through the existing Module Registry and Capability & Permission Registry. Its manifest declares identity, publisher, artifact digest, compatibility, runtime, dependencies, capabilities, requested permissions, resource limits and data handling.

Each connector registration links:
- connector/module ID, version and immutable artifact digest;
- provider and supported API versions;
- supported capability IDs and input/output contracts;
- platform/runtime compatibility;
- account authorization method and required scopes;
- data classes and processing/retention declarations;
- endpoint allowlist and network requirements;
- idempotency, pagination, rate-limit, retry and webhook semantics;
- provider pricing/tier evidence and quota metadata;
- trust, health and revocation references.

A connector manifest is a declaration, not a permission grant. Connector activation, account linking and each capability grant are separate decisions. Provider account linking never grants blanket access to all data or operations.

## 4. Canonical capability interface
Expose narrow, provider-neutral operations such as:
- `mail.message.list`, `mail.message.read`, `mail.draft.create`, `mail.message.send`;
- `calendar.event.list`, `calendar.event.create`, `calendar.event.update`;
- `contacts.lookup`;
- `files.list`, `files.read`, `files.create`, `files.update`;
- `messaging.message.read`, `messaging.message.send`;
- `browser.page.retrieve` for approved retrieval only.

These are examples of future contracts, not currently granted capabilities. Read, create, update, send, publish, delete, export and settings operations remain distinct. A generic “account access” permission is prohibited.

Each operation contract defines:
- exact account/tenant and target references;
- input/output schema and maximum payload size;
- data classification and purpose;
- side-effect classification and risk floor;
- required authentication assurance and owner approval;
- idempotency and duplicate prevention;
- pagination, rate limits, timeout and cancellation behavior;
- provider response mapping and error taxonomy;
- evidence/audit requirements.

## 5. Account linking and credential security
Account linking uses provider-supported authorization flows (for example OAuth 2.0 Authorization Code with PKCE where supported). The design must:
- verify redirect URI, state, nonce and PKCE bindings;
- request only minimal scopes needed for a declared use case;
- distinguish account authentication from Sofia capability authorization;
- store refresh/access tokens only in a dedicated encrypted secret vault;
- expose opaque, short-lived credential handles to a broker, never raw tokens to prompts, logs, models or connector payloads;
- encrypt secrets at rest and in transit; enforce key rotation and access auditing;
- support revocation, disconnect, token expiry and provider-side consent changes;
- never collect passwords through chat or store them in ordinary configuration/localStorage;
- fail closed when token status, audience, scope or account binding is unknown.

A successful OAuth connection is not blanket permission. Each operation still requires active capability grant, consent where required, fresh SSM authorization, DGLM clearance and RBM reservation.

## 6. Owner consent and privacy-aware communication
Before accessing a new account or data category, explain the provider, account identity, requested scopes, purpose, data classes, external processing, retention facts and available alternatives.

Reading private information and disclosing it are separate capabilities. In particular:
- authorization to read an email does not authorize reading it aloud;
- shared or unknown room context is not private by default;
- before speaking sensitive email, message, calendar or contact content aloud, Sofia must verify the output context and ask the owner when privacy is uncertain;
- personal display or headphones may be offered as safer output channels;
- ambient audio/video is not retained as raw telemetry by default;
- notifications should minimize sensitive previews on lock screens or shared displays.

These rules integrate with Privacy-Aware Output Manager; the gateway does not make its own privacy exception.

## 7. Inbound and outbound message handling
**Inbound**:
1. authenticate provider/webhook origin using provider-supported signature or mutual authentication;
2. validate timestamp, nonce, signature and replay window;
3. enforce payload size, content type and schema;
4. deduplicate by provider event ID and idempotency key;
5. label all content as untrusted external data;
6. classify and minimize data before task context or memory use;
7. notify Core through a typed event envelope.

**Outbound**:
1. resolve exact recipient, account, channel and payload;
2. display a preview for actions requiring owner confirmation;
3. bind approval to the exact content digest, recipient(s), account, channel and expiry;
4. revalidate grant, consent, Security Manager decision and budget immediately before sending;
5. use provider idempotency where available;
6. record provider message/operation ID and delivery state;
7. distinguish accepted, queued, delivered, failed and outcome-unknown.

Never repeat an outbound side effect blindly after timeout. Reconcile provider state first. Approval for one message does not authorize later messages or new recipients.

## 8. Data governance and external processors
Before sending data to a provider, evaluate:
- purpose and data minimization;
- classification and sensitivity;
- provider/processor identity and current terms;
- processing location and cross-border transfer facts;
- retention, deletion and training-use terms;
- owner consent and legal/policy requirements;
- permitted account, target and recipient scope.

Unknown processor terms or unknown data-transfer behavior must block restricted-data egress until reviewed. Do not infer that a provider is privacy-safe because it offers OAuth or encryption. Store source/provenance and processor lineage so deletion/revocation can propagate where supported.

## 9. FREE_ONLY resource policy
The owner default remains `FREE_ONLY`:
- use only explicitly approved zero-additional-cost providers, APIs and account tiers;
- verify quotas, rate limits and billing behavior;
- unknown pricing or possible billable overage is not considered free;
- no paid fallback, automatic upgrade, overage or trial conversion;
- when a quota is exhausted, stop, wait, use a verified free alternative or ask the owner;
- if payment is required, pause before the call and request explicit owner approval bound to provider, connector, exact task step, purpose, maximum amount, currency, expiry and data-egress scope;
- RBM reservation and SSM authorization remain separate mandatory gates.

## 10. Reliability, limits and resilience
Every connector must declare and enforce:
- provider rate limits, concurrency and quota;
- bounded timeouts, payload and pagination limits;
- retry classification and exponential backoff with jitter where appropriate;
- idempotency support and duplicate detection;
- circuit breaker and health freshness;
- cancellation and reconciliation semantics;
- provider API version and deprecation policy.

Retry only safe/idempotent reads or writes with verified idempotency. A network timeout after a send/create/update is `OUTCOME_UNKNOWN` until reconciled. Do not silently switch accounts, providers, recipients or data regions. A fallback connector must pass the same policy and approval gates.

## 11. Webhooks and event subscriptions
Subscriptions are explicit, scoped capabilities. Record event types, source account, endpoint, filters, retention, delivery policy and expiry. Verify signatures and replay protection, rate-limit inbound events, deduplicate, and quarantine malformed or suspicious events. Webhook content never carries executable instructions or authority. Subscription creation, expansion and deletion are separate operations requiring authorization.

## 12. Android-first and device integrations
On Android, use supported platform APIs and user-mediated permission flows. Respect background execution limits, notification privacy, battery/network constraints and scoped storage. Device-local connectors should prefer local processing where feasible and avoid sending data to cloud services without a separately authorized purpose and processor route.

Future cross-platform connectors must declare platform support and behavior differences. Do not assume that a capability available on Android is available on web, Windows, Linux or macOS.

## 13. Audit, monitoring and owner controls
Audit events should record operation ID, connector/version, provider, account reference (pseudonymous), capability, task/correlation ID, grant/consent/SSM/RBM/ES references, data classification, approval digest reference, timestamps, provider operation ID, result state and error code.

Do not log access tokens, passwords, message bodies, attachments, private file content or raw media. Owner controls must support:
- inspect linked accounts and granted scopes;
- inspect connectors, versions and data processors;
- disconnect account and revoke credentials;
- suspend/revoke a connector;
- review and revoke capability grants;
- pause/stop active tasks;
- inspect recent operations and unresolved outcomes;
- export/delete supported connector-derived data under DGLM policy.

## 14. Acceptance tests
1. No connector is invoked outside Core → ES → CIG.
2. Invalid/unverified connector artifacts are quarantined.
3. Account linking does not create blanket capability grants.
4. Every operation requires exact capability grant and fresh SSM authorization.
5. OAuth scopes are minimal and bound to the selected account.
6. Raw credentials never enter model prompts, logs or localStorage.
7. Redirect state/PKCE/nonce and token audience are validated.
8. Revoked or expired credentials block calls immediately.
9. Reading data does not authorize speaking, sending or publishing it.
10. Shared/unknown room output requires privacy-safe handling.
11. Webhook signatures, timestamps and replay protection are validated.
12. Duplicate inbound events are deduplicated.
13. Outbound approvals bind to exact content, recipient, account and expiry.
14. Timeout after a side effect produces OUTCOME_UNKNOWN and reconciliation, not blind retry.
15. Provider terms or data-egress facts unknown for restricted data block the route.
16. Unknown pricing blocks selection under FREE_ONLY.
17. Paid fallback and automatic upgrade are impossible without owner approval.
18. Rate limits, payload caps, pagination and circuit breakers are enforced.
19. External content and webhook payloads cannot change policy or trigger arbitrary actions.
20. Connector revocation invalidates cached routes and pending operations.
21. Android permission/background constraints are honored.
22. Audit records contain references and metadata, not private payloads or secrets.
23. Existing chat, memory, localStorage keys, API contract and production branch remain unchanged.

## 15. Implementation sequence
A — define canonical connector operation and provider error contracts.
B — implement connector registry linkage to Module Registry and CPR.
C — implement encrypted credential vault and account-linking broker.
D — implement one read-only connector with narrow scopes and typed results.
E — implement owner consent, privacy output and data-egress checks.
F — implement outbound side effects with preview, action-bound approval and idempotency.
G — implement webhook ingress, signature verification and deduplication.
H — add rate limits, quota/cost checks, circuit breakers, audit and owner controls.
I — add Android-first device integrations and additional providers only after security review.
J — run adversarial tests for token leakage, prompt injection, replay, duplicate sends, scope expansion, paid fallback and revocation before enabling any connector.

## 16. Current boundary
This document defines architecture and future contracts only. It does not connect accounts, request OAuth permissions, access email, send messages, create calendar events, browse private accounts or control devices. The current v0.1 chat cycle remains unchanged.
