# Sofia AI Audit & Observability Manager — Architecture Specification v1

## Status and boundary
Architecture specification only. No runtime audit pipeline, immutable storage, alerting, anomaly detection or retention enforcement is implemented by this document. It does not alter the v0.1 chat path, production deployment, Cloudflare settings or `main`.

## 1. Purpose
The Audit & Observability Manager (AOM) provides a trustworthy, privacy-minimizing record of what Sofia attempted, which components participated, which decisions were made, what resources were consumed, and how the task ended. It supports incident investigation, owner transparency, compliance review, reliability engineering and detection of policy bypass attempts.

AOM is independent of the model and of the module being observed. A component must not be able to erase, rewrite or suppress its own audit evidence.

## 2. Separation of responsibilities
- Sofia Core orchestrates tasks and propagates correlation/causation identifiers.
- Identity & Authentication Manager establishes the authenticated principal and session context.
- Security Manager produces authorization decisions; AOM records their references and outcomes but cannot grant authority.
- Capability & Permission Registry supplies grant and module provenance.
- Resource & Budget Manager records reservations, metering, settlements and budget denials.
- Execution Supervisor records admission, start, cancellation, timeout, completion and unknown outcomes.
- Privacy-Aware Output Manager records disclosure-policy decisions, not raw environmental media.
- AOM validates, redacts, sequences, stores, indexes and alerts on events. It does not change authorization or silently retry actions.

## 3. Event model and lifecycle
Use `contracts/v1/audit-event.schema.json` as the canonical v1 event envelope. Emit events at meaningful state transitions, including:
1. task accepted, clarified, planned and completed;
2. identity/session established, expired, revoked or rejected;
3. capability requested, granted, denied, changed or revoked;
4. Security Manager allow/deny/defer/approval/step-up decision;
5. owner approval requested, granted, denied, expired or revoked;
6. RBM reservation, usage measurement, settlement, limit denial and paid-resource request;
7. execution admission, invocation, cancellation, timeout and outcome-unknown;
8. provider/model routing and failover decision;
9. data classification, minimization, egress and output-disclosure decision;
10. module installation/update, integrity verification, quarantine and rollback;
11. audit pipeline degradation, integrity verification failure and administrative access.

Every task event should carry a correlation ID. Events caused by another event should carry causation ID. Use monotonically increasing sequence numbers within the defined stream/partition; timestamps alone are not a reliable ordering mechanism. Record both event occurrence and ingestion times.

## 4. Minimum evidence for a protected action
For each protected action, reconstruct:
- who or what initiated it (pseudonymous principal/session and component references);
- task, device, module identity/version and artifact digest where applicable;
- requested capability, operation and target reference;
- relevant permission-grant, authority-envelope, owner-consent and approval references;
- Security Manager decision, policy version, reason code and expiry;
- RBM reservation ID, approved cost ceiling/currency, usage event and settlement state;
- Execution Supervisor invocation ID, timestamps, status and bounded resource usage;
- provider route and whether it was on the owner-approved free-tier allowlist;
- output/disclosure decision and consent scope where applicable;
- final outcome, error code and whether external side effects are confirmed or unknown.

Do not infer a missing approval from a successful operation. Missing required evidence is itself an audit finding and must cause protected execution to fail closed.

## 5. Owner-controlled free-only policy evidence
The default owner policy is `FREE_ONLY`. AOM must record the applicable policy version and the provider/service/tier decision for every billable-capable route. A paid route without a valid, exact, unexpired owner approval is a critical policy violation and must be blocked by RBM/provider routing before the external call. AOM records the attempted route and denial without recording payment credentials.

Owner approval must be bound to the exact provider/service, task purpose, maximum amount, ISO currency, expiry and relevant data-egress scope. AOM records the approval reference and decision metadata, not secrets or unnecessary approval conversation content.

## 6. Privacy and data minimization
Audit evidence is not a transcript archive. Never place in ordinary audit events:
- passwords, API keys, access/refresh tokens, cookies, private keys or payment credentials;
- full prompts, chat histories, email/message bodies, document contents or attachment bytes;
- raw microphone/camera streams, biometric templates or speaker embeddings;
- unnecessary precise location, contact lists or unrelated personal data.

Use pseudonymous references, hashes/digests, bounded enumerations and allowlisted structured attributes. Hashes of low-entropy personal content can still leak information; do not hash sensitive bodies as a substitute for minimization. If a content reference is essential for a specific incident, store it separately under a stronger access policy, encryption and explicit retention controls.

Redaction must occur before persistence. Reject unknown fields rather than serializing arbitrary module-supplied objects. Treat module-provided descriptions and error strings as untrusted; normalize them to allowlisted error codes.

## 7. Integrity, storage and trust
- Append-only event ingestion; ordinary components have no update/delete permission.
- Partitioned sequence and hash chaining or equivalent tamper-evidence; periodic signed checkpoints and key rotation.
- Separate audit writer identity from application/module identities.
- Durable buffering with bounded queues; report dropped events and pipeline outages explicitly.
- Replicate according to the declared durability policy; encryption in transit and at rest.
- Verify integrity on read/export and periodically in the background.
- Administrative access is itself audited. Owner export and deletion/retention workflows must be explicit and policy-governed.
- A hash chain detects modification but does not by itself prove that an event was truthful at source; cross-check critical events against independent components.

## 8. Observability signals
Operational telemetry may include bounded metrics and traces: task latency, provider latency, queue depth, retries, error rates, timeout rates, resource utilization, reservation/settlement variance, module health, policy denials and audit-ingestion lag.

Metrics must not use personal content, email addresses, tokens, arbitrary user text or unbounded identifiers as labels. Traces carry opaque correlation IDs and approved metadata only. Keep operational telemetry logically separate from security audit evidence and apply independent access/retention controls.

## 9. Detection and response
Generate alerts for at least:
- attempted paid route under `FREE_ONLY`, missing/invalid owner approval, or attempted free-to-paid fallback;
- module invoking an undeclared capability, changing identity/version unexpectedly or bypassing Execution Supervisor;
- Security Manager decision missing, expired or inconsistent with execution;
- execution without a valid grant, authority envelope, reservation or required owner consent;
- repeated denied actions, unusual retry/usage spikes, quota evasion patterns or unexpected data egress;
- audit sequence gap, digest/signature failure, ingestion outage or unauthorized audit access;
- unexplained resource-cost variance or settlement above the approved ceiling.

Alerts are signals, not authorization. Critical policy violations should trigger the relevant enforcement control (block/quarantine/circuit breaker) independently of alert delivery. Never automatically grant permissions or raise budgets in response to an alert.

## 10. Retention, access and export
Define retention by event class and jurisdiction before implementation. Minimize retention; support legal hold only through an explicit owner/admin workflow. Restrict access by role and purpose: modules cannot browse global audit records; operators see only what they need; owner can inspect a human-readable task history and request a protected export. Exports are redacted, integrity-verifiable and themselves audited. Do not invent a universal retention period before the data inventory and legal requirements are reviewed.

## 11. Failure behavior
- If audit evidence is mandatory for an action and cannot be durably recorded, do not start that action.
- If the audit pipeline degrades, buffer within a strict bound and expose health state. On buffer exhaustion, fail closed for high-risk and externally side-effecting operations.
- Never silently discard audit events or pretend telemetry is complete.
- Do not block harmless local chat solely because a non-critical analytics metric is unavailable; distinguish operational metrics from mandatory security audit.
- For ambiguous external side effects, record `unknown` and reconcile before retrying.

## 12. Acceptance tests
1. A complete protected-action trace can be reconstructed from correlation/causation IDs.
2. Every protected execution has matching current authorization and resource reservation evidence.
3. A paid route under `FREE_ONLY` is blocked before provider invocation and creates a critical audit event.
4. Owner approval for one task/provider/cap cannot authorize a different task/provider or higher amount.
5. Modules cannot mutate or delete persisted audit events.
6. Unknown event fields and arbitrary free-form module payloads are rejected.
7. Secrets, prompts, message bodies, raw media and biometric templates are absent from ordinary audit storage.
8. Sequence gaps, digest failures and dropped events are detectable.
9. Audit ingestion failure blocks high-risk side effects but does not corrupt existing chat history.
10. Metrics avoid high-cardinality personal identifiers and user content.
11. An outcome-unknown external action is not recorded as success and is not blindly retried.
12. Audit access, exports and administrative actions are themselves recorded.
13. Retention and access rules are enforced independently of model instructions.
14. Critical alerts do not themselves grant authority, approve spending or change policy.

## 13. Implementation sequence
A — validate and version the existing audit event contract; add alert contract.
B — implement a pure event validator/redactor and canonical serializer with tests.
C — implement append-only storage, partition sequencing and integrity verification.
D — add Core/SSM/RBM/ES/PAOM event adapters and end-to-end correlation.
E — add bounded metrics, traces, dashboards and alert routing.
F — implement owner-readable history, export, access controls and retention.
G — run adversarial tests for suppression, tampering, injection, paid-route bypass and audit outage before enabling any enforcement in production.

## 14. Current boundary
This specification and the event contract are not a functioning audit service. No runtime event collection, immutable storage, alert delivery, retention enforcement or paid-route blocking is created by this document. The existing v0.1 chat endpoint remains unchanged.
