# Module Lifecycle Manager

**Status:** Architecture specification; not an implementation claim.  
**Contract baseline:** v1  
**Applies to:** module installation, validation, activation, update, suspension, revocation and removal.

## 1. Purpose and boundaries

The Module Lifecycle Manager (MLM) controls the trusted transition of a module from an untrusted artifact to an eligible runtime component, and controls its safe retirement. It owns lifecycle state and installation evidence. It does not replace the Module Registry, Capability Registry, Security Manager, Identity & Authentication Manager, Resource & Runtime Manager, Task Orchestrator or Audit & Observability Manager.

- **Module Registry** records module identity, declared metadata and discoverability.
- **MLM** records a particular installed artifact, its provenance, validation evidence and lifecycle state.
- **Security Manager** decides whether a principal may perform an operation or receive a grant.
- **Task Orchestrator** schedules/cancels work and must refuse execution for ineligible modules.
- **Resource & Runtime Manager** enforces sandbox and resource budgets.
- **Audit & Observability Manager** records attributable, integrity-protected events.

An installation record is not proof of trust. A valid manifest is not proof of safety. A successful install never grants runtime authority by itself.

## 2. Lifecycle states

Primary forward path:

`discovered → quarantined → validating → testing → staged → active`

Additional terminal or control states:

- `rejected`: validation or policy gate failed; cannot activate without a new reviewed artifact or explicit remediation path.
- `suspended`: temporarily blocked; state and evidence retained for investigation/recovery.
- `disabled`: intentionally inactive; can be re-enabled only through policy checks.
- `revoked`: trust or authorization withdrawn; credentials and grants invalidated. Re-activation requires a new trust decision and normally a new installation record.
- `failed`: lifecycle operation failed; recovery or rollback is required.

Transitions must be explicit, validated, attributable and audited. No direct transition from `discovered`, `quarantined`, `validating` or `testing` to `active` is permitted. A transition to `active` is allowed only from `staged` after all activation gates pass. State changes use compare-and-swap or equivalent concurrency control to prevent stale workers from overwriting newer decisions.

## 3. Quarantine-by-default

Every newly discovered or downloaded artifact enters `quarantined`. While quarantined, validating or testing:

- no production capability grants are issued;
- no access to user data, sensors, network destinations or device controls is allowed except narrowly scoped validation fixtures;
- no module code executes outside an isolated, resource-limited validation sandbox;
- installation metadata and artifact bytes are stored separately from active runtime state;
- the artifact cannot be selected by the Task Orchestrator.

The sandbox must deny by default and must not inherit ambient credentials, environment secrets, host filesystem access or production tokens. Validation infrastructure itself must be isolated and monitored.

## 4. Supply-chain and artifact verification

Before activation, the MLM must collect and evaluate evidence for:

1. **Identity and provenance:** stable module ID, publisher identity, source, acquisition time and provenance chain.
2. **Integrity:** cryptographic digest of the exact artifact; digest is immutable for that installation record. Verify publisher signature against an independently configured trust policy where signatures are supported.
3. **Manifest:** validate against the versioned Module Manifest JSON Schema; reject unknown critical fields and unsupported contract versions.
4. **Dependencies:** resolve pinned or constrained versions, verify dependency provenance and integrity, detect cycles/conflicts, enforce approved-source policy and produce an SBOM or equivalent dependency inventory when available.
5. **Compatibility:** platform, OS/API, runtime, architecture, contract and dependency compatibility.
6. **Capabilities and permissions:** compare declared capabilities to requested permissions; reject undeclared privilege escalation and explain each requested permission and its purpose to the owner.
7. **Security posture:** scan for known vulnerabilities and prohibited behavior; critical unresolved findings block activation under policy.
8. **Resource profile:** validate CPU, memory, storage, network, battery and execution-time budgets.
9. **Tests:** schema, static, dependency, sandbox, integration and policy tests with versioned results and reproducible test metadata.

Missing evidence is represented as missing, never silently treated as a pass. Signature support and vulnerability intelligence depend on configured infrastructure; the architecture does not claim these services already exist.

## 5. Validation and activation gates

The `validating` phase performs non-executing checks first, then controlled sandbox checks. The `testing` phase runs approved test suites in an isolated environment using synthetic or explicitly approved fixtures.

The transition to `staged` requires all mandatory validation and test gates to pass. The transition from `staged` to `active` additionally requires:

- a trusted provenance decision under configured policy;
- exact artifact digest re-verification immediately before activation;
- compatible runtime and dependencies;
- no unresolved blocking security finding;
- approved sandbox profile and resource budget;
- explicit owner consent for sensitive permissions and any policy-required approval;
- successful pre-activation health checks;
- an auditable activation decision.

The Security Manager remains authoritative for permissions. The MLM may request grants but cannot mint or widen them. Owner consent is not a substitute for policy enforcement. Voice recognition alone cannot authorize high-impact installation or permission grants.

## 6. Safe installation and updates

Installation and update are high-impact operations and require authenticated, policy-authorized requests. Show the owner the module publisher/source, version, artifact digest, purpose, requested capabilities, permissions, risks and rollback implications before approval when approval is required.

An update is a new immutable artifact and a new installation record linked to the prior record. Never overwrite the evidence for the old version. The update process:

1. acquire and quarantine the candidate;
2. verify provenance, digest, manifest, dependencies and compatibility;
3. validate and test in isolation;
4. stage without changing the active version;
5. re-check policy, permissions and owner approval;
6. activate using an atomic switch where the platform supports it;
7. perform health checks and a bounded canary rollout where practical;
8. commit the rollout only after health criteria pass; otherwise roll back to the last known-good artifact.

Prevent downgrade attacks with version policy, monotonic security metadata where available, and explicit approval for exceptional rollback. Rollback must not restore revoked credentials, obsolete permissions or known-vulnerable dependencies. If atomic switching is unavailable, use a documented maintenance window and recoverable transition.

## 7. Dependency graph

Resolve the complete dependency graph before staging. Enforce version constraints, artifact integrity, provenance policy, platform compatibility and an approved-source policy for every dependency. Detect cycles and conflicting constraints before any activation. A dependency becoming unavailable, revoked or incompatible must prevent new dependent work and trigger policy-defined suspension or remediation. Do not silently substitute a different dependency version.

## 8. Suspension, disablement and revocation

- **Suspend:** immediately block new work and apply policy to in-flight work; preserve evidence for investigation.
- **Disable:** stop normal execution by an authorized owner or policy action; retain installation metadata for possible re-enable.
- **Revoke:** invalidate module credentials, capability grants and trust assertions; prevent scheduling; instruct the Orchestrator to cancel or safely terminate running work.
- **Fail:** record the failing operation, isolate the artifact and invoke bounded recovery.

Emergency stop and security revocation take precedence over availability. Re-enabling a suspended or disabled module requires fresh integrity, compatibility, policy and health checks. A revoked module cannot regain trust merely by changing its local state field.

## 9. Removal and data retention

Uninstall removes module runtime files, process state, module credentials and module-specific grants. It must not unexpectedly delete user-owned, shared or cross-module data. Before removal, identify data ownership and retention obligations; present the owner with a clear data-retention outcome when user data is affected. Preserve security/audit evidence according to retention policy. Destructive deletion of user data requires separate explicit authorization and must be recoverable where feasible.

## 10. Concurrency, recovery and audit

Lifecycle operations are idempotent where possible and carry operation IDs. Use locking or optimistic concurrency checks around state transitions. A crash must leave a recoverable state, never an ambiguous partially active installation. On restart, reconcile persisted state with actual runtime processes, grants and artifact digests; default to non-active if consistency cannot be established.

Emit an audit event for discovery, acquisition, validation start/result, test start/result, approval, staging, activation, update, rollback, suspension, disablement, revocation, uninstall and recovery. Events include actor, installation ID, module ID/version, artifact digest, previous/new state, policy decision, reason, timestamp and correlation/operation ID. Do not log secrets or raw sensitive user data.

## 11. Orchestrator and runtime enforcement

The Task Orchestrator must check the current lifecycle state and artifact identity at plan validation and immediately before dispatch. Only `active` installations with valid grants and compatible runtime may execute production tasks. Cached eligibility must expire and be invalidated on state changes. The runtime must reject stale credentials and revoked module identities. Lifecycle state is one input to authorization, never the only one.

## 12. Acceptance criteria

The design is acceptable only when tests demonstrate:

- all new artifacts enter quarantine;
- no production execution or grants occur before activation;
- altered artifact bytes fail digest/signature verification;
- invalid manifests, unsupported contracts and dependency cycles are rejected;
- missing validation evidence cannot pass a gate;
- permission requests are visible, scoped and policy-authorized;
- activation re-checks artifact digest and policy;
- failed canary/health checks roll back without restoring revoked grants;
- suspension/revocation blocks new work and cancels or safely terminates in-flight work;
- stale concurrent transitions are rejected;
- uninstall preserves user-owned/shared data unless separately authorized;
- every lifecycle transition produces an attributable audit record;
- restart reconciliation fails closed when installation/runtime state disagrees.

**Implementation note:** this document specifies intended behavior. It does not assert that the lifecycle manager, sandbox, signature verification, scanner, canary deployment or rollback mechanism has been implemented.
