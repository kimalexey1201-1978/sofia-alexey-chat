# Personalization & User Profile Manager

**Status:** architecture specification; runtime implementation is pending.  
**Contract baseline:** JSON Schema Draft 2020-12. Schema documents use `schema_version`; public interfaces use `contract_version`, following [CONTRACT_AND_IDENTIFIER_STANDARDS.md](CONTRACT_AND_IDENTIFIER_STANDARDS.md).

## 1. Purpose and boundaries

The Personalization & User Profile Manager (PUPM) maintains user-controlled profile settings and applies approved preferences to Sofia's interaction style, defaults, accessibility, locale, device presentation, and workflow behavior.

It separates explicit user settings from observed behavior and model-generated inferences. It is not a general-purpose memory store and does not replace Knowledge & Memory Manager, Identity & Authentication Manager, Privacy & Data Governance Manager, Security Manager, or Autonomy & Decision Manager.

The manager may supply relevant, permitted preferences to a task or response. It cannot change security policy, grant permissions, raise autonomy, authorize external actions, or override explicit instructions in the current interaction.

## 2. Profile data classes

Profile data is separated into distinct namespaces:
- **Explicit preferences:** directly stated or affirmatively selected by the user.
- **Accessibility settings:** user-configured presentation or interaction accommodations.
- **Locale settings:** language, timezone, regional formats, and units.
- **Interaction defaults:** preferred verbosity, tone, and response format.
- **Device and channel preferences:** selected devices, notification channels, and presentation defaults.
- **Inferred preferences:** tentative patterns inferred from behavior; isolated from explicit settings and never silently promoted to confirmed facts.
- **Operational metadata:** version, timestamps, provenance, and lifecycle state.

Sensitive personal data and special-category information are not collected as ordinary personalization fields. If a supported feature genuinely requires such data, it must use a separate purpose-specific, consented, access-controlled data flow governed by Privacy & Data Governance. The profile manager must not infer sensitive traits to personalize responses.

## 3. Source, provenance, and confidence

Every profile item records its source type, provenance reference, creation/update time, confidence where inference is involved, and confirmation state.

Source types include explicit_user_statement, user_setting, imported_with_consent, and inferred. Inferred items must include a rationale/provenance reference, confidence, expiry or review date, and a clear unconfirmed status.

A model-generated inference is not a user statement. It must not be represented as an explicit preference, used for high-impact decisions, or used to make sensitive inferences. Low-confidence or stale inferred items should be ignored or surfaced for confirmation only when materially useful.

## 4. User control and precedence

Users can inspect, correct, confirm, disable, export, and delete profile items through authenticated controls. A user correction supersedes the conflicting profile value and records the correction provenance without retaining unnecessary historical sensitive content.

Precedence:
1. current explicit instruction in the active interaction;
2. explicit user-controlled setting with applicable scope;
3. confirmed explicit profile preference;
4. permitted, current inferred preference as a low-confidence default;
5. system default.

Safety, privacy, platform, and authorization policies take precedence over all personalization. Personalization is a defaulting mechanism, not a command authority.

## 5. Scope and applicability

Profile items may be scoped to account, device, channel, application, task category, or interaction context. A device-specific preference must not silently become a global preference. The runtime resolves scope and conflicts deterministically and records the applied profile-item references for explainability where appropriate.

Temporary preferences have expiry. Contextual preferences must not leak into unrelated tasks. Shared-device sessions require authenticated principal separation; one person's preferences must never be applied to another person's session.

## 6. Privacy, consent, and retention

Apply purpose limitation, minimization, classification, consent, access control, retention, export, and deletion. Do not store credentials, authentication secrets, or unnecessary raw conversation content in profile records.

Profile storage must be encrypted at rest and in transit where supported, access-controlled, and auditable. External AI providers receive only the minimum preference context needed for the task, subject to provider eligibility and data-classification policy.

Deletion and correction must propagate to caches, derived profile items, indexes, and downstream copies where technically and contractually supported. If downstream deletion cannot be confirmed, report the limitation rather than claiming complete erasure.

## 7. Runtime resolution

For each interaction:
1. authenticate the principal and determine session/device scope;
2. retrieve only profile categories permitted for the current purpose;
3. filter expired, revoked, unconfirmed, or out-of-scope items;
4. apply precedence and resolve conflicts;
5. provide a minimal preference projection to the relevant module;
6. record references to applied settings without copying unnecessary profile content.

If profile storage is unavailable, continue with safe system defaults rather than blocking ordinary interaction. Security- or accessibility-critical settings may require an explicit fallback policy.

## 8. Migration and compatibility

Existing client-side settings or local storage may be migrated only through a versioned, reversible process. Preserve existing chat history and storage keys; do not reinterpret conversation history as confirmed profile facts. Imported values require provenance and, where necessary, user confirmation.

Profile schema changes use explicit versions and migration adapters. Unknown versions fail closed for writes and use safe defaults for optional personalization.

## 9. Audit and verification

Audit profile creation, updates, confirmation, scope changes, access, export, deletion, and policy denials. Avoid logging raw profile values where a reference and change category suffice.

Tests must cover precedence, scope isolation, shared-device separation, inference/explicit-source separation, stale/expired values, user correction, consent revocation, deletion propagation, provider minimization, schema migration, storage outage fallback, and attempts by model output to alter profile or authority settings.

## 10. Integration and implementation status

PUPM supplies profile projections to Sofia Core and eligible modules. Knowledge & Memory Manager remains responsible for governed memory items; PUPM stores structured preferences and profile settings. Privacy & Data Governance defines allowed data use; Security Manager controls access; Identity & Authentication resolves the principal.

**Implementation status:** this document defines architecture only. No profile database, settings UI, inference pipeline, preference resolver, migration job, or automated tests are implemented by this change. No production configuration or deployment is changed.
