# Sofia AI Foundation — Audit Remediation Register

**Source:** «Углублённый технический аудит Sofia AI», GitHub audit of repository `sofia-alexey-chat`, branch `main`, audited HEAD `c7de372d5ea786f554c128fddb35047ed09ba690`  
**Status:** Mandatory foundation requirements; implementation and production remediation remain pending review  
**Version:** 1.0

## 1. Purpose and preservation rule

This register converts the findings from the technical audit into explicit architecture requirements, contracts, tests, and release gates. It is a control document for all subsequent Sofia Core work.

**Do not modify the current prototype or deploy changes as part of this architecture phase.** The audited prototype is to be preserved until a separately reviewed implementation, backup, compatibility test, and rollback plan exist. Findings are not considered fixed merely because a design document describes a fix.

Each finding has three separate states:
- **Observed:** what the audit reported about the inspected prototype.
- **Designed:** where the foundation now specifies a control.
- **Implemented/verified:** code change and evidence; currently pending unless explicitly recorded in a later implementation report.

## 2. Audit findings and mandatory controls

### A-01 — Public API without authentication (high priority)

**Observed:** Cloudflare Worker/API endpoint was publicly reachable without user authentication. CORS does not authenticate a caller. Direct HTTP requests could consume the configured OpenRouter service and deplete its balance.

**Mandatory controls:**
- Authenticate every non-public route with a server-verifiable principal/session.
- Authorize each capability separately; authentication alone is not permission.
- Do not expose private memory, provider access, or privileged tools to anonymous callers.
- Apply rate limits, quotas, and cost budgets before provider invocation.
- Fail closed when authentication or authorization services are unavailable.
- Treat CORS strictly as a browser-origin policy, never as identity or access control.
- Require a separate explicit deployment gate before exposing any authenticated production endpoint.

**Foundation mapping:** API Gateway & Session Manager; Identity & Authentication Manager; Security Manager; Resource & Runtime Manager; AI Provider Gateway.

### A-02 — Missing rate limiting, quotas, and cost controls

**Observed:** The audit reported no effective rate limiting, quotas, or cost controls for model calls.

**Mandatory controls:**
- Enforce limits by authenticated principal, session, device/client, route, and where appropriate network source.
- Add per-minute/hour/day request quotas, concurrency caps, token/compute budgets, and spend ceilings.
- Maintain a global emergency kill switch for provider spending and abusive routes.
- Apply bounded retries and prevent retry storms.
- Return typed rate/quota errors and safe retry guidance.
- Do not rely on IP address as the only identity or limiter key.
- Ensure fallback providers cannot silently bypass the caller's budget or privacy policy.

**Foundation mapping:** API Gateway & Session Manager; AI Provider Gateway; Resource & Runtime Manager; Audit & Observability Manager.

### A-03 — Insufficient server-side request validation

**Observed:** The audit reported weak validation of `body.messages`, including the risk of malformed or oversized inputs and manipulation of message roles/instructions.

**Mandatory controls:**
- Define strict route-specific request schemas, role allowlists, maximum message counts, content lengths, attachment limits, and nesting/depth limits.
- Reject client-supplied system/developer roles, server policy, provider credentials, privileged tool permissions, and autonomy claims.
- Build trusted system/developer instructions on the server.
- Treat browser history and all client-supplied conversation context as untrusted and potentially replayed.
- Validate provider responses before returning them to clients.
- Keep schemas versioned and add negative tests for unknown/forbidden fields.

**Foundation mapping:** API Gateway & Session Manager; Security Manager; AI Provider Gateway; contracts/v1 API request/response schemas.

### A-04 — Missing HTTP payload and message bounds

**Observed:** The audit reported a lack of clear HTTP body-size, message-count, and message-length limits.

**Mandatory controls:**
- Set route-specific maximum request bytes and parsed object depth.
- Bound message count, per-message characters/tokens, attachment count, and total attachment bytes.
- Reject unsupported MIME types and validate file signatures where applicable.
- Enforce provider input/output budgets after normalization, not only at the client.
- Apply limits before expensive parsing, storage, or provider calls.
- Test boundary values, malformed encodings, decompression expansion, and oversized inputs.

**Foundation mapping:** API Gateway & Session Manager; Request Guard contract; AI Provider Gateway budget.

### A-05 — Missing independent timeout and fault handling

**Observed:** The audit reported insufficient independent timeout handling and fault classification.

**Mandatory controls:**
- Apply end-to-end deadlines and smaller per-stage timeouts.
- Use bounded retries with exponential backoff and jitter only for retryable/idempotent operations.
- Use circuit breakers, concurrency bulkheads, cancellation, and queue bounds.
- Classify provider timeout, provider rejection, quota exhaustion, policy failure, invalid response, and internal failure distinctly.
- Never report success when downstream completion is unknown.
- Preserve task/session state through provider outages and allow safe recovery.
- Fail closed for protected operations when policy/authentication services fail.

**Foundation mapping:** API Gateway & Session Manager; AI Provider Gateway; Task Orchestrator; Resource & Runtime Manager; Fault Tolerance contract.

### A-06 — Missing core architecture and modular runtime

**Observed:** The audit found no implemented Sofia Core with the intended modular boundaries and no established runtime architecture.

**Mandatory controls:**
- Keep Sofia Core provider-independent and separate from UI, adapters, and platform services.
- Use versioned module manifests, capability records, and message contracts.
- Require quarantine, validation, testing, staged activation, revocation, and rollback for modules.
- Prevent model output or module declarations from granting capabilities.
- Preserve Android-first runtime constraints and cross-platform adapter boundaries.

**Foundation mapping:** FOUNDATION.md; registries; Module Lifecycle Manager; Task Orchestrator; Resource & Runtime Manager.

### A-07 — Missing Android Runtime and device integration

**Observed:** The audit found no implemented Android Runtime/device integration foundation.

**Mandatory controls:**
- Design Android as the primary implementation and test platform.
- Respect Android permission, background execution, battery, storage, and microphone/camera restrictions.
- Use Device Manager and Device Integration Gateway with explicit pairing, authorization, and revocation.
- Do not depend on hidden APIs, covert capture, or accessibility abuse.
- Keep desktop support as additional platform adapters, not as a reason to weaken Android requirements.

**Foundation mapping:** Resource & Runtime Manager; Device Manager; Device Integration Gateway; Voice Interaction Manager.

### A-08 — Memory limited to browser localStorage

**Observed:** The audit noted that browser localStorage does not provide secure, durable, cross-device authoritative memory.

**Mandatory controls:**
- Treat localStorage as client-side cache/presentation state only, never as trusted authoritative memory.
- Move authoritative memory to a server-controlled, access-scoped Knowledge & Memory Manager only after authentication and privacy controls exist.
- Preserve existing keys `sofia-chat-v3` and `sofia-avatars-v1` during migration unless a tested migration is approved.
- Define export, backup, restore, correction, retention, and deletion propagation.
- Bind memory reads to purpose and authenticated principal; do not attach unrelated memory to prompts.

**Foundation mapping:** Knowledge & Memory Manager; API Gateway & Session Manager; Identity & Authentication Manager.

### A-09 — Missing independent verifier and audit/test foundation

**Observed:** The audit found no implemented independent verifier, comprehensive audit layer, or adequate automated test foundation.

**Mandatory controls:**
- Treat model-generated plans and claims as proposals, not verified facts.
- Add independent verification for consequential outputs and task completion.
- Record security decisions, permission changes, provider calls, module lifecycle, and task outcomes with privacy-minimized audit events.
- Establish unit, contract, integration, security, regression, and Android device tests.
- Keep test results tied to commit, schema, adapter, and policy versions.
- Do not mark a feature complete based only on documentation or a successful happy-path demo.

**Foundation mapping:** Task Orchestrator; Audit & Observability Manager; AI Evaluation & Quality Manager; contracts and test gates.

### A-10 — Static asset root exposure risk

**Observed:** The audit flagged `wrangler.jsonc` asset configuration with `assets.directory: "."` as a potential risk of publishing repository-root files.

**Mandatory controls:**
- Treat root-directory asset publication as a release blocker until a complete exposure review is performed.
- Define a dedicated public asset directory containing only explicitly approved static files.
- Denylist secrets, source maps where inappropriate, environment files, repository metadata, configuration, backups, and internal documentation.
- Test the built/deployed asset manifest and probe for forbidden paths.
- Verify actual deployed behavior; do not assume ignore rules alone are sufficient.
- Do not alter current deployment configuration during this architecture phase.

**Foundation mapping:** API Gateway & Session Manager; release/security checklist; deployment acceptance tests.

### A-11 — Provider secret state not verified

**Observed:** The audit could not establish that the Cloudflare secret binding was correctly configured and operational. This is an unverified condition, not proof that the secret is absent or exposed.

**Mandatory controls:**
- Keep provider keys in server-side secret bindings or an approved secret manager.
- Verify presence and functionality through a safe server-side health check that never returns or logs the secret.
- Separate secret availability from provider connectivity and quota status.
- Rotate/revoke credentials through an auditable procedure.
- Never commit secrets, include them in client assets, or print them in diagnostics.
- Treat unknown secret status as unverified until an authorized operational check is completed.

**Foundation mapping:** AI Provider Gateway; API Gateway & Session Manager; deployment checklist.

## 3. Cross-cutting release gates

No production/public release may proceed until all applicable gates pass:

1. **Identity:** authentication and session revocation tested.
2. **Authorization:** route/capability scopes and deny-by-default behavior tested.
3. **Abuse/cost:** rate limits, quotas, concurrency, token and spend caps tested, including emergency stop.
4. **Input boundary:** strict schemas, role restrictions, body/message/attachment limits tested.
5. **Provider boundary:** server-owned prompts, secret isolation, provider response validation, safe fallback tested.
6. **Reliability:** deadlines, cancellation, retries, circuit breakers, and typed failure behavior tested.
7. **Assets:** public asset manifest reviewed; root exposure probes pass.
8. **Memory:** authoritative memory protected by identity, purpose, retention, backup, and deletion controls.
9. **Audit:** security and execution events traceable without sensitive payload leakage.
10. **Verification/tests:** independent verification and automated test suites pass.
11. **Migration:** existing chat history/avatar compatibility, backup, rollback, and data integrity verified.
12. **Android:** permission, lifecycle, battery, audio, and device integration tested on target devices.

A release gate is not passed by a design document. It requires implementation evidence and recorded test results.

## 4. Current remediation status

At the time this register is added:
- The audited production prototype has not been modified by this architecture work.
- API Gateway, Security, IAM, provider, runtime, memory, orchestration, audit, evaluation, and voice architecture documents/contracts exist on `foundation/bootstrap`.
- The API Gateway specification explicitly identifies client-supplied system instructions as an untrusted boundary.
- No claim is made that authentication, rate limiting, spend controls, static asset isolation, secret verification, or fault handling are already implemented in production.
- The static asset root exposure and secret-binding status remain operational verification items.
- Implementation must proceed on a feature branch with tests and review before any production change.

## 5. Change-control rule

Every new architecture component and implementation PR must:
- identify relevant audit IDs A-01 through A-11;
- state which findings it mitigates and which remain open;
- include negative/security tests for applicable boundaries;
- preserve the prototype until migration is explicitly approved;
- update this register only with evidence-backed status changes.

No finding may be closed solely because a related schema or design document was created.
