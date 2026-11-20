# Sofia AI Agent & Executor Management System — Architecture Specification v1

## Status and implementation boundary
Architecture specification only. This document does not implement a live module registry, installer, executor runtime, trust service, health monitor, routing engine or permission UI. The current v0.1 chat cycle remains inference-only. Existing `module-manifest.schema.json` is retained as the publisher-declared module contract; this specification adds Sofia-owned registry and assessment records around it. No production deployment, Cloudflare setting, secret, `main` branch or existing chat/storage behavior is changed.

## 1. Mission and authority model
The Agent & Executor Management System (AEMS) maintains the authoritative inventory of available reasoning providers, tools, adapters and bounded executor modules. It helps Sofia Core select a suitable executor for a task while preserving central orchestration and owner authority.

Terminology:
- **Agent** is a logical role or service identity (for example, research assistant or code reviewer); it is not automatically trusted or independently authoritative.
- **Executor** is a registered module/service that performs a bounded operation under a versioned capability contract.
- **Provider** is an external model or service dependency used by an agent/executor.
- **Module** is the deployable/versioned artifact described by the existing module manifest.

Sofia Core remains the sole task orchestrator. No agent, model, provider or executor may:
- invoke another executor outside the Core → Execution Supervisor path;
- issue permissions, alter grants, policy, budgets or owner settings;
- choose its own trust rating or erase its incident history;
- expand its own capabilities or delegate hidden sub-tasks;
- approve paid services or treat an agent recommendation as owner approval.

## 2. Registry architecture and records
The system maintains distinct, versioned records:

1. **Module Manifest** — publisher declaration of identity, version, artifact, runtime, dependencies, capabilities, requested permissions, resources and data handling. Existing schema is preserved.
2. **Module Registry Record** — Sofia-owned lifecycle state, manifest digest, exact artifact digest, compatibility, activation status and references to trust/health records.
3. **Capability Definition** — Sofia-owned contract for a narrow operation, including schemas, risk floor, data classes, side-effect behavior, idempotency, cancellation and audit requirements. The existing Capability & Permission Registry remains authoritative for grants.
4. **Trust Assessment** — independently verified publisher/artifact provenance, signature and supply-chain checks, security review, test evidence, incidents and revocation status.
5. **Health Record** — operational availability, latency, error rates, resource use, circuit-breaker status and observation freshness. Health is not trust and is not authorization.
6. **Executor Assessment** — task-specific suitability based on capability match, contract compatibility, platform, data policy, trust, health, measured quality, latency and resource/cost constraints.
7. **Provider Record** — provider endpoint identity, model/service identifiers, terms and data-processing facts, pricing/tier evidence, quotas and availability. Unknown provider facts remain unknown and cannot be assumed safe or free.
8. **Routing Decision** — auditable Core decision explaining eligible candidates, exclusions, selected executor and policy/resource/security references.

These records have separate owners and update paths. Executors may report telemetry, but cannot write trust verdicts, grants, routing decisions or their own final health state.

## 3. Module admission and lifecycle
Lifecycle states:
- `DISCOVERED`: candidate metadata received; untrusted.
- `QUARANTINED`: isolated pending validation or after a security/compatibility concern.
- `VALIDATING`: schema, provenance, digest, dependencies and policy checks in progress.
- `REVIEW_REQUIRED`: human or security review required.
- `APPROVED`: eligible for activation, but no capability grant is implied.
- `ACTIVE`: available for consideration by Core subject to per-task gates.
- `SUSPENDED`: temporarily unavailable; no new dispatch.
- `REVOKED`: trust or authorization withdrawn; no dispatch.
- `RETIRED`: permanently removed from new selection; historical records retained.

Admission sequence:
1. Receive manifest as untrusted input and validate against the existing versioned schema.
2. Verify publisher identity and signature/provenance independently; do not trust self-declared verification fields.
3. Fetch or resolve the exact artifact and verify its SHA-256 digest before installation and again before execution where appropriate.
4. Validate Core API, contract versions, platform/runtime, dependency closure and resource declarations.
5. Review requested capabilities, permission scopes, data classes, retention and network egress.
6. Run static checks, software composition/supply-chain checks, sandboxed tests and adversarial tests.
7. Create trust assessment and require review for elevated-risk capabilities or insufficient evidence.
8. Register the module in quarantine until all admission criteria pass.
9. Activation requires separate policy approval; requested permissions remain requests until explicit grants are issued through CPR.
10. Any digest mismatch, revoked signer, incompatible contract, undeclared dependency or policy violation blocks activation and triggers quarantine.

Updates are new immutable module versions. Never overwrite the meaning of a previously approved version. Rollback selects a previously verified artifact only if its trust, compatibility, grant and policy status remain valid.

## 4. Capability and permission separation
A module can only be selected for a capability explicitly declared in its manifest and independently registered in the Capability & Permission Registry. The manifest is not a grant. A registry state of ACTIVE is not a grant. A high trust score is not a grant.

Before every task step:
- Core checks exact module/version/capability compatibility;
- CPR resolves active grant and scope;
- Security Manager evaluates the exact principal, task, operation, target, data and risk;
- Resource & Budget Manager reserves resources;
- Execution Supervisor performs the only supported invocation and revalidates before side effects.

Permission requests should be narrow: reading mail, sending mail, deleting mail and changing mail settings are separate capabilities. Least privilege and short-lived task-scoped grants are preferred.

## 5. Executor suitability and selection
Routing is a constrained eligibility process, not a single opaque “best model” score.

Hard eligibility filters (any failure excludes candidate):
- module is ACTIVE and not quarantined/suspended/revoked;
- exact artifact digest and publisher provenance are valid;
- required capability and contract version are supported;
- target platform/runtime is compatible (Android-first where the task is device-local);
- required grant, data class, purpose and external processor route are permitted;
- trust meets the capability's minimum threshold;
- health is sufficiently fresh and circuit breaker is closed;
- resource limits and task deadline are feasible;
- provider pricing/tier is verified and allowed under owner policy;
- no unresolved critical security incident or policy block exists.

Among eligible candidates, Core may rank task-specific suitability using explainable weighted factors:
- capability/semantic fit;
- independently measured task quality and verification pass rate;
- trust evidence and review level;
- health, availability and recent failure rate;
- latency and deadline fit;
- resource footprint and quota headroom;
- financial cost (zero additional cost preferred under FREE_ONLY);
- data locality, privacy and processor exposure;
- platform/device efficiency and user preference.

Weights and thresholds are policy-versioned. Hard filters cannot be compensated by a high score elsewhere. A model's self-reported confidence is not a substitute for measured quality or independent verification.

## 6. Trust model
Trust is evidence-based and multi-dimensional, not a single permanent star rating. Record separately:
- publisher identity verification;
- artifact integrity/signature verification;
- source provenance and dependency/supply-chain status;
- security review level and date;
- sandbox/adversarial test coverage;
- capability-specific approval scope;
- incident history and unresolved findings;
- revocation and expiry status.

Trust outcomes: `UNVERIFIED`, `CONDITIONALLY_TRUSTED`, `TRUSTED_WITH_SCOPE`, `SUSPENDED`, `REVOKED`. A trusted module is still isolated and requires per-operation authorization. A trust verdict is capability- and version-scoped, time-bound and revocable.

## 7. Health and reliability monitoring
Health is operational, time-sensitive evidence. Track:
- success/failure/timeout/cancellation counts;
- independently verified success rate by capability and task class;
- latency percentiles and queue delay;
- resource consumption and quota pressure;
- provider availability and error classes;
- circuit-breaker state and last successful health observation;
- version-specific regressions and incident correlations.

Do not combine unrelated capabilities into one misleading quality score. Small sample sizes must be marked low confidence. Stale health is UNKNOWN, not HEALTHY. Health checks must be bounded and must not trigger paid calls under FREE_ONLY.

Circuit breaker states: `CLOSED` (normal), `OPEN` (temporarily no dispatch), `HALF_OPEN` (limited controlled probes). Probes still require normal permission, security and resource gates. Repeated failures, suspicious output, integrity mismatch or security alert can suspend/quarantine the module.

## 8. Independent performance assessment
Performance metrics are based on observed task outcomes, not provider marketing:
- task-specific verification pass rate;
- factual/error rate where measurable;
- schema/contract compliance;
- successful completion and partial completion rates;
- latency and resource usage;
- retry frequency and recovery quality;
- user correction/acceptance feedback, clearly labeled subjective;
- security and privacy incidents.

Keep raw sample counts, observation window, task category, module version, verifier version and confidence interval or uncertainty indicator. Do not compare providers on incomparable tasks or conceal selection bias. A high aggregate score cannot override a task-specific failure or safety restriction.

## 9. Provider and FREE_ONLY policy
Sofia uses free platforms and plans by default:
- only explicitly approved zero-additional-cost routes may be selected;
- unknown or ambiguous pricing is blocked, not treated as free;
- free-tier exhaustion results in stop, wait, use another verified free route, or ask the owner;
- no paid fallback, overage, automatic subscription, card-on-file charge or trial conversion;
- if a paid route is essential, pause before invocation and present provider, model/service, purpose, exact task step, estimated maximum cost, currency, pricing basis, data sent and expiry for explicit owner approval;
- owner approval is bound to that exact provider, task, cap and period; RBM reservation and SSM authorization remain independent gates.

Provider terms, retention, training use, geographic processing and data-transfer facts must be verified from current authoritative documentation before restricted data is routed. If unknown, exclude the route for that data class.

## 10. Delegation and agent boundaries
Agent roles are declarative profiles mapped to registered capabilities and allowed executors. A role does not possess independent authority.
- Core explicitly creates each child task with bounded input, output schema, deadline and purpose.
- Hidden delegation and recursive agent spawning are prohibited.
- Every child step appears in the parent task graph and audit trail.
- A child cannot widen scope, access new data, add recipients, change targets, extend deadlines or increase cost.
- Child outputs are untrusted evidence and require validation/verification.
- Cross-agent communication uses versioned typed contracts, not shared unrestricted memory or credentials.
- Secrets are never passed in prompts or agent context; access is brokered through narrow adapters.

## 11. Data isolation and prompt-injection resistance
Treat manifests, provider responses, model outputs, retrieved documents, tool results and telemetry as untrusted data. They cannot change system policy or authorize actions.
- Separate instructions from data at every adapter boundary.
- Minimize task context and redact credentials/secrets.
- Enforce data classification, purpose limitation, processor allowlists and retention via Data Governance.
- Do not give agents unrestricted shared memory; use explicit, authorized references.
- Sanitize logs and keep private payloads out of telemetry.
- External content cannot instruct Sofia to install modules, alter grants, reveal secrets or bypass approvals.

## 12. Revocation, incidents and kill switch
Core/SSM must stop dispatch immediately when a module or provider is revoked, suspended, compromised, incompatible or over budget. Revocation must invalidate cached eligibility and pending routing decisions. In-flight operations are cancelled where supported; any side-effect outcome that cannot be confirmed is marked OUTCOME_UNKNOWN and reconciled before retry.

Owner stop/pause controls take precedence over scheduling. A system-wide kill switch blocks new executor dispatch; it does not falsely claim that already-issued external requests were undone.

## 13. Audit and owner visibility
Record minimal, append-only events:
- manifest/version/artifact digest and provenance checks;
- trust assessment and reviewer/policy references;
- activation, suspension, quarantine, revocation and rollback;
- health observation source, time and freshness;
- candidate eligibility/exclusion reason codes;
- routing decision, chosen executor and policy version;
- capability/grant/SSM/RBM/ES references;
- task outcome and independent verification;
- incidents, circuit-breaker transitions and owner actions.

Owner view should explain what each executor can do, what it requests, what is actually granted, which data it can process, whether it uses external providers, verified cost tier, trust evidence, recent reliability and why it was selected or excluded.

## 14. Acceptance tests
1. Invalid manifest, unknown fields, incompatible contracts and dependency cycles prevent activation.
2. Self-declared publisher verification is never accepted as independent verification.
3. Artifact digest mismatch quarantines the module.
4. Manifest permission requests never create capability grants.
5. ACTIVE status never bypasses per-task SSM authorization or RBM reservation.
6. Revoked/suspended modules are excluded immediately, including cached routes.
7. Unknown/stale health is not treated as healthy.
8. Trust and health are separate records and separate dimensions.
9. A strong score cannot override a failed hard eligibility filter.
10. Candidate ranking is explainable and versioned.
11. Task-specific measured quality is not replaced by self-reported model confidence.
12. Unknown pricing blocks provider selection under FREE_ONLY.
13. Paid fallback never occurs silently.
14. Agent cannot spawn hidden child agents or widen parent authority.
15. All external side effects pass through Execution Supervisor.
16. Prompt injection in manifest, tool output or model response cannot alter policy or grants.
17. Data-class and processor restrictions are enforced before dispatch.
18. Circuit breaker blocks new calls but does not misstate in-flight outcomes.
19. Owner can inspect, suspend and revoke modules and stop dispatch.
20. Existing chat, memory, storage keys and production branch remain unchanged.

## 15. Implementation sequence
A — implement deterministic manifest parser and immutable registry storage.
B — implement provenance/digest/signature verification and quarantine lifecycle.
C — implement capability-definition linkage and read-only grant resolution via CPR.
D — implement trust assessment and review workflow.
E — implement health telemetry, freshness and circuit breakers without paid probes.
F — implement task-specific candidate eligibility and explainable routing decisions.
G — integrate Core → TPOE → SSM/RBM → ES with typed contracts.
H — implement owner-visible module inventory, permission explanations, suspend/revoke/stop controls.
I — add adversarial, supply-chain, data-egress, prompt-injection and recovery tests before activation.

## 16. Current boundary
This specification and its contracts do not install, activate, execute or authorize any module. No runtime registry, trust scoring, health monitor, automatic routing or agent delegation is implemented. v0.1 remains inference-only.
