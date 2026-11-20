# Sofia AI Capability & Permission Registry — Architecture Specification v1

## Status and implementation boundary

This is a design specification that builds on the existing `module-manifest.schema.json` contract. It does not implement a live registry, module installation, permission prompts, sandboxing, or runtime enforcement. The current v0.1 chat cycle remains inference-only. No production deployment, Cloudflare setting, secret, or `main` branch change is included.

## 1. Purpose

The Capability & Permission Registry (CPR) is the authoritative catalogue of what modules exist, what they claim they can do, what they request, and what Sofia has independently authorized them to do.

Its central rule is:

**A module manifest describes a request and technical declaration. It never grants permission.**

Sofia Core owns orchestration. Modules are replaceable executors/adapters. The registry must not turn any model provider or external module into a privileged controller of Core.

## 2. Registry records and separation

The registry maintains distinct records:

1. **Module manifest** — publisher-declared identity, version, artifact digest/signature, compatibility, runtime, dependencies, capabilities, requested permissions, resource profile and data-handling declarations.
2. **Capability definition** — Sofia-owned contract defining one stable capability ID, supported operations, input/output schemas, risk floor, data classes, side-effect semantics, idempotency/cancellation behavior and required enforcement points.
3. **Permission request** — the exact scopes and purposes requested by a module version. This is derived from the manifest and reviewed; it is not an authorization.
4. **Capability grant** — owner- or policy-authorized permission bound to principal, module, version constraint, capability, operations, targets, data scope, risk ceiling, limits and expiry.
5. **Module trust record** — provenance verification, artifact digest, signature verification, security review, test results, incidents and revocation state.
6. **Runtime health record** — availability, error history, latency, resource consumption and circuit-breaker state. Health is operational evidence, not authorization.

These records must remain independently versioned and auditable. A module cannot edit its own capability definitions, grants, trust status or health history.

## 3. Module manifest

The existing `contracts/v1/module-manifest.schema.json` is the baseline contract. It includes:

- stable `module_id`, display name and semantic version;
- publisher identity and verification status;
- artifact URI, SHA-256 digest and optional signature metadata;
- Core API and contract compatibility;
- supported runtime and platform;
- declared dependencies and version ranges;
- capability IDs and contract versions;
- requested permissions and their purposes;
- memory, execution, concurrency and network resource declarations;
- data classes and retention behavior.

A manifest is untrusted input until its publisher, artifact digest and signature/provenance have been verified. The digest must be checked against the exact artifact that is installed or executed. A publisher's self-declared `verified` status is not sufficient evidence; Sofia's trust service must verify it independently.

Unknown fields, unsupported contract versions, incompatible dependencies, invalid signatures, digest mismatch or undeclared runtime requirements must prevent activation and place the module in quarantine.

## 4. Capability definition and naming

Capability IDs are stable, namespaced identifiers such as:

- `mail.messages.read`
- `mail.messages.send`
- `calendar.events.read`
- `calendar.events.create`
- `device.audio.playback`
- `device.display.present_private`
- `phone.contacts.read`
- `phone.calls.initiate`

A capability is a narrowly defined operation, not a broad product label such as “Gmail access” or “phone control”. Read, create, send, forward, delete, export and settings changes must be separate capabilities when their impact differs.

Each Sofia-owned capability definition specifies:
- stable ID and semantic contract version;
- operation and target schema;
- input/output schema references;
- minimum risk tier (policy may raise it);
- permitted data classifications;
- whether it can cause external side effects;
- idempotency, timeout and cancellation semantics;
- mandatory authentication assurance and approval gates;
- required audit fields and data-retention constraints.

Modules may implement a capability contract but cannot redefine its meaning or lower its risk floor.

## 5. Permission request versus permission grant

A module manifest's `permissions` and capability declarations are requests. Installation or update must show the owner a concise explanation of:
- which capability is requested;
- why the module says it needs it;
- which operations and targets are involved;
- which data classes may be accessed;
- whether data leaves the device;
- whether the operation changes external state;
- risk tier, duration and resource limits.

The owner may approve a narrower subset than requested. Optional permissions remain disabled unless separately approved. Declining one permission must not silently cause the module to request a broader substitute.

The `capability-grant.schema.json` record represents the actual authorization. It binds a principal to a module and version constraint, one capability, allowed operations, target/data scope, risk ceiling, optional limits, issue/expiry timestamps and revocation status.

A grant is not:
- a general trust certificate for the publisher;
- permission for every module by that publisher;
- permission for a different module version unless its version constraint explicitly allows it;
- permission for an unrelated target or operation;
- a replacement for a valid owner session, task Authority Envelope, consent or Security Manager decision.

## 6. Least privilege and scope matching

Every grant must be as narrow as practical:
- one principal;
- one module identity and controlled version range;
- one capability;
- explicit operations;
- explicit resource/target scope;
- minimum data scope;
- risk ceiling;
- bounded time period;
- call, cost, concurrency or other limits where relevant.

Wildcards and broad scopes are prohibited by default. If a future capability genuinely requires a pattern scope, the capability definition must specify its canonical matching semantics and tests; a module cannot interpret patterns itself.

The effective permission is the intersection of all applicable constraints:

**manifest-declared capability ∩ capability definition ∩ active grant ∩ task Authority Envelope ∩ authenticated session ∩ Security Manager policy ∩ resource limits.**

An empty, unknown, expired or contradictory intersection means no execution.

## 7. Module lifecycle

Use explicit lifecycle states:

- `proposed`: metadata submitted; no execution.
- `quarantined`: untrusted or under review; no execution.
- `approved`: static, compatibility and security checks passed; not necessarily enabled for the owner.
- `enabled`: eligible for invocation, subject to a valid grant and per-action Security Manager decision.
- `suspended`: temporarily unavailable; no new invocations.
- `revoked`: trust or permission withdrawn; all related grants and active sessions are invalidated.
- `retired`: removed from service; historical audit records retained under policy.

State transitions require an authorized registry operation and an audit event. A module cannot change its own lifecycle state. Security incidents, signature/digest failures, critical vulnerabilities, repeated policy violations or owner revocation can trigger quarantine/suspension/revocation.

## 8. Versioning and compatibility

- Use semantic versions for modules and capability contracts.
- Pin exact artifact digest for each approved release.
- Declare Core API and contract versions explicitly.
- Resolve dependencies before activation; reject cycles or incompatible version ranges unless a reviewed dependency model explicitly supports them.
- A module update is a new artifact and requires digest/signature verification, compatibility checks and a permission-diff review.
- Newly requested capabilities or broader scopes require fresh owner approval.
- Existing grants must not silently expand on update. They remain valid only if the new version satisfies the grant's explicit version constraint and policy permits migration.
- Breaking contract changes require a new major version and compatibility tests.
- Keep rollback artifacts and metadata for known-good versions, but do not automatically reactivate a version whose trust has been revoked.

## 9. Execution isolation and runtime enforcement

The registry does not itself provide a sandbox. It declares the runtime requirements and supplies verified metadata to the execution supervisor.

Before invocation, the supervisor must:
1. resolve the exact module version and artifact digest;
2. verify current lifecycle/trust state;
3. resolve the capability definition and active grant;
4. obtain an `ALLOW` decision from Security Manager for the exact action;
5. enforce the declared and policy-imposed resource limits;
6. execute in the approved isolation boundary;
7. revalidate authorization before any external side effect;
8. record outcome and update health metrics.

No module receives unrestricted filesystem, network, credential-store, microphone, camera, contact, mail or device access merely because it is installed. Access is brokered through explicit Core capabilities and adapters. Secrets are never embedded in manifests or passed as unrestricted environment data.

## 10. Provider and executor neutrality

AI providers (for example, OpenRouter or Gemini) are provider adapters, not owners of the registry or Core. They may be selected by policy based on capability, cost, latency and trust metadata. They cannot:
- issue or alter grants;
- select a higher autonomy level;
- bypass Security Manager;
- read secrets unless a specific approved adapter contract requires a narrowly scoped secret reference;
- invoke another module except through Core orchestration and authorization.

Provider failover must preserve the same task scope, data classification, privacy policy and budget. A fallback provider must not receive more data or permissions than the primary provider.

## 11. Trust, reliability and metrics

Keep separate dimensions rather than collapsing them into one opaque trust score:

- publisher/artifact provenance;
- security review status;
- contract and compatibility status;
- test coverage and recent test results;
- vulnerability/incident status;
- operational availability and latency;
- error and timeout rates;
- resource/cost behavior;
- policy violations and denied invocation attempts.

A high availability score cannot compensate for an invalid signature. A verified publisher does not imply a module is safe for every capability. Trust status and runtime health are inputs to policy, not grants.

## 12. Revocation and incident response

Revocation must be enforceable centrally:
- revoke one grant without uninstalling the module;
- suspend or revoke one module without affecting unrelated modules;
- revoke a publisher or signing key and quarantine affected artifacts;
- invalidate cached authorization decisions and active module sessions;
- prevent queued work from starting;
- cancel interruptible running work;
- preserve minimal incident evidence without retaining protected payloads.

If an external operation may already have completed, reconcile its status before retrying. Revocation cannot promise reversal of completed external actions.

## 13. Required acceptance tests

1. A manifest requests a permission; no grant exists — invocation is denied.
2. A grant exists for read but the module requests delete — invocation is denied.
3. A grant is bound to one target; a different target is denied.
4. A grant expires or is revoked after planning but before execution — no side effect occurs.
5. Artifact digest mismatch or invalid signature quarantines the module.
6. A module declares a publisher as verified but the trust verifier cannot confirm it — it remains untrusted.
7. An update adds a new permission — prior grants do not expand.
8. An update changes artifact digest without re-review — activation is blocked.
9. An unsupported contract version or dependency conflict blocks activation.
10. A module cannot change its own grants, lifecycle, risk tier or resource quota.
11. A module cannot access raw credentials, unrestricted network or filesystem outside brokered capabilities.
12. A module with repeated errors can be suspended without changing unrelated modules.
13. Revocation invalidates cached decisions and prevents queued invocations.
14. Provider failover preserves data scope, policy, grant and budget.
15. A verified and healthy module still requires a per-action Security Manager decision.
16. No secrets or user payloads appear in manifests, ordinary logs or registry health records.

## 14. Implementation phases

**A — Contract validation:** inspect and validate the existing module manifest; add the capability grant contract and cross-reference rules.

**B — Static registry:** build a read-only registry index for module manifests, capability definitions and artifact digests. No module execution.

**C — Review workflow:** add quarantine, provenance verification, compatibility checks and owner-facing permission-diff summaries.

**D — Grant management:** create, narrow, expire, suspend and revoke grants; connect every grant to IAM and Security Manager.

**E — Execution supervisor:** enforce isolation, capability brokerage, resource quotas and pre-side-effect revalidation.

**F — Health and incident controls:** add independent health metrics, circuit breakers, audit, revocation propagation and rollback.

**G — Controlled activation:** test with mock modules in a non-production environment. Preserve the current chat cycle and existing storage. No production activation without separate explicit owner approval.

## 15. Current v0.1 boundary

The repository already contains a module manifest schema, and this work adds a separate capability-grant schema and this architecture specification. These are contracts/design only. No registry database, permission UI, grant issuance, module sandbox, installer, runtime enforcement or module invocation system is implemented by this change.
