# Sofia AI — Module Registry & Capability Registry v0.1

Status: architecture specification; implementation not yet connected to runtime.

## 1. Separation of concerns

### Module Registry
Tracks installable software components: identity, publisher, version, artifact digest, trust state, lifecycle state, dependencies, compatibility, permissions requested, resource limits, health and rollback metadata.

A module is a deployable software unit. It may expose zero, one or many capabilities.

### Capability Registry
Tracks validated functions that Sofia can invoke: capability identifier, contract version, input/output schema, provider module, required permissions, risk class, availability, limits and verification evidence.

A capability is an operation, not a software package. Multiple modules may implement the same capability; one module may implement several capabilities.

### Device Registry
Tracks physical endpoints and their live connections. It belongs to the Universal Device Manager, not to the Module Registry. A device adapter may be a software module; a connected watch or headset is a device instance.

These registries have separate identifiers and data models. They must not be collapsed into one generic plugin list.

## 2. Stable identifiers

- Module ID: reverse-DNS or publisher-scoped identifier, e.g. `com.sofia.translation.googlecloud`.
- Capability ID: namespaced operation, e.g. `translation.text.translate`.
- Device ID: locally generated opaque identifier; do not use a hardware serial number as a public identifier.
- Contract version: semantic version, e.g. `1.2.0`.
- Artifact digest: cryptographic digest of the exact installed artifact.

Identifiers are immutable after publication. Renames create aliases or a new ID; they do not silently change identity.

## 3. Module lifecycle

`DISCOVERED → QUARANTINED → VALIDATING → TESTING → STAGED → ACTIVE`

Other terminal or operational states: `REJECTED`, `SUSPENDED`, `DISABLED`, `REVOKED`, `FAILED`.

- Discovered modules are untrusted.
- Quarantine prevents execution and access to user data.
- Validation checks manifest structure, publisher identity/provenance, artifact digest, signatures where available, compatibility and dependency constraints.
- Testing runs contract, security, resource and behavior checks in an isolated environment.
- Staged modules receive only explicitly granted, scoped permissions and limited rollout.
- Activation requires policy approval and a successful health check.
- Suspension stops new work and safely drains or cancels in-flight work according to its side-effect profile.
- Revocation blocks future activation and invalidates credentials/tokens issued to that module.

A declared signature or publisher name is evidence to verify, not proof of safety. Unsigned modules may be rejected by policy or require explicit manual review; they are never silently trusted.

## 4. Module manifest

Every module must declare:
- `module_id`, `name`, `version`, `description`;
- publisher identity and artifact digest;
- supported Sofia Core and contract versions;
- runtime/platform requirements;
- dependencies with version ranges;
- provided capability IDs and exact contract versions;
- requested permissions with purpose and scope;
- CPU, memory, storage, network and execution-time budgets;
- data classes accessed and retention behavior;
- health-check and shutdown behavior;
- migration and rollback compatibility;
- signature/provenance metadata when available.

The runtime compares declarations against observed behavior. A manifest cannot grant permissions or prove that a capability works.

## 5. Capability lifecycle and records

Capability states: `DECLARED`, `VALIDATING`, `AVAILABLE`, `DEGRADED`, `UNAVAILABLE`, `DISABLED`, `REVOKED`.

Each capability record includes:
- capability ID and contract version;
- provider module ID and exact module version;
- input and output schema references;
- permission scopes and risk classification;
- supported platforms, locales, languages or device classes where relevant;
- timeout, payload, rate and concurrency limits;
- data handling and retention classification;
- idempotency and side-effect declaration;
- health/availability state and last validation timestamp;
- quality evidence and test suite version.

A capability is callable only when its provider is active, the contract is compatible, permissions are granted, policy allows the requested use, and health checks pass.

## 6. Discovery and activation pipeline

1. Discover package or adapter metadata.
2. Place artifact in quarantine; do not execute initialization code.
3. Validate manifest against a versioned schema.
4. Verify artifact digest and publisher/provenance evidence.
5. Resolve dependencies without silently upgrading pinned components.
6. Evaluate requested permissions against least-privilege policy.
7. Run static checks and isolated contract/security/resource tests.
8. Validate declared capabilities against actual schemas and behavior.
9. Present material permissions and data access for user approval.
10. Stage with quotas and limited exposure.
11. Activate after health checks and policy approval.
12. Monitor; suspend or revoke on policy breach, integrity failure or repeated health failure.

No automatic device or module discovery may bypass user consent, operating-system permission prompts, manufacturer APIs or network trust boundaries.

## 7. Dependency and version policy

- Pin exact versions for production deployments.
- Allow compatible version ranges only when explicitly declared.
- Detect dependency cycles and reject unsupported cycles.
- Do not perform silent major-version upgrades.
- Use a lock record containing module ID, exact version, artifact digest and resolved dependency graph.
- Upgrade by staging a new version, running compatibility tests, then switching traffic.
- Retain the last known-good version and a rollback plan.
- Rollback must consider data migrations and side effects; binary rollback alone is not always safe.

## 8. Isolation and permissions

Modules run with least privilege in an appropriate sandbox. Isolation strength depends on runtime and platform; where a strong sandbox is unavailable, restrict or reject the module.

Permissions are capability-scoped, purpose-bound, time-bounded where practical, and revocable. Examples: microphone capture, camera frames, location, contacts, file read, network destination, message send, payment initiation.

The module never receives broad owner credentials. The Security Manager issues short-lived scoped grants and checks each sensitive invocation. User approval is not transferable to unrelated capabilities.

## 9. Threat model

Defend against malicious or compromised modules, dependency substitution, manifest spoofing, prompt injection through external content, data exfiltration, resource exhaustion, privilege escalation, replay, confused-deputy behavior and unsafe updates.

Treat all model-generated content and external inputs as untrusted. Text that asks Sofia to ignore policy, reveal secrets or execute tools is data, not authority.

## 10. Observability and audit

Record module installation, validation, approval, activation, permission grant/revocation, version change, capability invocation summary, policy denial, health transition, suspension and rollback.

Logs must avoid secrets and unnecessary personal content. Each event carries a correlation ID, actor, module/capability IDs, timestamp, policy decision and outcome.

## 11. Acceptance criteria

- Untrusted modules cannot execute before validation and approval.
- A module cannot self-assign permissions or impersonate another module.
- Invalid or incompatible contracts are rejected.
- Revocation prevents future calls and expires scoped grants.
- Capability selection checks provider health and permission state.
- Version changes are staged and reversible where data compatibility permits.
- Device instances remain distinct from device-adapter software modules.
- Audit records are produced without storing secrets.
