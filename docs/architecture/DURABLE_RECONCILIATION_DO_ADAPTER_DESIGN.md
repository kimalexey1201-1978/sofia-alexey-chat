# SQLite-backed Durable Object Adapter — Reconciliation Design

## Status and safety boundary

Architecture specification only. No Durable Object class, namespace, binding, migration, route, alarm, or Wrangler setting is added here. No deployment or production activation is authorized. The current chat path and the in-memory test double remain unchanged.

The platform evaluation identifies a SQLite-backed Durable Object as the leading candidate because reconciliation correctness is task-scoped: one task needs a single authoritative state/version, lease generation, evidence ledger, decision ledger, and audit outbox. Cloudflare documents each Durable Object's storage as private to its instance, transactional, and strongly consistent. New namespaces should use SQLite storage.

## 1. Aggregate ownership and identity

Use one Durable Object instance per reconciliation task aggregate.

- Derive the Durable Object ID deterministically from the immutable `task_id`, using the namespace's `idFromName(taskId)` mapping.
- Never derive identity from a user-controlled display name, provider ID, request ID, or mutable attribute.
- The object owns exactly one task's authoritative task row, current lease, evidence, decisions, and audit outbox.
- The object does not own provider credentials, executor dispatch, retry scheduling, RBM accounting, or global user memory.
- Cross-task reporting is a projection/read-model concern and must not become a second authority for task state.

This partitioning makes a single task's lease and commit operations converge on one strongly consistent actor. It does not provide a global transaction across different tasks; any future cross-task workflow must use an explicit saga or coordinator.

## 2. Proposed SQL tables

All tables live in the object's embedded SQLite database.

### `schema_migrations`
- `version INTEGER PRIMARY KEY`
- `applied_at TEXT NOT NULL`
- `migration_digest TEXT NOT NULL`

Do not rely on SQLite `PRAGMA user_version`; Cloudflare documents that it is unsupported in Durable Object SQLite storage. Apply migrations during object initialization using `blockConcurrencyWhile()` only for the bounded local schema check/migration, never for provider or other network I/O.

### `runtime_task`
- `task_id TEXT PRIMARY KEY`
- `state TEXT NOT NULL CHECK (...)`
- `version INTEGER NOT NULL CHECK (version >= 1)`
- `current_request_id TEXT NOT NULL`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`
- `reconciliation_ref TEXT`
- `last_reason_code TEXT`
- `record_json TEXT NOT NULL`

The structured columns enforce compare-and-swap and common predicates. `record_json` retains contract fields not yet promoted to indexed columns; schema validation must run before insert/update. Never use `record_json` as a substitute for relational uniqueness or transition checks.

### `reconciliation_lease`
- `task_id TEXT PRIMARY KEY`
- `lease_owner TEXT`
- `lease_expires_at_ms INTEGER`
- `fencing_token INTEGER NOT NULL CHECK (fencing_token >= 0)`
- `acquired_at TEXT`
- `renewed_at TEXT`

Keep the row after release. Release clears owner/expiry but never deletes or resets `fencing_token`. The next successful acquisition increments it.

### `reconciliation_evidence`
- `evidence_digest TEXT PRIMARY KEY` (within this task aggregate)
- `task_id TEXT NOT NULL`
- `request_id TEXT NOT NULL`
- `conclusion TEXT NOT NULL`
- `canonical_record_json TEXT NOT NULL`
- `received_at TEXT NOT NULL`

The primary key deduplicates exact evidence by digest. Before treating a collision as a duplicate, compare the canonical record bytes; a digest reused for different content is an integrity conflict. Keep the task uncertain on conflict.

### `reconciliation_decisions`
- `decision_id TEXT PRIMARY KEY`
- `task_id TEXT NOT NULL`
- `request_id TEXT NOT NULL`
- `task_version_before INTEGER NOT NULL`
- `task_version_after INTEGER NOT NULL`
- `conclusion TEXT NOT NULL`
- `reason_code TEXT NOT NULL`
- `evidence_set_digest TEXT NOT NULL`
- `decision_json TEXT NOT NULL`

Append-only. Never update an existing decision.

### `audit_outbox`
- `event_id TEXT PRIMARY KEY`
- `aggregate_version INTEGER NOT NULL`
- `event_type TEXT NOT NULL`
- `payload_json TEXT NOT NULL`
- `created_at TEXT NOT NULL`
- `delivery_state TEXT NOT NULL`
- `attempt_count INTEGER NOT NULL DEFAULT 0`
- `delivered_at TEXT`

Outbox rows are append-only apart from delivery metadata. Consumers deduplicate by event ID. Provider payloads and secrets must not be copied into the audit payload.

## 3. Storage-port adapter

A Worker-side adapter will map the existing storage-port methods to a task object stub:

- `getTask(taskId)`
- `acquireLease({ taskId, owner, ttlMs })`
- `renewLease({ taskId, owner, fencingToken, ttlMs })`
- `commitDecision(input)`
- `listEvidence(taskId)`
- `listDecisions(taskId)`
- `listOutbox()`
- `releaseLease({ taskId, owner, fencingToken })`

`seedTask(task)` remains a test/setup-only operation and must not be exposed by a production route or general runtime capability.

The namespace binding and object class are not added until a separate platform approval. The object RPC surface must be private to trusted Worker-side code. It must not be reachable through the public chat route or accept arbitrary user-supplied object names.

## 4. Transaction and fencing rules

Use SQLite-backed Durable Object storage transactions for every read/modify/write sequence. For synchronous SQL-only critical sections, prefer `ctx.storage.transactionSync(callback)`; its callback must remain synchronous and must not perform network I/O, `await`, or provider calls. An exception must roll back the complete transaction.

### Acquire lease

Inside one transaction:
1. Read the current task and lease.
2. Require task state `outcome_uncertain`.
3. Read trusted current time inside the Durable Object, not from a caller-supplied `now`.
4. If a lease is unexpired, return `null`.
5. Increment the stored fencing token and set owner/expiry/acquisition timestamp.
6. Commit and return the new lease.

### Renew lease

Inside one transaction:
1. Require matching task, owner, and fencing token.
2. Require the existing lease has not expired according to the object's clock.
3. Extend expiry without changing the fencing token.
4. Otherwise return `null`.

### Commit decision

Inside one transaction, with no intervening await:
1. Read task and lease.
2. Require state `outcome_uncertain` and exact expected task version.
3. Require matching lease owner, fencing token, and unexpired lease.
4. Validate decision/request/task/version/audit bindings.
5. Validate each evidence record against task and current request.
6. Deduplicate exact evidence; reject digest/content conflicts and conclusion mismatch.
7. Insert evidence, decision, and outbox rows.
8. For terminal conclusions, update task state and increment version with a conditional update; require exactly one row changed.
9. For `STILL_UNKNOWN`, preserve state and version.
10. Commit all changes together; any failed invariant or SQL exception must leave no partial write.

The provider query and independent evidence verifier always run outside the transaction. The object never retries the original external side effect.

## 5. Trusted time and API contract adjustment

The current in-memory port accepts `now` as an argument for deterministic tests. A durable production adapter must not trust an arbitrary caller clock for lease expiry or commit acceptance.

Recommended boundary:
- production adapter omits caller-supplied `now` and the Durable Object uses its own runtime clock within the transaction;
- tests inject a clock into the storage adapter/object test harness;
- if compatibility requires retaining `now` in the public port temporarily, it is test-only and ignored by the production adapter.

This difference must be reflected in the port contract before implementation. Lease expiry is checked at the authoritative storage boundary, not by the coordinator.

## 6. Concurrency and runtime behavior

Durable Objects are single-threaded but asynchronous methods can interleave at await points. Therefore:
- keep each critical SQL transaction synchronous and free of await;
- do not use `blockConcurrencyWhile()` for routine requests or provider I/O;
- use it only for short, local constructor initialization/migration;
- persist every authoritative field in SQLite; never rely on in-memory fields surviving eviction or deployment;
- do not hold a transaction open while calling a provider, verifier, queue, or other Worker.

Object eviction or code deployment discards in-memory state. On the next request, reconstruct state from SQLite. The design must assume a fresh isolate at any time.

## 7. Outbox delivery

The outbox is authoritative and committed with the task decision. Delivery is a separate idempotent process.

A Durable Object alarm is a candidate wake-up mechanism, but alarm scheduling and crash recovery must be tested before being treated as guaranteed delivery. The publisher:
- reads pending outbox rows;
- sends events with stable event IDs;
- marks delivery only after the destination confirms acceptance;
- tolerates duplicate delivery;
- uses bounded retries and backoff;
- never changes the authoritative task conclusion.

No queue, alarm, or external publisher is provisioned by this design.

## 8. Security boundary

- Only the trusted Sofia Core Worker may address the namespace.
- No public endpoint exposes arbitrary Durable Object RPC.
- Validate all request envelopes and contract versions at the object boundary.
- Enforce task ID equality between the object's deterministic identity and every record.
- Do not store provider credentials or raw idempotency keys in SQLite.
- Do not trust provider evidence's own `VERIFIED` marker; the independent verifier remains mandatory.
- Keep audit payloads minimal and allowlisted.
- Treat a malformed request, storage error, migration error, or verifier outage as fail-closed; leave the task uncertain.

## 9. Migration and recovery

- Use monotonically versioned, immutable migration entries and a `schema_migrations` ledger.
- Make every migration idempotent and test both fresh initialization and upgrade from every supported prior schema.
- Do not rename/delete/transfer the Durable Object class casually; Cloudflare's class lifecycle configuration can have destructive data implications.
- Use SQLite-backed Durable Object point-in-time recovery as one recovery capability, not as a substitute for an independently tested backup/restore and retention policy.
- Before production, prove restore procedures, retention, access control, schema compatibility, and recovery objectives.

## 10. Required tests before adapter activation

1. Run the reusable `defineReconciliationStorageContract` suite against the Durable Object adapter.
2. Run two independent Worker stubs concurrently against the same task ID; exactly one live lease/terminal commit may win.
3. Prove stale owner/token cannot commit after expiry and reacquisition.
4. Inject failure after each SQL mutation and prove full rollback.
5. Prove same digest/same canonical content deduplicates; same digest/different content fails closed.
6. Prove duplicate decision/outbox IDs cannot partially mutate state.
7. Recreate the object instance and prove task, evidence, decision, outbox, and fencing generation persist.
8. Exercise schema migrations on fresh and upgraded test databases.
9. Simulate isolate eviction and deployment while provider lookup is in flight; stale lease must be rejected after resume.
10. Exercise outbox duplicate delivery, publisher crash, retry exhaustion, and recovery.
11. Prove the public chat route cannot access the object directly.
12. Prove no provider request or external side effect occurs inside a storage transaction.

## 11. Official platform references

- SQLite-backed Durable Object Storage and SQL transactions: https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
- Durable Object storage access, eviction, and persistence guidance: https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/
- Durable Object class lifecycle and SQLite namespace declarations: https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/
- Durable Object concurrency and transaction best practices: https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/
