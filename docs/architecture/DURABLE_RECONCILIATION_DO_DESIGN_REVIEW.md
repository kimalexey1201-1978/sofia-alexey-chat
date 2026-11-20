# Durable Object Design Review — Open Boundaries and Corrections

## Status

Review of `DURABLE_RECONCILIATION_DO_ADAPTER_DESIGN.md`. This is a design clarification only; no runtime code, namespace, binding, migration, alarm, queue, or deployment configuration is changed.

## 1. Outbox scope must remain task-local

The proposed one-Durable-Object-per-task partition means each object's SQL database contains only that task's outbox rows. Therefore the object method currently listed as `listOutbox()` is an aggregate-local query, not a global outbox scan.

Required semantics:
- the object method is `listPendingOutbox({ limit, cursor })` and returns only this task's pending rows;
- cursor ordering is stable, e.g. `created_at, event_id`;
- an object-local alarm may wake that task's publisher, or a future external queue may receive a wake-up signal;
- global audit search and reporting belong to a separate projection/read model, not a scan across every task object;
- the global projection is not authoritative for task state and must be rebuildable from task-local committed events.

Do not implement a Worker adapter that pretends one task object can enumerate every task's outbox.

## 2. Per-task alarms versus a central queue

A per-task alarm keeps the delivery loop close to its authoritative outbox, but creates one scheduled wake-up lifecycle per active task. A central queue can improve batching and throughput but introduces another delivery component and its own idempotency/recovery requirements.

Decision remains open until expected task volume, delivery latency, and cost are known. For the first durable adapter, keep the outbox rows and idempotent publisher contract, but do not provision alarms or queues. A later implementation decision must compare:
- number of active task aggregates;
- event volume and acceptable delivery latency;
- retry/backoff behavior and poison-event handling;
- duplicate delivery and publisher crash recovery;
- Cloudflare storage, alarm, and queue costs.

## 3. Aggregate size and retention controls

One object per task simplifies atomicity but does not justify unbounded per-task growth. Before production activation, define:
- maximum evidence records and maximum canonical evidence bytes per task;
- maximum decision and outbox rows per task;
- bounded pagination for evidence, decisions, and outbox reads;
- retention and archival rules for delivered outbox events;
- a policy for long-running tasks with repeated `STILL_UNKNOWN` evidence;
- an explicit behavior when a quota is reached: fail closed, preserve existing ledger data, and raise an operational alert.

Do not delete evidence needed to support a terminal decision. Any archival mechanism must preserve integrity verification and be tested for restoration.

## 4. SQL constraints and index review

The adapter implementation should add explicit indexes for its actual query paths, at minimum:
- pending outbox lookup ordered by `created_at, event_id`;
- task-local evidence lookup by `request_id`;
- task-local decision lookup ordered by `task_version_after` or `decided_at`.

Use unique constraints for decision IDs and outbox event IDs. Use task-local composite keys or include `task_id` in the key if any future implementation shares a database across aggregates. Since the current design assigns one database per task, every object method must still assert that the row's `task_id` matches its deterministic object identity.

Schema constraints should enforce legal task states and legal reconciliation conclusions, not only rely on JavaScript validation.

## 5. Lease release representation

The in-memory test double deletes the current lease object but retains a separate generation counter. The durable design should instead retain the lease row and clear owner/expiry on release while preserving the fencing token. This is a valid implementation difference as long as the storage-port contract guarantees:
- a released or expired lease can never be reused;
- each new successful acquisition increments the generation;
- stale owner/token pairs are rejected;
- release is idempotent only for the exact current owner/token and never clears a newer lease.

The durable contract suite must prove these invariants across object recreation.

## 6. Trusted clock and test contract

The current test-double port accepts a caller-provided `now`. Production lease expiry must be evaluated at the authoritative Durable Object boundary using the object's runtime clock. The production adapter must ignore or reject a caller-provided time field. Tests should inject a clock through the adapter's test harness, not through an untrusted RPC payload.

This is a deliberate storage-port contract difference and must be resolved before implementing the production adapter.

## 7. Platform facts rechecked

Cloudflare's current documentation confirms:
- each Durable Object has private, transactional, strongly consistent storage;
- new Durable Object namespaces should use SQLite storage;
- SQL operations are synchronous and `transactionSync()` is available for synchronous SQL-only critical sections;
- `blockConcurrencyWhile()` is appropriate for bounded constructor initialization/migrations, not routine request processing;
- `PRAGMA user_version` is unsupported, so schema versions need an application-managed migration table;
- object in-memory state can be discarded on eviction or code update, so authoritative state must live in storage.

Official references:
- https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
- https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/
- https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/
- https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/

## 8. Go/no-go gates before implementation

Do not add the Durable Object class or binding until all are true:
1. Cloudflare production build triggers and the actual failure reason from the prior failed build checks have been reviewed.
2. The deployment boundary ensures a branch push cannot unexpectedly replace production.
3. The storage-port contract has an explicit task-local outbox API and trusted-time semantics.
4. Expected aggregate size, retention, and delivery architecture are bounded.
5. The adapter test harness can recreate an object and verify task, lease generation, evidence, decision, and outbox persistence.
6. Failure injection proves rollback after every write in a terminal decision transaction.

Until then, documentation and isolated test-contract work only.
