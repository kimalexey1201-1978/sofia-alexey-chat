# Automation & Integration Manager

**Status:** architecture specification; runtime implementation is pending.  
**Contract baseline:** JSON Schema Draft 2020-12. Schema documents use `schema_version`; public interfaces use `contract_version`, following [CONTRACT_AND_IDENTIFIER_STANDARDS.md](CONTRACT_AND_IDENTIFIER_STANDARDS.md).

## 1. Purpose

The Automation & Integration Manager (AIM) connects Sofia to approved applications, services, APIs, and devices and coordinates user-authorized cross-system workflows. It provides adapter discovery, connection lifecycle, trigger and action catalogs, mapping and validation, execution hand-off, and outcome reconciliation.

AIM is not an unrestricted remote-control engine. It can operate only through documented APIs, supported OS intents, approved plugins/connectors, or explicitly authorized user-mediated UI automation. Capabilities and permissions are specific to each adapter, account, device, API version, and platform.

## 2. Responsibility boundaries

- Task Orchestrator plans tasks and dependencies.
- Workflow & State Manager owns durable workflow definitions, state transitions, checkpoints, retries, and recovery.
- AIM owns integration adapters, connection metadata, trigger/action capability discovery, data mapping, and integration-specific invocation.
- Security Manager authorizes each exact operation.
- Identity & Authentication Manager resolves principals and sessions.
- Privacy & Data Governance Manager enforces purpose, consent, classification, retention, and provider disclosure.
- Autonomy & Decision Manager bounds task authority and confirmation requirements.
- Resource & Runtime Manager enforces quotas, deadlines, and concurrency.
- Event Bus distributes integration events with idempotent delivery semantics.
- Audit & Observability Manager records decisions, calls, side effects, and evidence.
- Device Integration Gateway owns device communication and device command policy; AIM may route through it but does not bypass it.
- Notification & Reminder Manager delivers user-facing status and approval requests.

AIM must not duplicate the workflow state machine, grant its own authority, or allow connector output to modify system policy.

## 3. Integration adapter registry

Each adapter is registered with:
- stable reverse-DNS adapter ID and semantic version;
- provider/service identity and official documentation reference;
- supported API/protocol versions and platform compatibility;
- authentication method and required scopes;
- triggers, actions, input/output schemas, and side-effect classification;
- rate limits, quotas, payload limits, and resource requirements;
- data categories and classification levels accessed or disclosed;
- retry/idempotency behavior and timeout characteristics;
- webhook verification and event provenance requirements;
- availability, approval/review status, and last capability verification.

An adapter is not considered usable merely because it is installed or listed. Its current permissions, connection status, capability evidence, API version, and account eligibility must be checked before use.

## 4. Connection and credential lifecycle

Connections are user-owned or organization-authorized references. OAuth and other credentials are held in an approved protected vault, never in browser localStorage, model prompts, source code, ordinary logs, or repository files.

The connection lifecycle includes authorization pending, active, reauthorization required, revoked, expired, disabled, and error. The user can inspect granted scopes, connected account identity, last verification, and revoke access.

Use least-privilege scopes, secure callback validation, PKCE/state where supported, token rotation, and revocation. Never request or store a user's platform password when an official delegated authorization flow exists.

## 5. Trigger model

Triggers may be:
- user initiated;
- scheduled or calendar-based;
- webhook or provider event;
- device state or sensor event;
- application state change;
- completion of another authorized workflow;
- threshold or condition evaluated over permitted data.

Every trigger declares source, event type, filter, freshness, expected frequency, permissions, data classification, and whether it may run in background. Polling must be bounded and rate-limited. Android background restrictions, battery, network, and user-visible execution requirements must be respected.

A trigger is a signal to evaluate a workflow, not permission to perform every downstream action. Consent and authorization are rechecked when the action executes.

## 6. Action model and side-effect classes

Actions declare input/output contracts, exact target resource, side effects, reversibility, idempotency, required scopes, data disclosure, and confirmation policy.

Suggested side-effect classes:
- read-only retrieval;
- local reversible change;
- external reversible change;
- external non-reversible or high-impact action;
- financial, legal, safety, publication, or account-security action.

Risk classification and autonomy level remain separate dimensions. A workflow's general permission cannot authorize a materially different target, recipient, amount, content, or scope.

High-impact or externally visible operations require fresh, action-specific confirmation. Examples include sending messages, publishing posts, making purchases, transferring money, deleting remote data, changing account security, or controlling safety-relevant equipment. The approval must bind to the exact operation parameters and expire when they change.

## 7. Workflow composition and data mapping

AIM exposes typed trigger/action capabilities to the Task Orchestrator and Workflow & State Manager. Workflow composition uses explicit input/output bindings, schema validation, transformation adapters, and declared data-flow edges.

- No implicit access to all fields from a connected account.
- No hidden data transfer between providers.
- Every cross-provider transfer declares purpose, destination, classification, and consent.
- Secrets and credentials cannot be mapped into ordinary workflow payloads.
- Untrusted connector output is data, never executable instruction.
- Mapping failures, missing fields, schema drift, and unsupported values are explicit errors.

The workflow engine owns durable state and recovery; AIM executes the integration step and reports a structured outcome.

## 8. Webhooks, polling, and event security

Webhook receivers verify provider signatures, timestamps, replay windows, and expected endpoint identity. Event IDs and delivery IDs are deduplicated. Events are normalized into Event Bus envelopes with authenticated producer identity and provenance.

Polling is bounded by provider rate limits and a per-connection budget. Event ordering is not assumed unless the provider guarantees it. Late, duplicated, or out-of-order events are handled through idempotent consumers and explicit reconciliation.

Never trust an event's claimed user, account, or authority without resolving it against the authenticated connection.

## 9. UI automation boundary

Where no suitable API exists, AIM may offer user-mediated hand-off or approved Computer Use/UI automation only where the platform permits it and the user has explicitly authorized the task.

UI automation must:
- operate in a visible, user-controlled session;
- identify the target application and verify the current screen/state;
- avoid bypassing CAPTCHA, MFA, anti-bot controls, or platform restrictions;
- stop for user intervention when authentication or confirmation is required;
- avoid acting on ambiguous targets or changed layouts;
- verify the result rather than assuming a click succeeded.

AIM must not promise arbitrary automation of every application or device.

## 10. Reliability, idempotency, and reconciliation

Every invocation has a correlation ID, idempotency key where supported, deadline, bounded retry policy, and structured result. For external side effects with uncertain completion, query provider status or request user inspection before retrying. Do not blindly repeat a send, publish, purchase, or deletion operation.

Distinguish accepted, queued, running, succeeded, partially succeeded, failed, cancelled, rejected, and completion unknown. A connector's success response is not sufficient if a consequential external effect can be independently verified.

## 11. Privacy and security

- Apply purpose limitation, minimization, classification, consent, and retention.
- Revalidate connection scopes and authorization on every invocation.
- Keep credentials in a protected vault and redact them from all observability.
- Enforce tenant/account isolation and prevent cross-account confusion.
- Validate callback URLs, webhook signatures, redirects, payload sizes, and content types.
- Defend against SSRF, replay, confused-deputy, prompt injection, and malicious connector content.
- Fail closed when identity, permission, consent, or policy state is unavailable.
- Provide access review, disconnect, revoke, and data deletion workflows.

## 12. Android-first and cross-platform operation

Android is the primary client. Use supported intents, app links, bound services, notification APIs, and documented platform interfaces. Respect scoped storage, runtime permissions, background execution limits, battery/network constraints, and process death.

Windows, Linux, and macOS use platform-specific adapters while retaining common contracts. Device capabilities are discovered rather than assumed. Where a platform does not expose an API or permission, the capability is unavailable and the user receives a clear hand-off or limitation.

## 13. Verification requirements

Test OAuth state/PKCE, scope minimization, token revocation, account mismatch, API schema drift, webhook signature/replay, duplicate events, rate limiting, polling budgets, mapping leakage, prompt injection, SSRF, authorization expiry, approval invalidation after parameter changes, duplicate side effects, uncertain completion, UI layout drift, user intervention, Android process death, offline recovery, audit completeness, and provider outage behavior.

Every adapter must pass contract, security, privacy, reliability, and provider-specific conformance tests before being enabled. A passing test for one account or API version does not prove compatibility for another.

## 14. Implementation status

**Implementation status:** this change adds architecture and versioned contracts only. It does not connect external services, store credentials, register webhooks, execute automations, or control device applications. No production configuration, deployment, or existing prototype data is changed.
