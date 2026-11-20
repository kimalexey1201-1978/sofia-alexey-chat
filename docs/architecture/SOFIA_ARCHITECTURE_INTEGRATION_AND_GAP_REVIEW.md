# Sofia AI Architecture Integration & Gap Review v1

**Status:** cross-module architecture review; design baseline only.  
**Branch:** `core/v0.1-minimal-cycle`.  
**Production boundary:** this review does not modify `main`, deploy services, change Cloudflare configuration, rotate secrets, or alter the existing chat API/storage contract.

## 1. Purpose

This document checks whether the currently specified Sofia subsystems form a coherent architecture: clear ownership, bounded authority, compatible data contracts, controlled data flows, safe failure behavior and a staged path from the existing chat prototype to an extensible assistant.

This is a source-level architecture review, not proof that runtime components exist or interoperate. Contract validation, implementation tests, security testing and device/platform compatibility testing remain separate gates.

## 2. Architectural invariants

The following invariants apply across every subsystem:

1. Sofia Core is the single owner of task orchestration and final response assembly.
2. No model, agent, executor, connector, device adapter or external document can grant itself authority.
3. Capability declaration, owner permission, OS permission, device trust, action authorization and resource reservation are distinct controls.
4. Every side-effecting operation is mediated through the Execution Supervisor and its approved capability broker/adapter path.
5. SSM makes action-specific security decisions; CPR records grants; IAM authenticates principals; DTM establishes device trust; RBM reserves resources; DGLM governs data use.
6. FREE_ONLY is the default resource policy. Unknown price is not free. Exhausted quota stops or waits; no paid fallback.
7. External content is untrusted data, not instructions or authority.
8. Durable memory is admitted only through Memory Manager and independently checked by Memory Integrity Verification.
9. Situation awareness and proactive intelligence do not authorize actions.
10. PAOM controls disclosure and output routing; permission to retrieve content is not permission to speak or disclose it.
11. Revocation, expiry and deletion propagate to dependent sessions, queued operations, derived context, memory candidates and proactive opportunities.
12. Missing, stale, conflicting or unavailable policy evidence fails closed for sensitive data and side effects.
13. Existing chat remains functional if optional advanced subsystems are unavailable.
14. Architecture documents and schemas are not runtime implementations.

## 3. Component ownership map

| Domain | Authoritative component | Must not own |
|---|---|---|
| User request, task state, orchestration, final answer | Sofia Core | External side effects without supervised path |
| Task decomposition, dependencies, plan versioning | TPOE | Permissions, spend approval, direct execution |
| Module discovery, trust/health/suitability and routing candidates | Agent & Executor Management System | Grant issuance, task ownership, policy override |
| Capability declarations, requests and grants | CPR | Authentication or action approval |
| Owner/principal authentication and session | IAM | Device trust or capability grant |
| Security and action authorization | SSM | Identity proof, spend reservation, data retention |
| Resource/quota/spend reservation | RBM | Security authorization or hidden paid fallback |
| Data purpose, classification, destination, retention/deletion | DGLM | Action authorization |
| Isolated module invocation and lifecycle | Execution Supervisor | Self-granted capabilities |
| External service integration | Communication & Integration Gateway | Owner identity, blanket OAuth authority |
| Device discovery/registry/capabilities | Universal Device Manager | Pairing proof or action authorization |
| Device pairing, credentials, trust and revocation | Device Trust Manager | Capability grants or SSM ALLOW |
| Adapter SDK and mediated device capability invocation | Device Adapter SDK & Capability Broker | Direct unmediated device control |
| Runtime host and Android lifecycle | Device Runtime & Android Host | Bypassing Android OS permission/sandbox |
| Sensor/device data acquisition and policy | Device & Sensor Data Manager | General task orchestration |
| Bounded sensor/event streams | DESSM | General event transport or action execution |
| Immutable event transport and delivery | Event Bus | Domain policy decisions |
| Task-scoped context assembly | RTCSAM | Sensor acquisition, memory writes, action authority |
| Knowledge, evidence evaluation and inference | KRE | Security grants or approval |
| Durable memory admission and retrieval | Memory Manager | Unverified persistence or policy bypass |
| Memory integrity and claim verification | MIV | Establishing truth solely from a hash |
| Private output and disclosure | PAOM | Retrieving data or granting access |
| Voice capture, recognition and speaker evidence | VIM | Sole high-risk authentication factor |
| Proactive candidate evaluation and suggestion | PIAM | Background surveillance, direct execution, consent expansion |
| Audit, metrics and alerts | Audit & Observability | Logging raw sensitive content by default |

No component should implement another manager's authoritative decision as a private shortcut. Shared libraries may implement deterministic validation, but the authoritative decision and evidence reference must remain attributable to the owning subsystem.

## 4. Canonical controlled data flows

### 4.1 Standard owner request

Owner → authenticated client/session → IAM principal context → Sofia Core → TPOE plan → KRE evidence/clarification as needed → Core response.

For any protected operation, Core obtains the applicable CPR grant, DGLM decision, SSM decision and RBM reservation before handing a bounded execution request to ES. ES invokes only a registered, eligible module through the approved adapter/broker. Results return through ES, are independently verified where required, and are assembled by Core. PAOM evaluates output disclosure before sensitive content is spoken or routed to a shared device.

### 4.2 External integration operation

Core/TPOE → SSM + CPR + DGLM + RBM → ES → Communication & Integration Gateway → connector adapter → external service.

Inbound data follows the reverse direction through authenticated webhook/polling adapter, replay/deduplication and schema validation, Event Bus, then an authorized consumer. OAuth connection is not blanket operation permission. Sending or publishing requires operation-bound approval over exact content, recipient/account/channel and expiry where policy requires it.

### 4.3 Device operation

Core/TPOE → IAM → SDM/DTM → CPR/DGLM/SSM/RBM → ES → Device Capability Broker → approved adapter → Android Host/OS or target device.

Discovery is not pairing; pairing is not trust; trust is not permission; OS permission is not Sofia capability grant; neither is SSM authorization. Physical side effects require current device state and safety interlocks.

### 4.4 Device event and situation context

Device/sensor source → DSDM acquisition/policy → DESSM bounded stream → Event Bus → RTCSAM task-scoped context snapshot → KRE evidence assessment → TPOE/Core.

PIAM may consume eligible references to milestones/events/context, but may not independently subscribe to sources or widen the collection purpose. Stale context cannot support a claim that a condition is current.

### 4.5 Memory lifecycle

Eligible source/evidence → Memory Manager write decision → MIV verification → durable store. Retrieval returns provenance, status, scope and validity; RTCSAM/KRE/PIAM must re-check eligibility for the current purpose. Owner correction, revocation or deletion propagates to derived records and indexes according to DGLM policy.

### 4.6 Proactive assistance

Authorized trigger → PIAM eligibility/deduplication/risk assessment → SSM/DGLM/RBM/PAOM as applicable → dismissible suggestion or suppression → explicit owner response → TPOE task request. Suggestion acceptance is not blanket approval for external side effects.

## 5. Cross-cutting contract requirements

Every cross-module contract must specify:
- stable identifier and schema/contract version;
- authenticated principal and task/purpose binding where relevant;
- source and provenance references;
- created/occurred/received/expiry times as applicable;
- data classification and permitted scope;
- policy decision references;
- explicit status and failure semantics;
- idempotency/deduplication key for retried or event-driven operations;
- correlation and causation identifiers for audit;
- compatibility and deprecation policy.

Contracts must be strict and versioned. Unknown fields, enum values, missing mandatory provenance and incompatible major versions are rejected unless a documented migration adapter exists. A valid JSON Schema instance is not proof of authorization or semantic correctness.

## 6. Critical interaction rules

- **IAM vs DTM:** a logged-in owner does not automatically trust every paired device; a trusted device does not authenticate the owner.
- **DTM vs CPR:** device trust does not grant device capabilities.
- **CPR vs SSM:** a capability grant does not authorize every operation; SSM evaluates the exact action and context.
- **SSM vs RBM:** permission to act does not reserve resources; resource availability does not authorize the action.
- **DGLM vs SSM:** lawful data use does not authorize an external side effect; action approval does not override data purpose or retention.
- **ES vs modules:** modules cannot bypass ES, invoke arbitrary network/device access, or widen their declared permissions.
- **Event Bus vs domain managers:** delivery authenticity and deduplication do not establish truth, freshness, consent or permission.
- **RTCSAM vs KRE:** context assembly preserves evidence; KRE evaluates claims/inferences. Neither authorizes action.
- **Memory Manager vs MIV:** admission and integrity verification are separate gates; hash integrity does not prove original truth.
- **PIAM vs TPOE:** PIAM proposes; TPOE owns plans and task execution.
- **PAOM vs VIM:** speaker evidence and environment signals inform output routing but do not establish privacy or consent by themselves.
- **Android Host vs Sofia policy:** OS permissions and background execution limits are additional platform constraints, never substitutes for Sofia authorization.

## 7. Failure containment

Subsystem failures should be isolated:
- chat/core inference can continue without PIAM, device streams, memory learning or optional integrations;
- no action proceeds if SSM, CPR, RBM, DGLM or ES cannot provide the required current decision/evidence;
- no sensitive output proceeds if PAOM cannot make a safe routing decision;
- no unverified memory is promoted when MIV is unavailable;
- no device operation proceeds if device identity, trust, health or revocation state is unknown;
- no stale or conflicted context is silently upgraded to current fact;
- no connector retries an outcome-unknown side effect without reconciliation.

A manager outage must not cause a fallback path that bypasses that manager.

## 8. Identified architecture risks and required resolutions

| Risk | Consequence | Required resolution / gate |
|---|---|---|
| Existing Worker has no authenticated owner session | Anyone reaching the endpoint may be able to submit requests subject to current controls | Implement IAM/session verification before owner-specific memory, integrations or privileged operations |
| Browser chat history is in localStorage | Local device access or browser compromise may expose content | Threat model, retention/export/delete controls and secure storage design; do not silently change existing keys during migration |
| Model/provider receives recent conversation context | Data leaves the app boundary and may be retained by provider | DGLM egress policy, provider terms review, data minimization and explicit owner controls |
| Current provider/runtime path has no complete quota and spend enforcement | Resource exhaustion or unexpected cost | Enforce RBM before any provider or executor call; FREE_ONLY fail-closed |
| WebAuthn domain topology unresolved | Authentication credential may not work across current Pages/Worker origins | Select and validate custom-domain/RP-ID architecture before implementing passkeys |
| Runtime contract coverage is broad but implementation is absent | Documents can create false confidence | Maintain explicit spec/implemented/tested/deployed status for every component |
| Android background guarantees are OS-controlled | Missed reminders or streams if promise exceeds platform behavior | Test on real target devices and report scheduler guarantees honestly |
| Cross-module schema compatibility not yet mechanically checked | Integration drift and runtime failures | Build automated contract catalog, compatibility matrix and CI validation |
| Revocation/deletion propagation spans many stores and queues | Stale permissions/data may remain usable | End-to-end revocation and deletion tests before enabling persistent integrations |
| External service pricing and free-tier terms change | FREE_ONLY could be violated by stale assumptions | Runtime price/plan registry with freshness expiry; unknown pricing blocks |
| Voice/speaker recognition may be spoofed or unavailable | Wrong-person disclosure or unsafe authorization | Treat voice as evidence only; step-up authentication for protected actions |
| Autonomous loops can amplify errors and costs | Repeated actions, notifications or resource exhaustion | Bounded retries, task depth/step quotas, kill switch, owner approvals and outcome reconciliation |

These risks are not evidence that a feature is already compromised; they are known architectural or prototype limitations requiring implementation controls and tests.

## 9. Unresolved decisions that must remain explicit

The architecture must not silently guess these decisions:
1. Custom domain and authentication topology compatible with Google sign-in and WebAuthn RP ID.
2. Primary identity/session provider and token/session lifecycle implementation.
3. Initial local-versus-cloud memory split, encryption/key ownership and synchronization conflict policy.
4. Initial supported Android minimum/target API levels and device test matrix.
5. Initial event broker/storage technology and retention/availability targets.
6. Initial module sandbox/isolation technology on Android and server-side execution.
7. Initial provider allowlist, current free-tier verification process and model-data retention review.
8. Owner notification defaults and explicit opt-in categories.
9. Data export/deletion scope across browser, Worker, provider, backups, logs and future integrations.
10. Measurable SLOs for latency, availability, recovery and resource use.

Each decision must have an owner, rationale, options considered, security/privacy impact, compatibility impact and a recorded approval before implementation depends on it.

## 10. Migration constraints for the existing prototype

The existing working chat must be preserved:
- keep `POST /api/chat` and the OpenAI-compatible response shape until a separately tested versioned migration is approved;
- preserve frontend chat history behavior, avatar handling, retry semantics and existing localStorage keys;
- keep `wrangler.jsonc` unchanged unless an evidence-backed requirement proves otherwise;
- keep current Pages origin and Worker API topology unchanged during architecture-only work;
- introduce Core behind an adapter/feature boundary, with regression tests for old and new paths;
- use synthetic fixtures and mock providers for early tests; do not require paid API calls;
- do not deploy, merge to `main`, change secrets or modify production settings without separate explicit approval.

## 11. Readiness verdict

**Architecture is substantially specified but not yet implementation-ready as a complete autonomous assistant.** The current prototype is a working text request/response cycle, while the managers described in the architecture are predominantly specifications and contracts.

The next gate is a machine-checked architecture baseline:
1. inventory all docs, schemas, runtime source files and current branch commits;
2. validate every JSON Schema and sample payload;
3. build a contract dependency graph and check references, enums, identifiers and version compatibility;
4. review each subsystem against the ownership and authority invariants in this document;
5. map each requirement to an implementation task and deterministic acceptance test;
6. isolate the smallest executable Sofia Core v0.1 vertical slice that can be implemented without altering production;
7. run existing prototype regression tests before and after each integration step.

Only after this gate should implementation begin in controlled increments. Real hardware, Android lifecycle, provider and external integration compatibility require their own subsequent tests.

## 12. Review limitations

This review is based on the architecture specifications and contract files inspected on the development branch. It is not a full source-code security audit, live cloud configuration inspection, provider contract review, penetration test, Android device test or CI run. Any claim about runtime behavior must be verified against current source and test output.
