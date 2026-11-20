# Sofia AI Data Governance & Lifecycle Manager — Architecture Specification v1

## Status and boundary
Architecture specification only. No runtime data catalog, policy engine, consent enforcement, retention scheduler, deletion propagation or processor enforcement is implemented by this document. It does not alter the v0.1 chat path, existing browser storage keys, production deployment, Cloudflare settings or `main`.

## 1. Purpose and governing principles
The Data Governance & Lifecycle Manager (DGLM) controls data from collection through use, storage, sharing, retention, export, archival and deletion. It applies to conversation content, files, email, contacts, photos, audio, video, device telemetry, location, memories, derived data, embeddings, logs and backups.

Core principles:
- purpose limitation: collect and use data only for a declared, permitted purpose;
- data minimization: collect the least data and context needed;
- owner control: owner-facing permissions and consent are explicit, scoped, revocable and understandable;
- classification by default: unknown or unclassified data is not public;
- provenance: retain source, collection time, transformations and processor lineage;
- least privilege: components access only approved data categories and operations;
- lifecycle accountability: every stored object has an owner, purpose, classification and applicable retention rule;
- privacy by design: privacy controls are enforced outside model prompts;
- no silent expansion: new purpose, recipient, processor, retention or data category requires policy review and, where applicable, owner approval.

## 2. Separation of responsibilities
- Sofia Core declares task purpose and requests data access; it cannot unilaterally grant it.
- Identity & Authentication Manager identifies the owner/session and authenticates consent actions.
- Capability & Permission Registry grants modules narrowly scoped data capabilities.
- Security Manager authorizes each protected read, write, export, disclosure or deletion.
- Owner Consent Manager records explicit consent where required; consent is not identity or authorization by itself.
- DGLM evaluates classification, purpose compatibility, minimization, residency, processor, retention and lifecycle state.
- Resource & Budget Manager governs storage, transfer and processing quotas, including the owner-controlled `FREE_ONLY` policy.
- Execution Supervisor mediates all module data access and external side effects.
- Audit & Observability Manager records minimal lifecycle evidence and policy outcomes.
No model, provider or executor can downgrade classification, invent consent, extend retention or suppress deletion.

## 3. Data inventory and metadata
Every managed data object should have a stable opaque ID and metadata conforming to the existing `contracts/v1/data-classification.schema.json`, with links to:
- data category and classification;
- owner/principal and source;
- declared purpose IDs and legal/consent basis where applicable;
- creation/collection and last-access timestamps;
- provenance and transformation lineage;
- storage location/region and encryption/key reference;
- processors/recipients and transfer history;
- retention policy/version, expiry or triggering event;
- lifecycle state, deletion request and verification status;
- parent/derived object references and backup copies.

Do not place content bodies, secrets or raw media in the metadata catalog. Store payloads separately with access controls.

## 4. Classification and default handling
Use the existing classification levels: `public`, `internal`, `confidential`, `restricted`. Classification may become less restrictive only through an approved declassification policy with attributable approval evidence. Derived data inherits the strictest relevant source classification unless a documented transformation and approved policy justify otherwise.

When classification, owner, purpose, provenance or policy is missing or contradictory, treat the object as at least confidential and defer or deny external processing. Sensitive categories (credentials, payment data, authentication secrets, biometric templates, private communications, precise location and health data) require dedicated handling profiles; do not assume that a generic class alone is sufficient.

## 5. Purpose and access decisions
Every read, write, transform, infer, summarize, export, share, disclose, train, retain or delete operation must name:
- task and declared purpose ID;
- data object/category and classification;
- requesting principal, module/version and capability;
- operation and intended recipient/processor;
- minimum fields/portion required;
- destination/region and transfer route;
- applicable consent, grant, authority and policy references.

Purpose compatibility is evaluated before access. A prior grant for reading an email does not authorize forwarding it, reading it aloud, using it for model training, or retaining it indefinitely. Reuse for a new purpose requires a separate policy decision and consent/approval where required.

## 6. Collection and sensor controls
Collection is off by default unless a platform capability, permission, purpose and owner consent/policy authorize it. Android OS permissions are necessary but not sufficient for Sofia-level authorization. No ambient microphone/camera capture, continuous location tracking, biometric template storage or background collection is implied by device integration.

For each collection event, record source, purpose, permission state, time window, scope and retention. Prefer on-device processing for sensitive media when feasible and approved. Do not retain raw audio/video by default. If a task requires capture, disclose what is captured, why, where processed, whether sent externally and when deleted; request explicit scoped consent before capture.

## 7. Storage, encryption and residency
- Separate content storage from metadata and audit records.
- Encrypt data in transit and at rest; isolate keys from application data and rotate/revoke keys under managed procedures.
- Enforce per-owner and per-category access boundaries.
- Record actual storage region and processor location where known; unknown residency blocks restricted data transfer.
- Do not move data across borders or to a new processor without an explicit policy decision and required owner approval.
- Do not claim end-to-end encryption or local-only processing unless the implementation proves it.
- Existing v0.1 browser localStorage is not encrypted durable storage; migration must preserve current chat history and avatars while separately planning secure storage. Do not silently delete or rewrite existing keys.

## 8. External processors and data egress
Before sending data to a model, API, cloud service, device or third party:
1. identify the exact processor, service, account/tier and destination;
2. check approved processor allowlist, purpose, data class, region and contractual/retention posture;
3. minimize and redact fields; avoid sending unrelated history or attachments;
4. check owner consent and Security Manager authorization;
5. check RBM route policy and cost.

Under `FREE_ONLY`, only explicitly approved zero-additional-cost plans are eligible. Free-tier access does not automatically authorize data disclosure. Any paid service or billable overage requires separate explicit owner approval before the call. A paid-route approval does not automatically approve sending restricted or unrelated data.

If provider retention, training use, data region or deletion behavior is unknown, treat it as unresolved risk: do not send confidential/restricted data until reviewed and explicitly approved under policy. No provider may reuse Sofia data for training or unrelated purposes unless a distinct, explicit policy and owner decision permits it.

## 9. Retention and lifecycle
Use the existing `contracts/v1/data-retention-policy.schema.json` as the versioned retention rule. Every managed object must resolve to an enabled policy before persistent storage. Retention modes include duration, until-event, user-controlled and legal hold. Legal hold is an exceptional, explicitly authorized state, not a default retention extension.

Lifecycle states should include: `collected`, `active`, `restricted`, `retention_due`, `deletion_pending`, `deleted`, `deletion_failed`, `legal_hold`, `archived`. Expiry must trigger an action, not merely update a timestamp. Backups and processor copies must have declared expiry and propagation rules. If deletion cannot be verified, retain a visible pending/failure state and notify the owner where appropriate.

## 10. Owner rights and controls
Provide an owner-facing interface to:
- inspect data categories, purposes, processors and storage locations;
- view and revoke active consents and permissions;
- correct metadata and challenge inaccurate provenance;
- export data in a documented, usable format;
- request deletion of selected data or supported categories;
- see deletion progress, exceptions, backup expiry and processor acknowledgements;
- set optional retention preferences within legal and operational constraints.

Revocation prevents future access/use promptly. It does not falsely claim to retract information already disclosed to a third party; the system should attempt processor deletion where supported and report the result. A deletion request must not remove evidence required for security/audit integrity or lawful obligations; such exceptions must be narrow, documented, access-restricted and time-bounded.

## 11. Derived data, memory and model training
Summaries, embeddings, indexes, inferred attributes, cached copies and memories are separate managed objects linked to source lineage. They inherit source restrictions unless a reviewed transformation policy says otherwise. Deleting a source must trigger impact analysis for derivatives and indexes.

Sofia conversation data, owner files, email and device data are not automatically training material. Model training, fine-tuning, evaluation dataset creation or cross-user learning requires a separate purpose, explicit owner authorization and a reviewed processor/data policy. Generalized software improvements must not expose or memorize private user content.

## 12. Deletion and verification
Deletion is a controlled workflow:
1. authenticate requester and validate ownership/authority;
2. resolve selected objects, derivatives, replicas, indexes, caches and processor copies;
3. check legal hold and narrowly defined mandatory retention exceptions;
4. prevent new reads/writes and mark deletion pending;
5. delete payloads or cryptographically erase keys as appropriate;
6. propagate deletion requests to processors and connected stores where supported;
7. expire backup copies according to declared backup policy;
8. verify outcomes and record minimal evidence;
9. report completed, pending, failed and exempt items separately.

Do not promise immediate deletion from immutable backups or third-party systems unless verified. Audit records retain only minimal deletion evidence, not deleted content.

## 13. Failure behavior
- Unknown classification, purpose, destination, processor, consent or residency: deny/defer external disclosure.
- Missing retention policy: do not persist beyond bounded transient processing; require a policy before durable storage.
- DGLM unavailable: block new sensitive collection, external egress, retention extension and destructive lifecycle operations; preserve existing local chat state.
- Deletion propagation failure: mark incomplete and retry only through bounded, idempotent workflows; never report full completion.
- Contradictory metadata: apply the more restrictive classification and raise an audit event.
- No fallback to a less private processor or paid provider.

## 14. Acceptance tests
1. Every persisted object has owner, category, classification, purpose, provenance and retention policy.
2. Unknown data is never treated as public.
3. Classification cannot be downgraded without approved declassification evidence.
4. A module cannot access data outside its grant, purpose and task scope.
5. Email-read permission does not imply send, forward, delete or voice-disclosure permission.
6. External egress is blocked for unknown processor, destination, region or incompatible purpose.
7. `FREE_ONLY` blocks paid routes before invocation; owner approval is explicit and task/cap-bound.
8. Free-tier status alone does not authorize disclosure of personal data.
9. Sensor collection remains off absent permission, purpose and scoped consent.
10. Raw audio/video and biometric templates are not retained by default.
11. Source deletion triggers derivative/index/cache/processor impact analysis.
12. Revoked consent blocks future access and use.
13. Deletion reports distinguish verified deletion, pending copies, failures and legal exceptions.
14. Backup retention and processor propagation are measurable and auditable.
15. Existing v0.1 chat history and avatar keys survive migration tests.
16. Data catalog and audit records contain no payloads, credentials or raw media.
17. Training/fine-tuning use is blocked absent separate explicit authorization.
18. DGLM failure fails closed for sensitive egress while preserving harmless local chat.

## 15. Implementation sequence
A — review/version existing classification and retention contracts; add governance policy and lifecycle event contracts.
B — implement pure policy evaluation and metadata validation with deny-by-default tests.
C — build a data inventory/catalog with provenance and processor lineage.
D — integrate consent, capability grants, Security Manager, RBM and Execution Supervisor.
E — add retention scheduler, deletion propagation, backup handling and verification.
F — build owner controls for access, export, consent revocation and deletion status.
G — test adversarial purpose escalation, hidden egress, derivative persistence, processor uncertainty and migration preservation before enabling runtime enforcement.

## 16. Current boundary
This specification does not implement runtime data governance, encryption, secure storage, consent prompts, processor controls, retention scheduling, deletion propagation or data export. Existing classification and retention contracts are specifications, not proof of enforcement. v0.1 remains unchanged.
