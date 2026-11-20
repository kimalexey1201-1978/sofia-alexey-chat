# Sofia AI System Integration Map

Status: integration architecture and consistency baseline; runtime wiring is pending.
Branch: `foundation/bootstrap`.
This document consolidates the intended interactions among existing architecture specifications. It does not claim that modules, APIs, registries, policy enforcement or event delivery are implemented.

## 1. System boundary

Sofia Core is the policy-aware coordination boundary. It does not contain provider-specific business logic and does not execute privileged actions directly. It coordinates modules through versioned contracts and a controlled invocation path.

The current web prototype remains the migration entry point. Its existing `POST /api/chat` endpoint and browser storage keys remain compatibility constraints until a separately reviewed migration is implemented.

## 2. Canonical request path

A user request follows this logical path:

1. **Client / Voice Interaction Manager** captures the request and records source, speaker confidence and capture permissions. Voice identity is not action authority.
2. **API Gateway & Session Manager** validates transport, session, request size and client identity. Client-supplied system/developer instructions are untrusted and cannot override server policy.
3. **Identity & Authentication Manager** resolves the owner/device/session principals and authentication assurance.
4. **Privacy & Data Governance Manager** classifies data, checks purpose/consent and determines permitted processing and disclosure.
5. **Task Orchestrator** creates a bounded task, dependency graph and correlation context.
6. **Autonomy & Decision Manager** creates or validates task-scoped authority. The model may propose a plan but cannot grant authority.
7. **Security Manager** evaluates the exact capability invocation at the enforcement point. A plan-time approval is not a substitute for invocation-time authorization.
8. **Capability Registry / Module Registry** resolves a validated provider module and exact contract version.
9. **Resource & Runtime Manager** enforces resource budgets, deadlines, concurrency and cancellation.
10. **AI Provider Gateway / Device Integration Gateway / Communication Manager** execute only the approved adapter operation.
11. **Verifier** independently checks output, side effects and task completion against the requested goal and policy.
12. **Audit & Observability Manager** records correlated decisions, transitions and evidence with privacy-aware redaction.
13. **Knowledge & Memory Manager** stores only data permitted by purpose, consent and retention policy; memory is not automatically created from every interaction.
14. **Proactive Intelligence Manager** may later propose a follow-up based on authorized sources; a suggestion is not permission to act.
15. **Social Media Integration Manager** may prepare and adapt content through Media Processing and File & Document Managers, then submit only through a verified official platform adapter or documented user hand-off. Publication requires fresh approval bound to the exact content hash, account, visibility, and operation; platform status must be independently checked.

Not every request traverses every component. The Orchestrator must declare the required components and fail closed when a mandatory control is unavailable.

## 3. Authority and trust flow

The following ordering is mandatory:

- Authentication establishes who or what is making a request; it does not itself authorize an operation.
- Consent permits a defined category of processing; it does not replace authentication, OS permissions or action approval.
- An authority envelope bounds a task; it does not bypass Security Manager policy.
- A policy decision permits or denies one exact operation within its scope and expiry.
- The execution adapter performs only the operation that was authorized.
- Verification checks the observed result; it cannot retroactively authorize an action.
- Audit records evidence; it does not grant authority.

Model output, external documents, web content, OCR, audio from bystanders, device telemetry and module manifests remain untrusted data. None may modify identity, consent, authority or policy.

## 4. Shared context propagated across boundaries

Every cross-module operation should carry, where applicable:
- `message_id`, `correlation_id`, optional `task_id`;
- source module ID and exact module version;
- target module ID, capability ID and contract version;
- timestamp, deadline and idempotency key for side-effecting operations;
- principal references and authenticated session reference;
- declared purpose and data classification;
- authority-envelope reference and policy-decision reference;
- consent/grant references where relevant;
- resource-budget reference;
- trace/span references;
- payload schema reference and payload.

Do not put raw credentials, private key material or unrestricted bearer tokens in the envelope. References must resolve through protected server-side context.

## 5. Responsibility and enforcement matrix

| Concern | Owner module | Required cooperating modules |
| --- | --- | --- |
| Identity and session | Identity & Authentication Manager | API Gateway, Security Manager, Audit |
| Request validation and transport | API Gateway & Session Manager | Identity, Security, Resource Runtime |
| Consent and data purpose | Privacy & Data Governance Manager | Memory, Provider Gateway, Device Gateway |
| Task planning and state | Task Orchestrator | Core, Resource Runtime, Autonomy |
| Task-scoped autonomy | Autonomy & Decision Manager | Orchestrator, Security, Identity |
| Invocation authorization | Security Manager | Identity, Consent, Registries, Audit |
| Module/capability discovery | Registries / Module Lifecycle Manager | Security, Test & Verification |
| AI model execution | AI Provider Gateway | Privacy, Resource Runtime, Evaluation |
| Device operations | Device Integration Gateway | Device Manager, Security, Privacy |
| Voice capture and speaker handling | Voice Interaction Manager | Identity, Privacy, Android Runtime |
| Communication delivery | Communication Manager | Identity, Security, Privacy, Audit |
| Social platform publishing and analytics | Social Media Integration Manager | Media Processing, File & Document, Identity, Security, Privacy, Autonomy, Workflow, Audit |
| Memory lifecycle | Knowledge & Memory Manager | Privacy, Identity, Audit |
| Independent result checking | Verifier / AI Evaluation & Quality | Orchestrator, Audit |
| Logs and evidence | Audit & Observability Manager | All modules |
| Updates and recovery | Update & Recovery Manager | Lifecycle, Release Security, Audit |
| Release qualification | Test & Verification Framework | Release Security, all module owners |

A module may call another module only through a registered capability and validated contract. Direct database access across module boundaries is prohibited unless a separately documented data contract explicitly permits it.

## 6. Canonical identifiers and version rules

- Module IDs, capability IDs, device IDs, principal IDs, task IDs, grant IDs and event IDs are separate namespaces.
- Use immutable opaque identifiers for runtime entities. Human-readable names are display metadata, not authorization keys.
- Contract versions use semantic versioning. Breaking changes require a new major version or a separately versioned contract ID.
- Every invocation binds to the exact schema/contract version resolved at planning time and revalidates compatibility immediately before execution.
- Schema references must resolve to immutable versioned artifacts; mutable branch URLs are not valid production schema references.
- Unknown fields are rejected by strict contracts unless a specific extension point is explicitly defined.
- Time values are UTC ISO 8601 date-time values. Deadlines and grants must be checked against trusted server time.
- Correlation IDs are for traceability, not identity or authorization.

## 7. Consistency findings to resolve before runtime integration

A first-pass cross-document inspection found several areas that must be normalized before modules are wired together:

1. **Contract version notation:** `message-envelope.schema.json` currently uses `envelope_version: "1.0"`, while newer contracts use `schema_version: "1.0.0"`. Choose one canonical contract-version representation and define any legacy mapping.
2. **Identifier formats:** some contracts require UUIDs while others accept opaque strings. Define a canonical ID policy by entity type; do not force every identifier to UUID if stable namespaced IDs are required.
3. **Data-classification vocabulary:** the module manifest currently declares `user_content`, `personal_data`, `sensitive_data`, `credentials` and `device_telemetry`, while the privacy manager uses `public`, `internal`, `confidential` and `restricted`. Define a reviewed mapping and migration rule; do not silently equate these vocabularies.
4. **Policy and authority linkage:** invocation messages need explicit references to the authority envelope and policy decision, while ensuring those references cannot be client-forged.
5. **Verifier ownership:** the architecture should identify a distinct verifier enforcement boundary, not assume that the same model/provider that generated an answer can certify its own correctness.
6. **Event delivery semantics:** define idempotency, ordering, retry and dead-letter behavior for audit, lifecycle, consent revocation and cancellation events.

These are design alignment tasks, not proof of runtime defects. Existing files remain unchanged until a versioned compatibility decision is approved.

## 8. Integration readiness criteria

A module is not integration-ready until:
- its manifest and all input/output schemas validate;
- its capability IDs and exact contract versions resolve;
- its principal, permission, consent and data-classification requirements are declared;
- every protected operation passes Security Manager enforcement;
- deadlines, cancellation, idempotency and resource budgets are defined;
- audit and privacy-safe observability are emitted;
- independent contract, integration, security and failure tests pass;
- version compatibility and rollback behavior are documented.

## 9. Social publishing integration boundary

Social Media Integration Manager is a separate platform adapter layer. Media creation remains owned by Media Processing Manager; file custody remains with File & Document Manager. SMIM owns platform account connection metadata, capability discovery, content packaging, publication workflow, and platform result verification. OAuth secrets remain in a protected credential vault and never enter client storage, model prompts, logs, or repository files. API access, scopes, app review, account eligibility, and regional availability are checked per platform and API version. A prepared video is not a published video; upload acceptance, processing, scheduling, and publication are distinct states. No direct platform API calls or account connections are implemented by the architecture documents.

## 10. Current status

This map is a design artifact. No runtime wiring or end-to-end integration has been implemented by adding this document. The consistency findings in section 7 remain open until canonical decisions, schema changes, migration tests and implementation evidence are completed.
