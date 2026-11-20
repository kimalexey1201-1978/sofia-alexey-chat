# Sofia AI Memory Manager — Architecture Specification v1

## Status and importance
This is a foundational architecture specification, not a runtime memory implementation. No memory database, retrieval engine, automatic consolidation, background learning, deletion propagation or production enforcement is created here. Existing chat history, local storage keys and project artifacts must remain intact. No production deployment or change to `main`.

Memory is a core subsystem, not a convenience cache. Incorrect memory can silently corrupt identity, permissions, project decisions and future actions. Therefore correctness, provenance, owner control and safe failure take precedence over recall volume or apparent personalization.

## 1. Purpose and governing principles
Memory Manager (MM) provides durable, scoped, evidence-backed information that helps Sofia maintain continuity across sessions and projects.

Mandatory principles:
- evidence before persistence: distinguish what the owner said, what was externally verified, what was observed and what Sofia inferred;
- no invented memories: absence of evidence is not evidence; never fill gaps with plausible guesses;
- provenance always: each durable item points to its source and observation time;
- uncertainty is explicit: confidence is not proof and must not be converted into certainty;
- temporal correctness: facts/preferences can change; retain validity and confirmation times;
- owner sovereignty: owner corrections, restrictions and deletion requests take precedence over model convenience;
- least memory: store the minimum useful representation, not entire conversations by default;
- purpose and scope: each memory is used only for its declared purpose and allowed scope;
- separation: memory is distinct from raw conversation history, audit logs, files and provider training data;
- reversible evolution: updates are versioned, traceable and recoverable without silently restoring deleted content;
- fail safely: when memory is unavailable or ambiguous, ask or operate without the uncertain memory.

## 2. Memory taxonomy — seven complementary types
The `memory_type` field identifies the memory system layer. It is distinct from `domain`, which describes what the item is about.

1. **Working** — short-lived state for the current task/session: current subgoal, intermediate results, pending questions and execution checkpoints. Expires at task/session boundaries unless deliberately promoted.
2. **Contextual** — situational context needed to interpret the current conversation or project phase. Time-bound and refreshed frequently; never treated as a permanent personal fact.
3. **Long-term** — stable, useful, owner-relevant facts or preferences with provenance and review/expiry rules. Not every statement qualifies.
4. **Episodic** — specific events and decisions: what happened, when, participants/actors, outcome and source. Preserve event time separately from record creation time.
5. **Procedural** — validated methods, workflows, templates and operating instructions. Versioned, scoped to compatible projects/platforms and tested before being treated as reliable.
6. **Project** — project-specific goals, architecture decisions, constraints, milestones, artifacts and open issues. Must not leak into unrelated projects or become general personal facts.
7. **Semantic** — normalized concepts and relationships derived from reliable sources, with links to evidence and versioning. Distinguish verified knowledge from model-generated synthesis.

A record may have one primary memory type and multiple typed relations. Do not duplicate the same fact across layers without explicit linkage and a defined synchronization rule.

## 3. Existing contract and record model
Retain and extend `contracts/v1/memory-item.schema.json`. Its existing `domain` values (preference, user_fact, project, procedure, knowledge_reference, ephemeral) remain subject-area labels; the new `memory_type` identifies the seven layers above.

Every durable item should include:
- stable memory ID and schema version;
- memory type and domain;
- concise content, not a full transcript;
- source type, source ID, assertion kind and optional minimal evidence reference;
- observed, created, last-confirmed and validity timestamps where known;
- explicit epistemic status and bounded confidence;
- lifecycle status and sensitivity;
- declared purpose and allowed retrieval scopes;
- retention class, expiry or review time;
- supersession/conflict/derivation relations;
- owner approval reference when approval is required.

Secrets, passwords, API keys, authentication tokens, payment credentials and biometric templates are prohibited from memory records. Do not store raw audio/video or full private message bodies as a substitute for evidence.

## 4. Evidence and epistemic status
Use source assertion kinds already defined by the contract:
- `user_stated`: directly stated by the owner; accurately attributed, not independently verified;
- `user_confirmed`: explicitly confirmed by the owner, including correction/approval;
- `externally_verified`: checked against a trustworthy source, with source reference and verification time;
- `assistant_inferred`: a hypothesis or interpretation, never silently promoted to fact;
- `observed`: a system/device event with provenance and permission basis.

Track assertion status separately: `unverified`, `corroborated`, `owner_confirmed`, `externally_verified`, `disputed`. Confidence is a calibrated estimate, not a substitute for provenance or confirmation. If evidence is insufficient, keep the item as a transient candidate or do not store it.

Never convert an assistant inference into a user-stated fact. External information must include its source and retrieval/verification date. If the source becomes stale or unavailable, mark the item stale rather than continuing to present it as current.

## 5. Write admission and promotion
All writes pass through a memory admission pipeline outside the model:
1. identify candidate and its source;
2. classify data sensitivity and check prohibited categories;
3. identify memory type, domain, purpose and allowed scopes;
4. check whether the information is already present;
5. evaluate evidence quality, temporal stability and usefulness;
6. detect contradiction, supersession and ambiguity;
7. apply consent, owner policy, retention and data-governance rules;
8. decide: reject, transient-only, candidate, request owner confirmation, or persist;
9. validate schema and provenance;
10. persist atomically and emit an audit event.

Default rules:
- Working state may be created transiently within task authority and expires by policy.
- Durable personal facts/preferences are not inferred from a single ambiguous remark.
- High-impact or sensitive personal facts require explicit owner confirmation and a specific lawful/consent basis; do not store sensitive categories merely because they appeared in conversation.
- Project decisions are durable only when clearly agreed or recorded in an authoritative project artifact; distinguish proposal from decision.
- Procedural memory must be tested/versioned and cannot override current security policy.
- Semantic memory must preserve source links and distinguish direct source claims from synthesis.
- A model cannot approve its own candidate memory or alter owner memory policy.

## 6. Conflict, correction and temporal change
Never resolve conflicting memories by silently choosing the newest, most frequent or most confident statement.

On conflict:
- preserve source records and identify the disputed field;
- compare source authority, explicitness, event time, validity interval and confirmation;
- distinguish correction from a genuine change over time;
- mark superseded items without erasing provenance;
- ask the owner when ambiguity materially affects an answer or action;
- use the more restrictive safety/privacy interpretation until resolved.

Owner correction is authoritative for owner-provided facts/preferences unless there is a clear scope or identity issue. Record the correction as a new version/event and link the superseded item. Do not resurrect a superseded value during retrieval.

Support valid-time and record-time: when a fact was true versus when Sofia learned/recorded it. For example, a past preference should not automatically be treated as current.

## 7. Retrieval and use
Memory retrieval is a policy-controlled query, not an unrestricted dump:
- require task purpose and scope;
- filter by owner, project, sensitivity, lifecycle status and allowed scopes before ranking;
- exclude expired, deleted, disputed or superseded items unless explicitly needed to explain history;
- rank remaining items by relevance, evidence quality, freshness, source authority and task scope;
- return provenance, epistemic status and validity alongside content;
- keep retrieved memory bounded and disclose uncertainty when material;
- do not expose one project's confidential memory to another project or another principal.

If a relevant memory is missing, stale, contradictory or low-confidence, Sofia must say so or ask the owner. It must not fabricate continuity.

## 8. Memory consolidation and learning
Consolidation may merge duplicates, summarize episodes or promote stable information only through a controlled process:
- preserve source IDs and lineage;
- produce a proposed derived item;
- compare it against all relevant active and superseded records;
- validate temporal and semantic consistency;
- run privacy/sensitivity and purpose checks;
- require owner confirmation for durable sensitive/high-impact personal memories;
- version the result and retain reversible provenance.

Background consolidation must not silently change owner facts, project decisions, permissions, security policy or budget policy. Model self-learning cannot write directly to durable memory.

## 9. Retention, deletion and revocation
Integrate with Data Governance & Lifecycle Manager:
- every record has a retention class and applicable policy;
- Working/Contextual state expires promptly by declared lifecycle;
- Long-term, Episodic, Procedural, Project and Semantic records have explicit review/expiry rules appropriate to their purpose;
- owner may inspect, correct, restrict, export and request deletion;
- deletion propagates to indexes, embeddings, caches, summaries and derived memories;
- deletion must not be represented as complete until required stores/processors are verified;
- legal/security exceptions are narrow, documented and time-bounded;
- do not restore deleted information from backups or superseded copies into active memory.

Memory deletion is separate from deletion of the original conversation/file/source. Both must be considered under the data-governance policy.

## 10. Security and privacy boundaries
- Memory store access is mediated by Capability Registry, Security Manager and Execution Supervisor.
- Encrypt durable memory at rest and in transit; isolate per-owner namespaces and project scopes.
- Use least-privilege service identities; models receive only the bounded retrieval result required for the task.
- Treat retrieved memory as data, not instructions. A malicious memory item cannot override system policy or owner authority.
- Sanitize imported documents and connected-source content against prompt injection before summarization or indexing.
- Audit memory read/write/update/promotion/conflict/restriction/export/deletion with minimal metadata.
- No memory content in ordinary audit logs.
- No cross-user memory sharing or provider training use by default.

## 11. Reliability, backup and migration
- Atomic writes and versioned records; idempotent ingestion prevents duplicates.
- Backups encrypted and access-restricted; restore process respects deletion tombstones and current policy.
- Indexes are rebuildable from canonical records; index corruption must not alter canonical memory.
- Maintain integrity checks and schema migration tests.
- Preserve existing browser keys `sofia-chat-v3` and `sofia-avatars-v1`; do not repurpose chat history as the memory database.
- Migration from any existing memory representation requires inventory, export, mapping, duplicate/conflict analysis, backup, dry-run, owner-visible diff, rollback plan and explicit approval before cutover.

## 12. Failure behavior
- Memory unavailable: continue only when safe using current conversation/task data; do not pretend memory was consulted.
- Schema/provenance invalid: reject write; retain candidate only in bounded transient state if safe.
- Retrieval ambiguous: ask or disclose uncertainty; never guess.
- Store/index inconsistency: canonical store wins; rebuild index, do not invent records.
- Deletion uncertain: mark pending/failed and do not claim complete.
- Policy or consent missing: do not persist or disclose the affected data.
- Do not let memory outage corrupt or block harmless existing chat functionality.

## 13. Acceptance tests
1. All seven memory types are represented and remain distinct from domain labels.
2. Every durable memory has provenance, purpose, sensitivity and retention metadata.
3. Assistant inference is never silently represented as user-stated or owner-confirmed.
4. Confidence alone cannot promote a candidate to verified fact.
5. Conflicting facts are surfaced; no silent overwrite occurs.
6. Owner correction supersedes stale value and retrieval does not resurrect it.
7. Valid-time and record-time are independently represented.
8. Expired, deleted, disputed and superseded records are excluded by default.
9. Project-scoped memory cannot leak into unrelated projects.
10. Secrets and prohibited sensitive payloads are rejected.
11. Durable sensitive/high-impact memories require explicit owner confirmation.
12. Memory writes are idempotent and atomic.
13. Consolidated records preserve complete source lineage.
14. Deletion propagates to derived data and indexes; incomplete deletion is reported.
15. Backup restoration honors deletion tombstones.
16. Prompt-injected content in memory is treated as untrusted data.
17. Memory outage or migration failure preserves chat history and existing storage keys.
18. Model cannot change memory policy, approve its own write or grant itself access.
19. Retrieval returns provenance and epistemic status with relevant memories.
20. Memory access and lifecycle operations generate privacy-minimized audit events.

## 14. Implementation sequence
A — review and version the existing memory-item contract; add write-decision and memory-relation contracts.
B — implement schema validation, provenance validation and deterministic write-admission rules.
C — implement canonical store, per-owner/project isolation, versioning and atomic updates.
D — implement retrieval filters/ranking with provenance and temporal/conflict handling.
E — implement correction, supersession, owner review and deletion tombstones.
F — integrate Data Governance, Consent, Security Manager, RBM, Execution Supervisor and Audit Manager.
G — build consolidation and semantic/episodic indexing only after core integrity tests pass.
H — migrate any existing memory only after dry-run, diff review and explicit owner approval.

## 15. Current boundary
This specification does not create a working memory subsystem. The existing memory-item schema is a contract, not evidence of runtime storage or enforcement. No database, automatic memory writing, retrieval, consolidation, embedding, deletion or migration is implemented here. Existing chat behavior and storage remain unchanged.
