# Reconciliation Durable Storage & Atomic State Transitions — Design v1

## Status and scope

Design only. This document specifies the persistence and concurrency boundary required before reconciliation can be activated. It does not add a database binding, migrations, repository implementation, worker, lease service, or runtime execution. The current v0.1 chat path remains inference-only. No deployment, Cloudflare configuration, secret, or `main` change is authorized by this design.

The repository currently has contracts and pure decision helpers, but no durable reconciliation store or atomic task-state writer. The existing `wrangler.jsonc` does not declare a D1, Durable Object, or other task-storage binding. Therefore this design does not assume that any persistence service is already provisioned.

## 1. Required invariants

1. A task has one authoritative current state and monotonically increasing integer `version`.
2. The original execution request is immutable once dispatch may have started; retries create a new request linked by `retry_of_request_id`.
3. `outcome_uncertain` is a quarantine state. No retry or transition back to execution may be committed from it.
4. A reconciliation decision may resolve the task only when the complete evidence batch passes the pure evaluator and the adapter's independent authentication boundary.
5. Evidence records and audit events are append-only. A later correction is a new record; history is never overwritten.
6. At most one live reconciliation lease may hold the current fencing generation for a task.
7. State transition, reconciliation decision record, evidence references, and audit outbox event are committed atomically.
8. Duplicate delivery is idempotent. Conflicting evidence never resolves the task optimistically.
9. Unknown provider usage/cost remains pending and bounded; it is never settled as zero.
10. Storage, lease, audit, or RBM failure leaves the task uncertain and prevents retry.

## 2. Logical persistence model

Use a transactional relational store for the authoritative task ledger. Physical storage can be selected later through a storage adapter; the current repository does not configure a database. A future Cloudflare implementation must explicitly select and configure a supported transactional primitive before code is written.

### `runtime_tasks`

- `task_id` primary key
- `state`, `version` (integer, starts at 1)
- `created_at`, `updated_at`, `deadline_at`
- `correlation_id`
- `current_request_id`
- `outcome_ref`, `reconciliation_ref`
- `pending_reservation_ref`
- `last_reason_code`

The state/version pair is the compare-and-swap boundary. A task row is never updated without checking its expected version and allowed state transition.

### `execution_requests`

- `request_id` primary key
- `task_id` foreign key
- `retry_of_request_id` nullable foreign key
- `provider_id`, `provider_operation_ref`
- `target_ref`, `operation_digest`, `idempotency_key_digest`
- `request_contract_version`, `created_at`
- immutable canonical request reference/digest

Never persist a raw idempotency key in audit/event records. If operational provider lookup requires the raw key, keep it only in a separately protected secret store with narrow access and retention; the task ledger stores its digest.

### `reconciliation_evidence`

- `evidence_record_id` primary key
- `task_id`, `request_id`, `provider_id`, `provider_operation_ref`
- `evidence_digest`, `evidence_ref`, `conclusion`
- `observed_at`, `verifier_ref`, `verified_at`, `verification_status`
- canonical record digest, schema version, `received_at`
- unique deduplication key over provider identity, operation reference and evidence digest

Keep every distinct evidence record, including contradictory records, for audit. A duplicate with the same digest and same canonical content is a no-op. Reuse of one digest for different canonical content is an integrity conflict: record a security/audit event and keep the task uncertain. A unique-key collision must not overwrite the earlier evidence.

### `reconciliation_decisions`

Append-only decision ledger:
- `decision_id` primary key
- `task_id`, `request_id`, `task_version_before`, `task_version_after`
- `conclusion`, `reason_code`, `evidence_set_digest`
- `decision_policy_version`, `decided_at`, `reconciler_ref`

This preserves exactly which evidence set and policy version produced a state transition.

### `reconciliation_leases`

- `task_id` primary key
- `lease_owner`, `lease_expires_at`
- monotonically increasing `fencing_token`
- `acquired_at`, `renewed_at`

A lease is coordination, not proof of provider outcome. Expiry permits another reconciler to continue querying; it never authorizes repeating the external side effect.

### `audit_outbox`

- `event_id` primary key
- `aggregate_id` (task ID), `aggregate_version`
- `event_type`, minimal allowlisted payload, `created_at`
- `delivery_state`, `attempt_count`, `delivered_at`

Insert the audit event in the same transaction as the state change. A separate publisher delivers outbox rows at least once; consumers deduplicate by `event_id`. The outbox prevents a committed state transition from silently losing its audit event.

### Reservation linkage

The reconciliation ledger stores only the reservation reference and pending/settlement status needed to coordinate RBM. It does not own or directly mutate RBM accounting rows. Reconciliation must not release or settle an ambiguous reservation until the authoritative outcome and measured usage are known and RBM independently accepts the settlement.

## 3. Atomic transition protocol

All steps below occur in one database transaction after provider I/O and evidence authentication have completed outside the transaction:

1. Begin transaction.
2. Lock/read the task row, or use a conditional write with `task_id`, expected `version`, and expected state `outcome_uncertain`.
3. Verify the caller's fencing token matches the current lease generation and that the lease has not expired according to the store's clock.
4. Insert the evidence records using unique deduplication keys. If exact duplicates already exist, retain the existing rows. If digest/content conflict or distinct evidence makes the batch ambiguous, append an unresolved decision/audit event and leave task state unchanged.
5. Re-evaluate the complete persisted evidence set. Do not trust a decision calculated against an incomplete or stale in-memory subset.
6. For `STILL_UNKNOWN`, append the decision and outbox event; keep task state/version and pending reservation unchanged.
7. For `CONFIRMED_APPLIED` or `CONFIRMED_NOT_APPLIED`, conditionally update task state and increment version:
   `UPDATE runtime_tasks SET state = ?, version = version + 1, reconciliation_ref = ?, updated_at = ? WHERE task_id = ? AND state = 'outcome_uncertain' AND version = ?`.
8. Require exactly one updated row. Zero rows means a concurrent writer won or the state/version changed; roll back and reload. Never retry the state write blindly with stale evidence.
9. Append the immutable decision row and corresponding audit outbox event with the resulting task version.
10. Commit.

The task update, decision record, evidence inserts, and outbox event either all commit or none commit. No external provider call, network request, notification, or RBM settlement occurs inside the database transaction.

## 4. Lease acquisition and fencing

Lease acquisition must be atomic. A candidate may acquire only if no unexpired lease exists, or renew the lease it already owns. Every acquisition increments `fencing_token`; all later writes include that token. A worker whose lease expired cannot commit even if it resumes after a pause.

Use bounded lease duration and renewal. If renewal fails, stop processing and discard the in-memory decision. A new worker may reacquire and query the provider again. The provider operation is read-only; no external side effect is replayed by lease recovery.

The lease clock must be the persistence service's trusted time source, not an untrusted client timestamp.

## 5. Crash recovery

- Crash before transaction: no task state change; another worker may retry read-only reconciliation.
- Crash during transaction: database rollback preserves the prior task state and ledger.
- Crash after commit but before notification: outbox publisher delivers the pending event later.
- Crash after provider response but before persistence: evidence may be queried again; adapter/evidence deduplication prevents duplicate effects in the ledger.
- Expired lease: a new fencing generation is issued; stale worker writes are rejected.
- Storage or audit outbox unavailable: do not resolve task, release pending reservation, or authorize retry.

## 6. Idempotency and conflict rules

- Repeated delivery of the same evidence digest and canonical content is deduplicated.
- Same digest with different canonical content is an integrity conflict and remains unresolved.
- Multiple distinct evidence records are not automatically ordered by arrival time. Unless a future provider-specific policy proves supersession semantics, the task remains uncertain.
- Repeated commit requests carry a stable decision/idempotency identifier; an already committed decision returns its recorded result rather than creating a second transition.
- Task state changes use expected-version compare-and-swap; there is no last-write-wins behavior.
- Provider status queries are read-only and bounded by policy/rate limits.

## 7. Security, retention and privacy

- Restrict store access by service identity and least privilege; executors and models receive no direct write access.
- Encrypt sensitive provider references at rest where required; keep credentials and raw idempotency keys outside the task/audit ledger.
- Store digests and references rather than full provider payloads. If evidence payload retention is required, place it in a separately access-controlled evidence vault with explicit TTL and access audit.
- Audit state transitions, lease conflicts, duplicate deliveries, digest conflicts, verifier identity, evidence-set digest and policy version.
- Define retention, deletion, backup and restore policies before production activation. Retention must preserve legal/audit requirements without retaining unnecessary personal payloads.
- Verify backups by restore tests; a backup is not considered valid until recovery has been exercised.

## 8. Acceptance criteria before implementation

1. Concurrent compare-and-swap attempts: exactly one state transition succeeds.
2. A stale fencing token cannot commit after lease expiry/reacquisition.
3. Duplicate evidence delivery does not create duplicate decisions or transitions.
4. Same digest/different content remains unresolved and emits an integrity event.
5. Contradictory distinct evidence remains `outcome_uncertain`.
6. Task transition, decision record and audit outbox insertion are atomic.
7. Outbox retry is at-least-once and consumer-idempotent.
8. Crash at each protocol boundary preserves invariants.
9. RBM reservation remains pending while outcome or usage is unknown.
10. No raw secret, raw idempotency key or unrestricted provider payload is written to audit.
11. Storage outage, lease outage or audit failure cannot resolve a task or permit retry.
12. A stale worker cannot write after another worker obtains a higher fencing token.

## 9. Implementation decision gates

Before coding the storage adapter, decide and document:
- actual persistence service and its transaction/isolation guarantees;
- migration/versioning mechanism and backup/restore process;
- lease implementation and trusted clock source;
- evidence-vault requirements and retention;
- outbox delivery mechanism and consumer deduplication;
- access-control identities and key-management boundary.

No database or Cloudflare resource is provisioned by this design. The next safe repository step is to define versioned storage record contracts and a storage-port interface with an in-memory transactional test double. A concrete Cloudflare binding and production storage implementation require a separate explicit platform decision and approval.
