# Sofia AI Memory Integrity & Verification Layer — Architecture Specification v1

## Status and boundary
Architecture specification only. No verifier service, cryptographic signing, memory database, retrieval enforcement, tamper-proof storage or automatic correction is implemented by this document. It does not modify production, `main`, existing chat history or browser storage keys.

This layer is mandatory before durable memory writes and before high-impact memory is used to justify an action. It is independent of the language model that proposes or consumes memories.

## 1. Mission and threat model
The Memory Integrity & Verification Layer (MIVL) protects the memory system against:
- fabricated or misattributed memories;
- inference silently promoted to owner-confirmed fact;
- stale or temporally invalid facts;
- contradictory or duplicated records;
- tampering, truncation, replay and unauthorized mutation;
- prompt injection embedded in source documents or memory text;
- incorrect consolidation, summaries or derived memories;
- retrieval of superseded, deleted, disputed or out-of-scope records;
- model/provider substitution that changes memory interpretation;
- false claims that a memory was checked when no evidence was inspected.

Threats include accidental model error, faulty adapters, malicious or compromised modules, malicious source content, compromised storage/indexes and concurrent updates. A cryptographic digest can detect byte changes relative to a trusted digest, but cannot prove that the original claim was true.

## 2. Architectural position and separation of duties
MIVL sits between Memory Manager and the canonical memory store, and also provides a verification gate on retrieval:
- Memory Manager proposes candidate writes and retrieval requests.
- MIVL validates provenance, schema, epistemic status, temporal consistency, relations, scope and integrity.
- Data Governance enforces purpose, sensitivity, retention, consent and deletion.
- Security Manager authorizes protected reads/writes and sensitive use.
- Capability Registry grants narrow access to memory operations.
- Execution Supervisor mediates storage/index adapters and external effects.
- Audit Manager records minimal verification decisions and anomalies.
- Independent source adapters resolve evidence references under the appropriate permissions.

The proposing model, memory record author, and consuming model are not trusted verifiers of their own claims. A verifier must be independently identified, versioned and auditable. Model-based cross-checking may assist but cannot alone promote a claim to verified or owner-confirmed.

## 3. Verification stages
### 3.1 Admission verification (before persistence)
1. Validate schema and reject unknown fields.
2. Validate source reference and source type against an authorized source adapter.
3. Verify attribution: who said/did what, and whether the source actually supports the claim.
4. Check assertion-kind consistency. For example, `user_confirmed` requires an explicit owner confirmation event; assistant inference cannot be marked as user-stated.
5. Check time semantics: observed time, record time, valid-from and valid-until; reject impossible or contradictory intervals.
6. Check sensitivity, prohibited data, purpose, scope, consent and retention policy.
7. Detect duplicates, conflicts, supersession loops and invalid relation targets.
8. Verify derived-memory lineage and transformation version.
9. Assign a decision: accept, candidate, require owner confirmation, transient only, or reject.
10. Persist atomically only after all required gates pass.

### 3.2 Integrity verification (stored record)
- Recompute canonical serialization and digest of the record payload.
- Compare with a digest stored in a separately protected integrity manifest.
- Verify signature/checkpoint when available, including key identity and validity.
- Check monotonically increasing record version and append-only mutation history.
- Detect rollback/replay, missing sequence numbers, duplicate IDs and orphaned relation targets.
- Verify deletion tombstones and ensure deleted/superseded records are not reactivated by restore or index rebuild.
- Reconcile canonical records with indexes and derived artifacts; canonical record is authoritative.

Hash chains and signatures provide tamper evidence only when keys/checkpoints and the trusted baseline are protected independently. They do not establish truth, source authenticity or completeness by themselves.

### 3.3 Retrieval verification (before use)
- Apply owner, project, purpose, sensitivity, allowed-scope and authorization filters before semantic ranking.
- Exclude deleted, expired, restricted, disputed and superseded records by default.
- Revalidate provenance, validity interval, retention and integrity for the selected record.
- Return source type, assertion status, confidence, observed/confirmed time and relevant conflict/supersession references with the memory.
- If material evidence is missing, stale, invalid or unavailable, mark unverified and do not present as a fact.
- For consequential decisions, require corroboration or fresh external verification; never rely on a memory record alone for authorization, financial instruction, legal/medical conclusions or irreversible actions.

## 4. Evidence hierarchy and claim matching
Evidence strength is purpose-specific; there is no universal source ranking. Apply these rules:
- An explicit owner correction/confirmation is authoritative for the owner's own stated preference or personal fact, subject to identity/session assurance and scope.
- A project artifact is authoritative only for the version and status it represents; distinguish proposal, draft, accepted decision and deployed state.
- External facts require a traceable source, retrieval time and freshness policy. Prefer primary sources for claims about current external state.
- System-observed events require a trusted adapter, permission basis, timestamp and device/source identity.
- Assistant inference is a hypothesis. It can be retained only as an inference candidate with explicit uncertainty and cannot satisfy an owner-confirmed requirement.

Verifier checks whether the cited evidence entails or supports the exact claim, not merely whether it discusses a similar topic. If evidence supports only part of a statement, split the claim or downgrade/reject the unsupported portion.

## 5. Confidence and epistemic state
Confidence is a calibrated estimate of support, not a truth probability unless validated as such. Never set a numeric threshold as a substitute for evidence. The verifier returns a categorical verdict:
- `VERIFIED`: required evidence and deterministic checks support the claim for the specified purpose/time;
- `SUPPORTED_WITH_LIMITATIONS`: evidence supports a narrower or time-bounded claim;
- `UNVERIFIED`: evidence is missing, inaccessible or insufficient;
- `CONTRADICTED`: credible evidence conflicts with the claim;
- `TAMPERED`: integrity check failed or unauthorized mutation is indicated;
- `REJECTED`: prohibited, malformed, misattributed or policy-incompatible item.

Owner-confirmed and externally-verified are different bases; one must not be substituted for the other. A verified record may become stale later and must then be rechecked.

## 6. Contradiction and temporal resolution
Do not resolve conflicts by recency, frequency, model confidence or majority vote alone.
- Compare source authority, explicitness, scope, event time, valid interval and provenance.
- Determine whether the difference is a correction, a changed fact over time, different contexts, or a genuine unresolved contradiction.
- Preserve prior versions and link supersession; do not overwrite evidence.
- Reject relation cycles such as A supersedes B while B supersedes A.
- If a conflict changes a material answer or action, ask the owner or obtain fresh authoritative evidence.
- Until resolved, do not use the disputed claim as a settled fact; apply the more restrictive safety interpretation.

## 7. Derived memories and consolidation
A summary, embedding, entity, preference profile or semantic relation is a new derived artifact with:
- parent memory/source IDs;
- transformation algorithm/model and version;
- creation time and purpose;
- exact scope of source material used;
- verification status and limitations.

Derived content must not claim greater certainty than its sources. Conflicting source records must remain represented. If a source is corrected, restricted or deleted, invalidate/recompute dependent artifacts and indexes. Do not allow a summary to survive as an untraceable copy of deleted personal data.

## 8. Integrity manifest and cryptographic controls
For each canonical record version, maintain a protected manifest containing record ID/version, canonicalization version, digest algorithm, digest, previous manifest digest or checkpoint reference, signer/key ID where signatures are used, and creation time.
- Use a modern collision-resistant digest such as SHA-256 or stronger approved algorithm.
- Sign checkpoints with keys held outside the memory database and inaccessible to models/modules.
- Rotate keys and preserve verification metadata needed for historical validation.
- Protect manifests/checkpoints with append-only or independently controlled storage.
- Do not store secrets or signing keys in memory records.
- A digest of low-entropy personal content can leak information; use opaque IDs and avoid publishing raw content hashes.
- Integrity failure quarantines the affected record and dependent index entries; it must not be silently repaired from an untrusted copy.

## 9. Independent verifier design
The first verifier should be deterministic and rule-based:
- JSON Schema validation;
- source-reference resolution;
- source-to-claim attribution checks;
- assertion-kind consistency;
- time and lifecycle checks;
- scope/purpose/retention checks;
- relation graph checks;
- digest/signature/version checks;
- duplicate/conflict detection.

A second model may provide semantic entailment analysis as an advisory signal. It must identify the exact evidence spans/refs and limitations; it cannot sign, approve, declassify, override deterministic failure or change owner confirmation status. Critical claims require authoritative source or owner confirmation, not majority vote among models.

## 10. Owner review and correction
Expose a human-readable explanation of why a memory was accepted, kept as candidate, marked stale, disputed or rejected. Owner correction creates a new attributed event/version; preserve prior evidence as superseded or disputed according to policy. The owner can request restriction or deletion under Data Governance. Do not force the owner to resolve every low-impact uncertainty; omit or qualify uncertain memory instead.

## 11. Failure and quarantine behavior
- Missing evidence or verifier outage: no durable promotion; candidate/transient only where policy permits.
- Integrity mismatch: quarantine record and dependent indexes; block use as fact; alert and audit.
- Source adapter unavailable: do not claim source verification; mark unavailable/unverified.
- Conflicting authoritative sources: disputed; ask owner when material.
- Invalid signature, key status or checkpoint: fail closed for high-impact use.
- Index disagreement: canonical store wins; rebuild index only from verified, active canonical records.
- Never silently repair, overwrite, delete evidence or downgrade a failure to a warning.
- Preserve ordinary chat functionality and existing storage when memory services fail.

## 12. Acceptance tests
1. An assistant inference cannot be labeled user-stated, user-confirmed or externally verified.
2. A user-confirmed status requires an explicit attributable confirmation event.
3. A source that merely mentions the topic but does not support the claim fails claim matching.
4. Partial evidence yields a narrower claim or supported-with-limitations verdict.
5. A stale external fact is not returned as current without revalidation.
6. Contradictory records are surfaced and not silently resolved by recency/confidence.
7. Supersession relation cycles and orphan references are rejected.
8. Tampered digest/signature/checkpoint quarantines the record and dependent index entries.
9. A valid digest does not cause an unsupported claim to be marked verified.
10. Derived summaries preserve lineage and cannot increase source certainty.
11. Deleted records remain deleted after backup restore and index rebuild.
12. Restricted/project-scoped memories cannot leak across owner/project boundaries.
13. Verifier outage prevents durable promotion and high-impact reliance.
14. Model-based review cannot override deterministic failure or owner approval gates.
15. Verification decisions include verifier/version, evidence refs, policy version and time.
16. Ordinary logs contain no memory body, credentials, raw media or biometric templates.
17. Memory verification does not change existing chat history or local storage keys.
18. Every quarantine, correction and verification outcome emits a minimal audit event.

## 13. Implementation sequence
A — add versioned verification-result and integrity-manifest contracts.
B — implement deterministic validator and relation-graph checker with adversarial tests.
C — implement source adapters and evidence/claim matching.
D — implement canonicalization, digest/signature manifest and protected checkpoints.
E — integrate write admission and retrieval gates into Memory Manager.
F — add quarantine, owner explanations, correction workflow and audit events.
G — implement optional advisory semantic verifier behind a strict non-authoritative interface.
H — run restore, tampering, prompt-injection, stale-source, conflict and deletion-propagation tests before production activation.

## 14. Current boundary
This document is a design specification only. No independent verifier, source-entailment engine, cryptographic integrity manifest, quarantine service or runtime memory enforcement is implemented. The Memory Manager contracts remain specifications. No production behavior changes.
