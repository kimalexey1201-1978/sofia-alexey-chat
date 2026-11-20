# Update & Recovery Manager

**Status:** Architecture specification; not an implementation claim.  
**Contract baseline:** v1  
**Scope:** software updates, release validation, backup/restore coordination, rollback and disaster recovery.

## 1. Purpose and boundaries

The Update & Recovery Manager (URM) coordinates safe delivery of Sofia Core, platform components and modules, and restores a known-good state after failed updates or runtime/data incidents. It must preserve user data and respect the existing production prototype until migration is explicitly approved.

The URM is not a package trust authority and does not replace:
- Module Lifecycle Manager (MLM), which validates and activates module artifacts;
- Security Manager and Identity & Authentication Manager, which authorize actors and operations;
- Task Orchestrator, which coordinates work and safe cancellation;
- Resource & Runtime Manager, which enforces execution budgets and platform constraints;
- Audit & Observability Manager, which records decisions and outcomes.

The URM coordinates these components through versioned contracts. It must not bypass their policy gates.

## 2. Update classes and compatibility

Classify updates before execution:
- core/runtime update;
- platform adapter update;
- module update;
- security-policy or contract update;
- data/schema migration;
- configuration-only update.

Every release declares a unique release ID, semantic version (or documented equivalent), target platforms, supported contract versions, dependency lock, artifact digests, provenance/signature evidence, change summary, migration plan, rollback constraints and release channel.

Compatibility is explicit: core, modules, adapters, contracts and persisted data have independently versioned compatibility ranges. Reject unsupported combinations before staging. Do not infer compatibility solely from version number or publisher declaration.

## 3. Release acquisition and verification

Acquire candidate artifacts only from configured trusted sources or an owner-authorized source. Keep downloaded artifacts immutable and quarantined. Before staging:

1. verify publisher identity and provenance under trust policy;
2. verify cryptographic digest against the release metadata and signature when supported;
3. validate release manifest and contract versions;
4. resolve and lock dependencies; detect cycles, conflicts and untrusted sources;
5. inspect SBOM/dependency inventory and vulnerability findings when available;
6. verify platform/runtime compatibility and required resources;
7. validate migration preconditions and backup coverage;
8. run static, policy, integration and sandbox tests;
9. produce a human-readable change/risk summary.

Missing evidence is not a pass. A critical unresolved vulnerability, invalid signature where signature is mandatory, digest mismatch, unsupported contract or failed mandatory test blocks rollout.

## 4. Staging and rollout

Never update the active installation in place when a safer staged or side-by-side strategy is available. Keep the currently working version intact while candidate artifacts are validated.

Rollout sequence:
1. create an update operation and authorize it;
2. verify available storage, power/battery, network and runtime capacity;
3. create and verify required recovery points;
4. stage immutable candidate artifacts;
5. apply reversible migrations in an isolated copy or shadow environment where possible;
6. run pre-activation tests;
7. request required owner approval with a clear summary of changes, permissions, risks, downtime and rollback limits;
8. activate through an atomic pointer/switch when supported;
9. run bounded canary/health checks;
10. complete rollout only after health criteria pass.

For Android, respect OS lifecycle, package installation rules, background execution limits, storage permissions and battery/thermal constraints. Do not depend on hidden APIs, silent privileged installation or persistent background execution that the platform does not permit.

## 5. Backup and recovery-point policy

Backups are purpose-scoped and classified:
- configuration and policy;
- module/core artifacts and manifests;
- application metadata and indexes;
- user content and conversation history;
- credentials and cryptographic material (only through a dedicated secure secret-management mechanism; never as ordinary plaintext backup);
- audit records.

Each recovery point records its scope, creation time, source version, schema versions, integrity digest, encryption status, storage location/reference, retention class and verification result.

Use encryption in transit and at rest where supported. Apply least-privilege access, key separation and retention limits. Do not log secrets or include them in ordinary backup bundles. Credentials should be re-provisioned or restored only through a secure, policy-controlled process.

A backup is not considered usable until integrity verification succeeds and a restore test has been performed according to the configured schedule and risk class. Maintain recovery-point objectives (RPO) and recovery-time objectives (RTO) per data class; do not claim a recovery guarantee without measured tests.

## 6. Data migration and rollback

Every migration declares:
- source and target schema versions;
- preconditions and expected effects;
- whether it is reversible;
- backup/recovery point required;
- validation queries/checks;
- compatibility window;
- rollback or forward-repair procedure.

Prefer expand-and-contract migrations: introduce backward-compatible schema changes, deploy compatible readers/writers, migrate data, verify, then remove obsolete structures in a later release. Never delete or transform user data irreversibly as an implicit side effect of a software update.

Rollback of binaries does not automatically roll back data. If a migration is irreversible or backward-incompatible, block binary rollback unless a verified data restore or tested forward-repair plan exists. Never restore revoked permissions, credentials, policy exceptions or vulnerable artifacts from an older recovery point.

## 7. Health checks and automatic rollback

Define release-specific health gates before rollout. Signals may include process startup, API readiness, crash rate, error rate, latency, resource pressure, storage integrity, data consistency and critical workflow smoke tests.

A canary rollout is bounded by time, traffic/device scope and resource budget. If a mandatory gate fails or a safety threshold is crossed:
- stop further rollout;
- prevent new work from targeting the candidate;
- have the Orchestrator cancel or safely drain candidate-bound tasks;
- switch to the last known-good compatible artifact where safe;
- execute data recovery or forward repair only according to the migration plan;
- verify restored health;
- record the incident and preserve diagnostic evidence.

Automatic rollback must fail closed if the previous version is incompatible with current data or policy. In that case, isolate the affected service and enter a controlled recovery procedure rather than making a destructive switch.

## 8. Recovery modes

Support explicitly defined recovery modes:
- **process recovery:** restart or replace a failed process without changing durable data;
- **component rollback:** restore a prior compatible component artifact;
- **configuration recovery:** restore a validated configuration revision;
- **data recovery:** restore selected data from a verified recovery point;
- **full disaster recovery:** reconstruct a system from verified artifacts, configuration and backups.

Recovery requires authenticated authorization, scope selection and preflight checks. Prefer the narrowest recovery scope that resolves the incident. Show the operator what will be restored, overwritten or lost. Data-destructive recovery requires explicit high-impact approval and a verified backup. Where possible, preserve a pre-recovery snapshot for forensic analysis and reversal.

## 9. Failure handling and consistency

Use durable operation IDs, checkpoints and idempotent steps. Persist the update/recovery state before crossing an irreversible boundary. On process restart, reconcile declared state with installed artifacts, active process identity, data schema versions, grants and audit records.

If state is ambiguous, stop rollout and disable candidate execution. Never assume a partially completed update succeeded. Recovery must not overwrite newer valid user data with older snapshots without explicit authorization and a clear data-loss warning.

## 10. Security, privacy and audit

Update and restore operations are privileged. Enforce fresh authorization at request time and immediately before critical transitions. Voice identity alone is insufficient for high-impact approval. Use scoped, expiring approvals and separate permissions for software update, configuration change, credential recovery and user-data restore.

Audit acquisition, verification, staging, approval, migration, activation, canary checks, completion, rollback, backup creation/verification, restore and recovery failures. Include actor, operation/release/recovery-point IDs, artifact digests, versions, timestamps, policy decision, approval reference and outcome. Exclude secrets and unnecessary user content.

## 11. Android-first and cross-platform behavior

The architecture is Android-first but cross-platform. Platform-specific adapters expose only supported installation, storage, backup, lifecycle and recovery mechanisms. Windows, Linux and macOS may provide different capabilities; capability discovery must report actual support rather than pretending all platforms behave identically.

On Android, user-controlled installation flows, scoped storage, app sandboxing, background limits, Doze, battery/thermal state and OEM variations must be respected. A companion desktop agent may provide capabilities unavailable to an Android app, but it must be separately authenticated and explicitly paired.

## 12. Acceptance criteria

- Candidate artifacts are immutable, quarantined and digest-verified before staging.
- Invalid provenance, unsupported contracts and failed mandatory tests block rollout.
- Active production version remains intact during candidate validation.
- Backup integrity and restore tests are measurable and recorded.
- Migration rollback constraints are enforced; binary rollback cannot silently corrupt data.
- Canary failure stops rollout and invokes a compatible recovery path.
- Recovery scopes and data-loss consequences are disclosed before approval.
- Revoked credentials, grants and policy exceptions are never resurrected by rollback.
- Restart reconciliation fails closed on ambiguous partial updates.
- User data is not silently deleted or overwritten.
- All privileged operations produce attributable audit records.
- Platform adapters expose only capabilities actually supported by the OS/device.

**Implementation note:** this document defines the intended design. It does not claim that update delivery, backup infrastructure, canary rollout, automated rollback or disaster recovery is already implemented.
