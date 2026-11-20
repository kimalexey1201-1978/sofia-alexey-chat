# AI Provider Gateway

**Status:** Architecture specification  
**Version:** 1.0  
**Applies to:** Sofia Core, model adapters, and task execution services

## 1. Purpose

The AI Provider Gateway (APG) provides a provider-independent interface for language models and other AI inference services. Sofia Core owns identity, policy, memory, task state, and authority. External providers supply bounded inference capabilities; they are replaceable execution dependencies, not Sofia's identity or governing brain.

The gateway selects, invokes, monitors, and fails over between approved providers and models while enforcing data, security, latency, quality, and cost constraints.

## 2. Non-negotiable invariants

1. Provider independence: no provider-specific behavior may become a hard dependency of Sofia Core.
2. Policy before routing: every invocation is checked against data classification, purpose, user consent, provider approval, and budget.
3. No authority delegation: model output is untrusted proposal data and cannot grant permissions, approve actions, or alter policy.
4. Explicit data boundary: only the minimum task context required for inference may leave the device.
5. Capability-based routing: select a model based on the task's required capabilities, not brand or marketing claims.
6. Reproducibility: record provider, model, adapter version, policy version, and relevant invocation parameters without logging secrets or unnecessary prompt content.
7. Safe fallback: fallback must preserve the same or stricter privacy, capability, and safety constraints.
8. Graceful degradation: when no eligible provider is available, return a typed unavailable/deferred result; do not silently route to an unapproved service.
9. User transparency: expose meaningful provider/data-processing choices where consent or privacy settings require it.
10. Core continuity: provider outages must not corrupt memory, task state, or local application behavior.

## 3. Component boundaries

APG owns:
- provider and model capability registry integration;
- provider adapter lifecycle and health state;
- task-to-model requirement normalization;
- policy-constrained model selection;
- request shaping, context minimization, and output normalization;
- timeout, retry, circuit-breaker, and fallback behavior;
- token/compute budget enforcement and usage accounting;
- invocation provenance and privacy-minimized telemetry.

APG does not own:
- user identity or authentication;
- permission grants or final policy decisions;
- task planning and orchestration;
- memory authority or retention policy;
- final validation of consequential actions;
- provider credentials in client-side code.

Those responsibilities remain with IAM, Security Manager, Task Orchestrator, Knowledge & Memory Manager, ADM, and Audit & Observability Manager.

## 4. Provider and model registry

Provider records and model capability records are distinct. A provider may expose multiple models; model identifiers are provider-scoped and must not be assumed globally unique.

A provider is eligible only after:
- adapter identity and version are verified;
- endpoint and transport configuration pass validation;
- credentials are present in an approved secret store;
- supported data classes and processing regions are known or conservatively restricted;
- required contractual/privacy controls are satisfied;
- health and quota state are within policy;
- capabilities are tested against Sofia's evaluation suites.

A provider's self-declared capability is an input, not proof. Claims such as tool use, structured output, vision, speech, context length, or JSON compliance must be validated and versioned.

## 5. Routing decision

The Task Orchestrator supplies a normalized inference request containing task type, required capabilities, data classification, latency target, quality threshold, privacy constraints, budget, and fallback policy.

The gateway:
1. validates the request contract and caller identity;
2. obtains a fresh Security Manager decision for the proposed data flow;
3. filters providers/models by capability, data class, region, consent, and policy;
4. excludes unhealthy, quota-exhausted, revoked, or incompatible candidates;
5. ranks eligible candidates using task-specific quality, reliability, latency, cost, privacy, and availability weights;
6. selects a candidate and records a decision trace;
7. minimizes and redacts context before transmission;
8. invokes through the adapter with bounded timeout and resource budget;
9. validates response shape and provenance;
10. returns normalized output plus limitations and usage metadata.

The newest or most expensive model is not automatically preferred. Routing weights are configurable by task class and governed by policy.

## 6. Data classification and privacy

Every request carries a data classification and purpose. The gateway must enforce an explicit provider allowlist for each classification.

- Public/internal data may be routed only to providers approved for those classes.
- Personal data requires explicit policy approval and the applicable user settings.
- Sensitive data is local-only by default unless a narrowly scoped, explicit policy and consent permit otherwise.
- Secrets, credentials, authentication tokens, and private keys must never be included in prompts.
- Memory retrieval is purpose-limited; unrelated profile data must not be attached as generic context.
- Provider retention/training settings and processing region must be represented as verified metadata or treated as unknown and disqualifying where policy requires certainty.

Redaction occurs before network transmission. The gateway must not claim that a provider is private or zero-retention without verified contractual/configuration evidence.

## 7. Prompt and output trust boundary

All provider inputs are potentially exposed to prompt injection through user content, documents, connectors, notifications, and tool results. Adapters must preserve trust labels and delimit untrusted content.

Provider output is untrusted:
- parse against the expected response contract;
- treat tool calls as proposals for Task Orchestrator validation;
- reject malformed, oversized, or schema-invalid responses;
- do not execute code or tools directly from model output;
- do not allow model output to change policy, identity, permissions, or authority envelopes;
- independently verify factual claims when the task or risk tier requires it.

A refusal, uncertainty, or unsupported capability must be preserved rather than rewritten as success.

## 8. Reliability and fallback

Use bounded retries with exponential backoff and jitter, per-provider circuit breakers, request deadlines, idempotency keys, and quota-aware scheduling.

Fallback is permitted only when the alternative:
- satisfies the same data-classification and consent constraints;
- provides the required task capabilities;
- meets minimum quality/safety thresholds;
- remains within latency and cost budgets;
- is not disabled by user or administrator policy.

Do not downgrade privacy or safety to improve availability. If no eligible fallback exists, return a typed failure and let the Task Orchestrator decide whether to defer, ask the user, or use a local deterministic path.

## 9. Credentials and configuration

Provider credentials are stored only in server-side or platform-approved secret stores. Never embed keys in Android assets, browser bundles, repository files, logs, crash reports, or model prompts.

Credential rotation and revocation are handled through a secrets integration. Adapters receive short-lived scoped access where supported. Configuration changes are versioned, reviewed, and audited. The existing prototype's server-side environment binding remains a migration constraint; no credential should be moved into client code.

## 10. Cost, quota, and resource governance

Each invocation has an explicit budget:
- maximum input/output tokens or equivalent compute;
- monetary or usage ceiling where available;
- deadline and timeout;
- concurrency and retry limits;
- priority and cancellation behavior.

Resource & Runtime Manager supplies device-side constraints. Provider quota and usage state feed routing. Hard budget exhaustion stops the request; no silent overrun or unapproved paid-provider switch is allowed.

## 11. Observability and audit

Record:
- invocation and correlation IDs;
- caller/module identity;
- selected provider/model and adapter version;
- routing policy version and coarse decision reason;
- data classification and approved purpose;
- latency, outcome, token/compute usage, and cost where available;
- fallback/retry/circuit-breaker decisions;
- output validation result.

Do not log API keys, full prompts, raw personal content, or complete model responses by default. Sensitive debugging requires a separate explicit, time-limited diagnostic grant and redaction.

## 12. Prototype migration

The current prototype uses a Cloudflare Worker and OpenRouter integration, with the API key expected in the server-side `env.OPENROUTER_API_KEY` binding and model selection via `env.OPENROUTER_MODEL` with a fallback. Preserve that server-side secret boundary.

Migration should introduce an internal provider interface behind the existing `POST /api/chat` route, initially retaining the current OpenRouter adapter. Do not change production routing or deploy this architecture until contract tests, secret handling, request validation, rate limits, and rollback are verified. The browser must not be able to select arbitrary providers, override server-owned system policy, or submit privileged tool instructions.

## 13. Acceptance criteria

1. Core code depends on provider interfaces, not provider-specific SDKs.
2. A provider can be added, disabled, or replaced without rewriting Sofia Core.
3. Requests are rejected when caller, purpose, data class, or budget is invalid.
4. Provider selection respects verified capabilities, consent, privacy, health, cost, and latency.
5. Fallback never weakens privacy or safety constraints.
6. Credentials never appear in client bundles, repository content, prompts, or logs.
7. Model output cannot directly execute tools or modify authority.
8. Invalid, oversized, or malformed responses are rejected safely.
9. Provider outage leaves task and memory state intact.
10. Invocation traces are auditable without retaining unnecessary user content.
11. The existing OpenRouter prototype can be wrapped behind the adapter interface without changing the production app in this phase.
