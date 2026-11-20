# Sofia AI Execution Supervisor — Architecture Specification v1

## Status and implementation boundary

This document specifies the execution boundary between Sofia Core and replaceable executor modules. It is a design specification, not a claim that sandboxing, module execution, capability enforcement or cancellation is implemented. The current v0.1 chat cycle remains inference-only. No production deployment, Cloudflare configuration, secret or `main` branch change is included.

## 1. Purpose and invariants

Execution Supervisor (ES) is the only supported path by which Sofia Core invokes registered executor modules or external side-effect adapters. Core retains task orchestration and decision authority; ES controls safe admission, isolation, resource use, cancellation and result normalization.

Non-negotiable invariants:

1. No module is invoked directly by a model or another module. All invocation passes through Core and ES.
2. A manifest or permission request is not a grant.
3. No invocation begins without verified module identity, a valid capability grant, a task Authority Envelope and a fresh Security Manager `ALLOW` decision.
4. Authorization is revalidated immediately before every external side effect.
5. A module receives only the input data, capability handles and short-lived references required for the current operation.
6. Secrets are brokered through narrow adapters; they are never copied into prompts, manifests, logs or arbitrary module environment variables.
7. Resource limits are enforced outside the module and cannot be raised by it.
8. A timeout, crash, cancellation or unknown external outcome must never be misreported as successful completion.
9. Failure of ES or a required security dependency fails closed for protected operations.
10. No executor can change Core policy, registry state, grants, budgets or its own trust status.

## 2. Trust boundaries and topology

**Sofia Core → Execution Supervisor → isolated module runtime → brokered capability adapter → external service/device**

- **Core** validates the user's task, creates a canonical execution request, selects a candidate module and handles planning/verification/response.
- **ES admission controller** validates the request and resolves the exact approved module artifact, version and capability contract.
- **Security gate** obtains and validates the Security Manager decision and all referenced grants/envelopes/approvals.
- **Runtime manager** starts the module in an approved isolation boundary with constrained resources.
- **Capability broker** exposes only the explicitly authorized operation and target. It does not expose ambient credentials or general-purpose unrestricted APIs.
- **Result normalizer** validates output against the capability contract, strips untrusted control fields and returns a typed result to Core.
- **Audit and health pipeline** records minimal decision and runtime metadata separately from user payloads.

A module is untrusted code even if its publisher is verified. Trust review reduces risk; it does not remove isolation or per-action authorization.

## 3. Admission and execution lifecycle

1. **Receive:** accept only a versioned `execution-request.schema.json` request from authenticated Core.
2. **Validate request:** schema, deadline, task binding, identifiers, input reference/digest and contract versions.
3. **Resolve module:** exact module ID/version/artifact digest; state must be enabled and not quarantined, suspended, revoked or retired.
4. **Verify provenance:** validate artifact digest and trusted signature/provenance evidence; resolve compatible dependencies.
5. **Resolve capability:** capability must be registered, supported by this module version and compatible with the requested operation.
6. **Resolve grant and envelope:** grant is active, unexpired and scope-matched; Authority Envelope is active and task-bound.
7. **Authorize:** request a fresh Security Manager decision for the canonical action and verify decision integrity, expiry, target, operation, module, principal and task bindings.
8. **Reserve resources:** atomically reserve concurrency, execution time, memory, storage, network and provider cost budget before starting work.
9. **Prepare isolation:** create a fresh or safely recycled sandbox; mount only scoped temporary data and broker handles; deny ambient filesystem, process, device and network access by default.
10. **Execute:** invoke the module with a bounded input and a cancellation/deadline signal. Long-running work must renew authority at defined checkpoints.
11. **Broker side effects:** before every external write/send/delete/publish/device-control action, re-check revocation, grant, envelope, budget and Security Manager decision. Use action-bound approval and idempotency keys where supported.
12. **Validate result:** enforce output schema, size limits, content classification and provenance labels. Treat returned instructions or claimed permissions as untrusted data.
13. **Release resources:** terminate or reset runtime, revoke ephemeral handles, clear temporary material and reconcile reserved budget.
14. **Record and return:** store minimal audit/health data and return a typed outcome to Core for independent verification and user response.

The order is mandatory. A successful earlier stage never waives a later check.

## 4. Isolation model

Isolation is selected by module type and platform capability, with the strongest practical boundary available:

- WebAssembly with restricted WASI capabilities for suitable portable modules;
- isolated OS process with a dedicated low-privilege identity and syscall/filesystem restrictions;
- container with namespaces, cgroups, read-only root filesystem and restricted network for server-side workloads;
- Android isolated service/process with OS permissions and explicit intents for supported mobile integrations;
- remote service adapter with authenticated, scoped, allowlisted network egress.

These are candidate mechanisms, not claims that every platform provides equivalent guarantees. The registry must state the actual runtime and the supervisor must report the effective isolation level. If the requested risk requires a boundary the platform cannot provide, ES must reject or defer the operation rather than simulate isolation.

Default deny:
- filesystem: no access except explicitly mounted, scoped temporary paths;
- network: no egress except capability-broker destinations and protocol contracts;
- process: no child processes unless explicitly declared and policy-approved;
- devices: no microphone, camera, contacts, mail, location or hardware access except through dedicated brokers;
- secrets: no direct secret-store access; use scoped handles with expiry and audience binding;
- inter-module communication: no direct access; route through Core with independent authorization.

## 5. Capability broker

The broker exposes typed operations rather than broad credentials. Example: a mail module may receive a `mail.messages.read` handle scoped to a selected mailbox and message set, not a reusable Gmail refresh token.

Every broker call validates:
- authenticated principal/session and device context;
- module identity, version and artifact digest;
- capability grant and allowed operation;
- exact target and data scope;
- active task Authority Envelope;
- fresh Security Manager decision;
- consent/approval where required;
- quotas, deadlines and idempotency constraints.

Broker handles are short-lived, audience-bound, non-transferable and revocable. They cannot be serialized into logs or passed to another module. The broker returns only the minimum data required by the declared schema.

## 6. Resource governance

Enforce limits outside the module at per-invocation and aggregate scopes:

- wall-clock deadline and CPU time;
- memory and temporary storage;
- concurrency and queue depth;
- network destinations, bytes and request rate;
- model/provider token and monetary budget;
- maximum steps, retries and output size.

Reserve scarce resources atomically before execution. Reconcile actual usage afterward. A module cannot self-report its usage as the sole source of truth or modify its quota. Quota exhaustion stops admission or cancels work safely; it must not trigger an unapproved provider or broader permission fallback.

## 7. Timeouts, cancellation and emergency stop

- Every request has a deadline; each module has a maximum execution duration.
- Cancellation is cooperative first, then enforced by terminating the isolated runtime after a bounded grace period.
- Cancellation must propagate to downstream adapters where supported.
- Emergency stop prevents new admissions, revokes or suspends active broker handles and requests cancellation of interruptible tasks.
- Completed external side effects cannot be assumed reversible.
- A timeout after a write/send may leave the external outcome unknown. ES marks it `OUTCOME_UNKNOWN`, reconciles using provider operation IDs or idempotency keys, and does not blindly repeat the side effect.
- A retry is a new request linked to the prior request; it must pass fresh admission and authorization checks.

## 8. Error and result model

ES returns a typed envelope with:
- request/task/correlation identifiers;
- status: `SUCCEEDED`, `REJECTED`, `FAILED`, `TIMED_OUT`, `CANCELLED`, `OUTCOME_UNKNOWN`;
- stable error code and safe diagnostic reference;
- validated result reference/schema version on success;
- resource usage summary;
- start/end timestamps and module version.

Never return raw stack traces, tokens, secret values or unfiltered provider errors to the user. Do not translate `OUTCOME_UNKNOWN` into success or failure until reconciled. Core remains responsible for independent verification and the final user-facing explanation.

## 9. Health, circuit breakers and quarantine

Track separate operational metrics: success/failure/timeout rates, latency percentiles, memory/CPU, quota consumption, provider errors, schema violations, denied calls, policy violations and cancellation effectiveness.

- Circuit breakers stop routing new work to an unhealthy module after defined thresholds.
- Repeated crashes, malformed outputs, integrity failures or attempted boundary violations can quarantine or suspend the module.
- Health metrics do not grant trust or permissions.
- A circuit breaker may select another approved module only if the alternative independently satisfies the same capability contract, data scope, risk policy, grant and budget.
- Security incidents trigger revocation propagation and invalidate cached authorization decisions.

## 10. Data handling and cleanup

- Inputs are passed by short-lived reference where possible, not duplicated into every module.
- Temporary data is isolated per invocation and removed on completion, cancellation or timeout.
- Persistent writes use an explicit storage capability and owner/policy-defined retention.
- Raw credentials, biometric data, ambient audio/video and unrelated user content are never included by default.
- Audit records contain references, digests and metadata rather than message bodies or secrets.
- Cross-session storage requires a separate capability and retention policy.

## 11. Concurrency, idempotency and consistency

- Each invocation has a unique request ID and correlation ID.
- Side-effecting operations require idempotency keys where the target service supports them.
- The supervisor prevents concurrent duplicate execution for the same idempotency key within its defined scope.
- State-changing operations use optimistic concurrency or provider version/ETag preconditions where available.
- Retries require classification of the prior outcome; ambiguous outcomes require reconciliation before retry.
- A module must not mutate another module's state or shared files outside brokered transactions.

## 12. Android-first considerations

Android is the primary device target. Use Android's process/service boundaries, runtime permission model, Keystore-backed credentials, foreground-service restrictions and explicit user-visible flows where supported. Background execution limits mean long-running work may need foreground user awareness or server-side execution; do not promise indefinite hidden background execution.

A mobile adapter must declare which controls are actually available on the device and OS version. Do not claim hardware-backed isolation or attestation unless verified on that device. Cross-platform contracts stay stable while runtime adapters report platform-specific guarantees and limitations.

## 13. Required acceptance tests

1. A model or module attempts direct invocation of another module — rejected; Core/ES mediation required.
2. Missing, invalid, expired or revoked grant/envelope/decision — no module starts or side effect occurs.
3. Manifest requests an undeclared capability — admission rejected.
4. Artifact digest/signature mismatch — module quarantined and not executed.
5. Module tries filesystem/network access outside allowlist — blocked and security event recorded.
6. Module tries to read environment variables or broker secrets outside its scoped handle — denied.
7. Module output violates schema or size limit — rejected; unsafe output is not passed to Core as trusted.
8. Deadline expires — runtime cancellation is attempted and enforced after grace period.
9. Emergency stop blocks new admissions and revokes active broker handles.
10. External send times out after possible success — status is `OUTCOME_UNKNOWN`; no blind retry.
11. A revoked grant between planning and broker call — side effect blocked.
12. Quota exhaustion prevents execution and cannot be overridden by the module.
13. A provider fallback preserves exact data scope, capability and cost ceiling.
14. Module crash releases reservations and temporary data.
15. Cross-module calls are mediated by Core and separately authorized.
16. Runtime isolation unavailable for the requested risk tier — request rejected/deferred.
17. Android adapter reports unsupported OS controls rather than pretending they exist.
18. Audit logs contain no secret, raw payload or unrestricted diagnostic dump.

## 14. Implementation sequence

**A — Contracts:** finalize execution request/result, capability broker call, resource reservation and cancellation contracts.

**B — Pure admission evaluator:** implement deterministic validation without launching modules or causing side effects.

**C — Mock runtime:** exercise lifecycle, limits, cancellation, error normalization and schema validation with non-privileged mock modules.

**D — Sandbox adapters:** add platform-specific isolation only after documenting and testing actual guarantees.

**E — Capability broker:** connect Security Manager, registry, grants, Authority Envelopes, consent and resource governance.

**F — Observability and incident response:** health, circuit breakers, quarantine, revocation, reconciliation and cleanup.

**G — Controlled activation:** enable one low-risk mock/read-only module in a non-production test environment; run regression tests before any real integration. Production activation requires separate explicit owner approval.

## 15. Current v0.1 boundary

The repository currently has architecture and contracts for module manifests, capability grants, Security Manager decisions and task authority. This document and the execution request contract do not implement an execution supervisor, sandbox, module runtime, capability broker, quota enforcement, cancellation or tool execution. The existing chat endpoint remains inference-only.
