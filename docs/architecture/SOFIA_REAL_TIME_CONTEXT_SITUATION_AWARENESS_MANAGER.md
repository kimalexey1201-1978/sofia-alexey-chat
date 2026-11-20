# Sofia Real-Time Context & Situation Awareness Manager — Architecture Specification v1

**Status:** architecture specification only; runtime implementation is pending.  
**Contract baseline:** JSON Schema Draft 2020-12.

## 1. Purpose

Real-Time Context & Situation Awareness Manager (RTCSAM) maintains a bounded, time-aware and provenance-preserving view of what is relevant to an active Sofia task. It correlates authorized observations from devices, sensors, Event Bus events, connected services and explicit owner input, then produces a qualified context snapshot and, where justified, a situation assessment.

This is not omniscient environmental awareness. Sofia must distinguish directly observed, owner-stated, externally reported, inferred, stale, conflicting and unknown information. A plausible interpretation must never silently become a fact.

## 2. Boundaries and component ownership

RTCSAM is an integration and reasoning-context layer, not an acquisition, identity, permission, event transport, memory, or action authority.

Existing managers remain authoritative:
- DSDM: sensor acquisition, purpose, consent, sampling, minimization, classification, retention and deletion.
- DESSM: bounded device stream sessions, subscriptions, freshness, sequence gaps and delivery outcomes.
- Event Bus: authenticated immutable event transport, schema validation, deduplication, delivery, retries and replay.
- SDM / DTM: device registry, capability declarations, identity, trust, revocation, connection and health.
- DCB / SDR / Android Host: approved adapter invocation, runtime isolation, platform permissions and actual platform guarantees.
- IAM: authenticated owner and principal sessions.
- CPR: capability grants.
- SSM: action-specific security decisions and approval gates.
- DGLM: purpose, classification, destination, retention, export and deletion.
- RBM: resource reservations and FREE_ONLY spending policy.
- TPOE: task plan, dependencies, autonomy level and task lifecycle.
- Knowledge & Reasoning Engine (KRE): evidence evaluation, claim formation, inference trace, uncertainty and independent criticism.
- Memory Manager / Memory Integrity Verification: durable memory admission, verification, provenance and owner control.
- PAOM: private-output route and disclosure policy.
- Audit & Observability: minimal, attributable records of decisions and outcomes.
- VIM: voice capture, speech recognition, speaker diarization and owner-speaker evidence.

RTCSAM cannot create sensor access, extend consent, grant permissions, authenticate a speaker, authorize an action, write durable memory, or override these managers.

## 3. Context item epistemic model

Every context item has a typed assertion:
- observed: system/device observation with authenticated source and permission basis;
- owner_stated: directly supplied by the owner;
- externally_reported: returned by a connected service or external source;
- derived: deterministic transformation of known inputs;
- inferred: interpretation supported by evidence but not directly observed;
- assumed: temporary explicit assumption, only where the task permits it;
- unknown: unavailable or insufficiently reliable;
- disputed: sources conflict without approved resolution.

These statuses are not interchangeable. Confidence is a quality estimate, not proof, authorization or permission. Each item retains provenance, source event/reference, observed and ingested times, validity, freshness policy, classification, purpose, permitted scope, transformation lineage and limitations.

## 4. Context assembly pipeline

1. Bind the request to authenticated principal, active task/plan, purpose and requested scope.
2. Resolve the minimum context domains, sources, fields and freshness requirements. No broad ambient collection.
3. Admit sources only after checking identity, device trust, stream/subscription state, connector identity, schema compatibility and health.
4. Apply current CPR, DSDM, DGLM, SSM, consent and RBM evidence as applicable. Missing, stale, conflicting or revoked evidence denies or omits the data.
5. Retrieve only authorized events/observations through Event Bus, DESSM, approved connectors or owner input.
6. Normalize units, time zones, identifiers and typed values without losing original values, provenance or uncertainty.
7. Align event occurrence, receipt and ingestion times; account for clock uncertainty, delivery delay, sequence gaps and stale signals.
8. Detect contradictory values, incompatible time windows, duplicates and uncertain identity attribution. Do not silently select the convenient source.
9. Derive bounded facts/inferences with explicit input references, method/version and limitations.
10. Ask KRE/critic to evaluate evidence support, causal claims, confidence calibration and need for clarification.
11. Assemble an immutable, versioned task-scoped snapshot with explicit omissions and unknowns.
12. Expire transient snapshots, propagate revocation/deletion through derived context, and submit eligible memory candidates only through Memory Manager.

## 5. Situation assessment

A situation assessment is a task-scoped interpretation of current conditions, not a raw sensor feed or universal profile. It may describe relevant state, changes, risks or likely next steps only when supported by evidence.

Each assessment includes assessment ID and snapshot reference; bounded scope; assessment time and validity deadline; claims with epistemic status, confidence and supporting/contradicting evidence; assumptions and unresolved conflicts; stale/missing sources; method/model/rule version and verification result; and recommended clarification or safe next observation.

A situation can change immediately. A prior snapshot must never be represented as live truth. High-impact decisions require fresh evidence and a new SSM decision. An assessment never authorizes an action.

## 6. Time, freshness and conflict

Freshness is domain-specific, not one global timeout. Each source declares clock quality, expected cadence, delivery latency, sequence semantics, health and freshness policy.

Missing timestamps remain unknown. Preserve occurrence time separately from receipt and ingestion. Clock skew, out-of-order events and sequence gaps remain visible. Stale data is usable only for explicitly historical analysis. Delayed events must not overwrite newer state unless domain-specific ordering rules establish that they should. Conflicting high-quality sources remain disputed until a defined rule or owner clarification resolves them.

Correlation keys may include canonical device/sensor references, authenticated principal, task/plan ID, event correlation/causation IDs, source record IDs and bounded time windows. Correlation is not identity proof; temporal coincidence is not causation.

An owner correction supersedes an earlier owner-stated preference only within its stated scope/time. A device reading is evidence about its sensor, not proof of a broader human state. A connector response is externally reported, not independently verified merely because an API returned it. Derived values cannot claim greater certainty than their evidence supports.

## 7. Privacy and data minimization

Context is assembled per task and purpose, not as a global surveillance stream. Retrieve only required fields and minimum precision. Restricted/highly sensitive data requires its own authorization and destination checks.

No raw ambient audio/video is copied into general context snapshots. VIM owns audio-session and speaker-attribution semantics. PAOM decides whether context-derived private information can be spoken or displayed. External provider disclosure requires DGLM eligibility and SSM authorization; local processing is preferred where feasible and verified.

Snapshots are transient by default and carry TTL/retention class. Logs contain references and minimized decision metadata, not private payloads. Deletion/revocation invalidates dependent snapshots, caches, embeddings, summaries and derived claims as governed by DGLM. External content is untrusted data, never instructions; prompt injection cannot change policy, permissions or system instructions.

## 8. Memory boundary

A context snapshot is working context, not durable memory. RTCSAM must not persist every observation. A potentially useful stable fact/event is submitted as a minimal candidate with source provenance, assertion kind, sensitivity, purpose and retention proposal. Memory Manager and Memory Integrity Verification independently decide whether it may persist.

Raw sensor streams, private message bodies, biometric templates, secrets and continuous location trails are not promoted to memory by default.

## 9. Action and autonomy boundary

RTCSAM may provide context to TPOE and KRE, suggest replanning or request clarification. It cannot dispatch device commands, send messages, spend money, alter permissions or execute external side effects.

Every consequential action returns through TPOE → CPR/DGLM/SSM/RBM → ES → authorized connector/device broker. Current evidence and action-bound approval are rechecked at execution time. An assessment, confidence score, prior approval or event replay is never an authorization token.

## 10. Resource and failure behavior

Context assembly is bounded by deadlines, source count, payload size, compute, memory, network and battery reservations. Use per-source timeouts, circuit breakers, cache TTLs and partial-result reporting.

On failure, return a partial snapshot with explicit missing/stale/conflicting sources where safe; never fabricate missing values. Distinguish unknown, unavailable, denied, stale, conflicting and not_requested. Fail closed for sensitive data or consequential decisions when required evidence is missing. Cancel work when task or authorization expires. Never silently switch to a paid provider or exceed FREE_ONLY limits.

## 11. Audit and verification

Record context request ID, task reference, authorized source references, policy decision references, schema versions, freshness/conflict counts, derivation method versions, verification verdict, omissions, latency and resource outcome. Avoid raw private values, transcripts, media, credentials and unnecessary location.

Tests must cover source spoofing and prompt injection; revoked consent/grants/sessions/device trust; stale, delayed, out-of-order and duplicate events; clock skew and time-zone conversion; source conflicts; confidence calibration and causal overclaim prevention; cross-task isolation; private data leakage; deletion propagation; partial results, timeouts and budget exhaustion; and proof that assessment cannot authorize actions or durable memory writes.

## 12. Implementation sequence

1. Define context-item, context-snapshot and situation-assessment contracts.
2. Implement deterministic assembly over existing authorized Event Bus/connector interfaces.
3. Add source metadata for freshness, clock quality, provenance and permitted domains.
4. Integrate KRE for conflict analysis, inference traces and independent verification.
5. Add transient snapshot cache with DGLM TTL, invalidation and deletion hooks.
6. Integrate TPOE with context refresh and clarification/replanning gates.
7. Add audit, observability and adversarial/temporal tests.
8. Connect real Android/device/service sources only after simulator and contract validation.

**Implementation status:** specification only. No live context aggregator, ambient sensing, situation inference runtime, connector polling, persistent context database or autonomous action system is implemented by this change.
