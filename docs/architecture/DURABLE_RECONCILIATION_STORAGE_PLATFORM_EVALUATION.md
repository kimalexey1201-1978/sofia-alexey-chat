# Durable Reconciliation Storage — Platform Evaluation

## Status

Evaluation only; no platform is selected or provisioned. This document does not change `wrangler.jsonc`, create a Cloudflare binding or namespace, add migrations, alter secrets, deploy, or connect reconciliation to the chat route. The existing in-memory store remains test-only.

## Workload requirements

The reconciliation ledger needs:

- one authoritative task state and monotonic version;
- atomic compare-and-swap across task state, evidence, decision, and audit outbox;
- a task-scoped lease with monotonically increasing fencing tokens;
- strong consistency for a single task's state transitions;
- append-only evidence and decision history;
- bounded provider status reads outside storage transactions;
- recovery after Worker isolate eviction, restart, and deployment;
- a storage adapter that preserves the existing storage-port contract.

The current `wrangler.jsonc` declares no D1 or Durable Object binding. No existing database should be assumed.

## Candidate A — SQLite-backed Durable Objects

A SQLite-backed Durable Object provides a private SQLite database per object, strong consistency, and transactional storage. Cloudflare's current guidance recommends SQLite-backed Durable Objects for new namespaces. The object can act as the serialization/coordination authority for one task or another deliberately chosen aggregate.

**Fit**
- Strong fit for task-scoped serialization, lease fencing, and atomic per-task ledger writes.
- A task-keyed object can own the task row, evidence, decisions, lease, and outbox transactionally.
- Avoids implementing a distributed lease across multiple Workers for the same task: all commands for that task route to the same object identity.
- SQLite provides relational constraints and append-only ledger tables.

**Costs and constraints**
- Requires a Durable Object class, namespace migration, binding, routing adapter, and operational lifecycle.
- Cross-task reporting and ad-hoc global queries are less natural because each object has private storage.
- A separate reporting/indexing path may eventually be needed; it must not become a second authority for task state.
- Object identity and shard strategy must be stable and versioned.
- In-memory fields are not durable; all authoritative state must be committed to SQLite.

## Candidate B — D1

D1 is a managed relational SQLite database accessed through a Worker binding. Its batch API executes statements sequentially as a transaction and rolls back the batch if a statement fails.

**Fit**
- Strong fit for a relational task ledger with cross-task queries, reporting, and familiar schema migrations.
- A single database can hold tasks, requests, evidence, decisions, leases, and outbox rows.
- Conditional writes and transactional batches can implement compare-and-swap and atomic commit.

**Costs and constraints**
- Concurrent reconciliation workers require database-enforced lease acquisition and fencing; Worker-local locks are insufficient.
- The transaction must re-check task version, lease owner/token/expiry, and evidence binding inside the same atomic batch.
- D1 is not colocated with Worker compute in the same way as a Durable Object's embedded SQLite store.
- Database size, throughput, query limits, and sharding strategy must be validated against expected workload.

## Candidate C — Workers KV / R2 / Queues alone

These are not suitable as the authoritative reconciliation ledger:
- KV does not provide the relational multi-record transaction boundary required here.
- R2 is object storage, not the task-state transactional database.
- Queues provides message delivery, not the authoritative task-state compare-and-swap ledger.

They may have supporting roles later (for example, an outbox delivery queue or separately protected evidence payload storage), but cannot replace the transactional store.

## Provisional engineering recommendation

For the current reconciliation workload, evaluate **one SQLite-backed Durable Object per task aggregate** as the leading candidate. The core reason is that correctness is dominated by task-scoped serialization, fencing, and atomic per-task commits—not by global ad-hoc SQL queries. It gives each task one strongly consistent authority and maps naturally to the existing task-scoped storage port.

Keep **D1 as the alternative** if product requirements establish that cross-task relational querying, centralized reporting, or simpler global administration outweigh the value of per-task actor serialization. D1 can satisfy the atomicity requirement only when all relevant checks and writes are enforced in one database transaction/batch.

This is a recommendation for a future implementation review, not an approved platform selection. No binding, namespace, migration, schema, or production adapter should be created until the platform choice, account availability, cost, retention, backup/restore, and deployment implications are explicitly reviewed and approved.

## Required proof before implementation

1. Run the same storage-port contract suite against the selected durable adapter and the in-memory test double.
2. Prove two independent Worker requests cannot commit conflicting decisions for one task.
3. Prove stale fencing tokens are rejected after lease expiry and reacquisition.
4. Prove task, evidence, decision, and outbox writes are all-or-nothing under injected failures.
5. Prove exact duplicate evidence is idempotent and digest/content conflicts remain unresolved.
6. Prove restart, isolate eviction, and deployment do not lose committed state or reset fencing generations.
7. Define migrations, schema compatibility, backup/restore, retention, access control, and recovery procedures.
8. Keep provider I/O outside database transactions and keep retry dispatch disabled until separately approved.

## Official platform references

- Cloudflare SQLite-backed Durable Object storage: https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
- Cloudflare storage product selection: https://developers.cloudflare.com/workers/platform/storage-options/
- Cloudflare database connectivity and D1 vs Durable Objects: https://developers.cloudflare.com/workers/databases/connecting-to-databases/
- Cloudflare D1 database API and batch transactions: https://developers.cloudflare.com/d1/worker-api/d1-database/
