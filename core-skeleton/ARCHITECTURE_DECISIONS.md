# Sofia Core Skeleton — Architecture Decisions

## Status
Prototype only. These decisions are proposed for review and are not production approvals.

## ADR-001: Keep the prototype isolated
The skeleton lives under `core-skeleton/` and is not imported by the live chat page or Worker. The current production path remains unchanged.

## ADR-002: Dependency injection at the Core boundary
The Orchestrator receives Registry, Gateway, Security Policy, and Critic implementations through its constructor. This keeps provider SDKs and storage out of the Core.

## ADR-003: Server-owned authorization
Task payloads are untrusted input. Permission claims supplied by a browser or executor must never grant authority. The Security Policy must derive authorization from authenticated identity, server-side policy, and explicit approvals.

## ADR-004: Capability-based executor selection
The Registry resolves only enabled executors declaring the requested capability. A future production registry must also validate signed/trusted manifests, version compatibility, health, quotas, and policy constraints.

## ADR-005: Verification is a separate dependency
The Orchestrator does not mark output completed until the injected Critic passes it. Production verification must use independent checks appropriate to the task and must retain evidence/provenance.

## ADR-006: Cancellation is cooperative
The Gateway passes an AbortSignal and aborts it on caller cancellation or timeout. Executors must honor the signal. A timeout cannot guarantee reversal of an already completed external side effect; such operations need idempotency and compensating-action policies.

## Open decisions before production
- Authentication/session identity and trust model.
- Durable task state, event log, and retry/idempotency store.
- Formal JSON Schemas and compatibility policy.
- Executor isolation model and resource quotas.
- Approval tokens and confirmation UX.
- Critic evidence model and risk-based verification.
- Observability, redaction, retention, and deletion policies.
- Android-to-server API and device capability authorization.
