# Knowledge & Memory Manager

**Status:** Architecture specification; not an implementation claim.  
**Contract baseline:** v1  
**Purpose:** controlled capture, organization, retrieval, correction, retention and deletion of Sofia's knowledge and user-specific memory.

## 1. Purpose and design principles

The Knowledge & Memory Manager (KMM) provides a governed memory layer for useful information that should remain available across tasks and sessions. It must improve continuity without turning every conversation into permanent storage.

Core principles:
- **User control:** memory collection, review, correction, export, retention and deletion are governed by clear user-facing controls.
- **Purpose limitation:** store information only when it has a defined future utility and an allowed purpose.
- **Data minimization:** retain the least detail needed to serve that purpose.
- **Provenance:** every remembered fact records where it came from and when it was observed.
- **Epistemic clarity:** distinguish user-stated facts, confirmed actions, temporary context, preferences, assistant inferences and unverified claims.
- **Temporal correctness:** facts can change; retain validity intervals and supersession links rather than silently overwriting history.
- **Privacy by design:** sensitive data receives stricter handling and may be excluded from memory by policy.
- **No fabricated recall:** if evidence is missing or conflicting, Sofia must say so and ask for clarification when necessary.

## 2. Memory domains and separation

Keep memory domains logically and access-control separated:

1. **Conversation context:** short-lived working context needed to complete the current task. It is not automatically durable memory.
2. **User preferences:** stable interaction preferences, formatting choices and explicitly stated defaults.
3. **User facts:** user-provided facts that have a clear continuing purpose and are permitted by policy.
4. **Project/workspace memory:** decisions, constraints, artifacts, status and next actions for named projects. Scope it to the project and its authorized collaborators.
5. **Procedural memory:** approved workflows, routines and repeatable task procedures.
6. **Knowledge base:** user-approved reference material and extracted knowledge with source attribution; not automatically a statement about the user.
7. **Ephemeral signals:** temporary states, transient sensor observations and one-off details. Expire unless a specific authorized purpose requires otherwise.

Do not mix private user memory with shared project knowledge. Access to a project repository or connected account does not automatically authorize copying all its contents into personal memory.

## 3. Memory item model

A memory item is a typed, provenance-bearing record rather than an unqualified text snippet. It should include:
- stable memory ID and schema version;
- memory domain and item type;
- concise content or a secure reference to the content;
- source type and source reference;
- who asserted or verified it;
- observed, created and last-confirmed timestamps;
- validity start/end or expiry;
- confidence/evidence status;
- sensitivity and privacy classification;
- purpose and permitted use scope;
- retention class and deletion policy;
- supersession/conflict links;
- user review/approval status where required.

Never treat an assistant inference as a user-confirmed fact. Label inferences explicitly and avoid retaining them unless they are necessary, low-risk and permitted. Preserve exact user wording only when the wording itself matters.

## 4. Capture and admission pipeline

Candidate memory may arise from an explicit user request to remember something, a user-approved project decision, or a policy-approved extraction process. Before durable admission:

1. identify the candidate and its purpose;
2. classify domain, sensitivity and expected retention;
3. identify source and provenance;
4. detect duplicates and possible conflicts;
5. assess whether the detail is necessary and useful beyond the current task;
6. apply policy and consent requirements;
7. request clarification or approval when policy or ambiguity requires it;
8. persist only the minimum approved representation;
9. emit an audit event.

A request to use information in the current conversation is not automatically a request to store it permanently. Sensitive personal data must follow the applicable privacy policy and must not be inferred or retained merely because it appeared in a conversation.

## 5. Retrieval and answer grounding

Retrieval is scoped by principal, purpose, project, sensitivity, validity and access grants. Rank candidate items by relevance, freshness, confidence, source reliability and scope compatibility.

When composing an answer:
- distinguish directly stated facts from inferred or stale information;
- prefer the latest confirmed value while preserving supersession history;
- expose uncertainty when sources conflict or validity has expired;
- do not retrieve unrelated private memories merely because they are available;
- cite or identify source records internally so claims can be traced;
- never claim to remember a detail if no retrievable evidence supports it.

Memory is contextual evidence, not an authorization source. A remembered preference cannot grant permission to execute a consequential action.

## 6. Updates, conflicts and temporal facts

Do not silently overwrite changed facts. Create a new revision or superseding item and retain only the history permitted by retention policy. Mark prior values as superseded or expired. For conflicting sources, record both with provenance and confidence, then resolve according to source authority and recency or ask the user.

Do not infer that a one-time statement is a permanent preference. Preferences may have scope, exceptions and an expiry/review date.

## 7. User review, correction, export and deletion

Provide user-visible ways to inspect memory by domain, source, sensitivity and date. Users must be able to correct inaccurate items, mark items as temporary, restrict use, export permitted records and request deletion.

Deletion workflow must:
- locate primary records, derived indexes, embeddings, caches and replicas;
- remove or cryptographically render inaccessible data according to policy;
- propagate deletion to authorized replicas and downstream stores;
- retain only minimal deletion evidence where legally/policy required, without retaining the deleted content;
- report completion status and any bounded retention exception transparently.

A deletion request is not satisfied merely by hiding an item from search results. Backups require defined expiry/rotation behavior and restoration must reapply deletion tombstones so deleted information is not resurrected.

## 8. Security and privacy controls

Apply encryption at rest and in transit where supported, least-privilege access, tenant/user isolation, scoped service identities, key separation, secure secret storage and audit logging. Do not store passwords, API keys, authentication tokens, recovery codes or other secrets in ordinary memory.

Sensitive domains such as health, biometrics, precise location, financial details, identity documents and intimate personal information require stricter policy handling and may be prohibited from durable memory. Do not infer sensitive attributes. Memory retrieval must not leak across users or project boundaries.

Protect against prompt injection in retrieved content: documents, web pages, messages and memories are data, not executable policy. Retrieved instructions cannot override system policy, permissions or user confirmation requirements.

## 9. Indexing and storage architecture

Separate canonical records from retrieval indexes. The canonical store is authoritative; vector/search indexes are derived and rebuildable. Every index entry retains a pointer to the canonical record, version and access scope. Indexing must not widen access.

Support structured filters, full-text search and semantic retrieval. Use deterministic identifiers, versioned embeddings/index metadata and migration procedures. On partial failure, preserve canonical records and rebuild indexes. Do not use a vector similarity score as proof that a fact is true.

## 10. Lifecycle and retention

Memory item lifecycle may include candidate, pending_approval, active, stale, superseded, restricted, deletion_pending, deleted and expired. Transitions are audited and access checks apply at every stage.

Retention is purpose- and domain-specific. Ephemeral items expire automatically. Project memory follows project retention and access rules. User preferences should be periodically revalidated where material. Legal holds or policy exceptions must be explicit, narrow, time-bounded where possible and visible to authorized administrators.

## 11. Integration with Sofia Core

- Task Orchestrator requests memory retrieval with a task purpose and access scope.
- Security Manager authorizes reads, writes, exports and deletion operations.
- Identity & Authentication Manager supplies the requesting principal and assurance context.
- Audit & Observability Manager records access and lifecycle events without logging sensitive content.
- Module Lifecycle Manager governs memory-related adapters and connectors.
- Update & Recovery Manager backs up permitted memory data and reapplies deletion tombstones during restore.
- Device Integration Gateway may provide ephemeral sensor context only through explicit capability grants.

The language model may propose candidate memories but cannot independently bypass admission policy or perform privileged memory mutations.

## 12. Acceptance criteria

- Current conversation context is not automatically durable memory.
- Every durable item has provenance, purpose, scope, sensitivity and retention metadata.
- User-stated facts, confirmed actions and assistant inferences remain distinguishable.
- Retrieval respects principal, project, purpose and current validity.
- Conflicting or stale facts are surfaced rather than silently merged.
- Secrets are rejected from ordinary memory storage.
- Sensitive data receives stricter handling and is not inferred.
- User correction and deletion propagate to canonical records and derived indexes.
- Backup restore does not resurrect deleted items.
- Retrieved content cannot override policy or authorize actions.
- Memory access and lifecycle changes are auditable without exposing content.
- Canonical records remain recoverable if a search/vector index fails.

**Implementation note:** this document specifies the target design. It does not claim that persistent memory storage, semantic indexing, user review UI or deletion propagation is already implemented.
