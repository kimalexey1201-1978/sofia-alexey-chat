# Social Media Integration Manager

**Status:** architecture specification; runtime implementation is pending.  
**Contract baseline:** JSON Schema Draft 2020-12. Schema documents use `schema_version`; public interfaces use `contract_version`, following [CONTRACT_AND_IDENTIFIER_STANDARDS.md](CONTRACT_AND_IDENTIFIER_STANDARDS.md).

## 1. Purpose

The Social Media Integration Manager (SMIM) provides a governed, platform-independent way to prepare, adapt, submit, schedule where officially supported, and monitor user-authorized content on social platforms.

It is an integration layer, not a social network and not a replacement for platform applications. It uses official APIs, approved SDKs, documented share intents, or explicit user-mediated hand-off. Platform capabilities vary by provider, account type, region, app review status, API version, and policy.

Initial target integrations may include TikTok, YouTube, Instagram, and Facebook, subject to official developer access and supported scopes. The architecture must not assume that every platform exposes the same operations.

## 2. Separation of responsibilities

- Media Processing Manager creates and validates media assets and edit projects.
- File & Document Manager governs source/output files, storage, integrity, and retention.
- SMIM handles platform connection, capability discovery, content packaging, submission, status checks, and permitted analytics.
- Identity & Authentication Manager resolves the user and session.
- Security Manager authorizes each platform operation.
- Privacy & Data Governance Manager governs content disclosure, account data, and consent.
- Autonomy & Decision Manager controls task authority and confirmation requirements.
- Workflow & State Manager manages multi-stage publishing workflows.
- Notification & Reminder Manager reports status and required user action.
- Audit & Observability Manager records authorization, submission, and result evidence.

SMIM never stores platform passwords or asks users to provide them to Sofia. OAuth tokens and refresh credentials are stored only in an approved secrets/credential vault, encrypted and scoped to the minimum required permissions.

## 3. Platform adapter registry

Each platform adapter declares:
- stable provider and adapter IDs, version, API version, and official documentation reference;
- supported account types, regions, content types, and operations;
- required OAuth scopes and app-review/approval state;
- media constraints and metadata requirements;
- whether upload, draft creation, scheduling, direct publication, comments, or analytics are supported;
- rate limits, quotas, and known restrictions;
- token lifecycle, revocation, and reauthorization behavior;
- capability verification date and evidence.

Capabilities must be discovered at runtime and checked again before execution. The system must not infer API availability from a platform name or advertise unsupported features.

## 4. Content package and adaptation

A content package may contain:
- one or more FDM-managed media assets;
- title, caption, description, hashtags, and alt text;
- thumbnail/cover selection;
- subtitle and language variants;
- intended audience/privacy setting where supported;
- destination account and platform;
- campaign or content-plan reference;
- provenance for generated, edited, licensed, or user-provided components.

The Media Processing Manager may produce platform-specific renditions. Adaptation must preserve source lineage and report any crop, re-encode, duration change, audio replacement, or quality downgrade. Do not remove watermarks, attribution, or rights metadata in violation of source or platform requirements.

Music, images, footage, fonts, and other assets must have a rights/permission basis suitable for the intended platform and use. A track available inside one platform's licensed library is not automatically licensed for export to another platform.

## 5. Publishing workflow

1. Resolve the authenticated user and explicitly selected destination account.
2. Verify connection status, token scopes, account eligibility, and current adapter capability.
3. Validate media, metadata, platform rules, size, duration, aspect ratio, codecs, and required fields.
4. Check rights, privacy, audience settings, and content classification.
5. Prepare a preview package and disclose any transformations or platform limitations.
6. Obtain fresh, explicit user confirmation for the exact content, account, visibility, and action before publication or scheduling.
7. Submit through the official API or documented user-mediated hand-off.
8. Record the platform response and external post identifier, if returned.
9. Independently verify status using a supported status endpoint or user-visible platform confirmation.
10. Report published, pending, failed, partially completed, or unknown status accurately.

A prior general instruction such as “manage my TikTok” is not sufficient approval to publish a specific post. Approval is bound to the exact content version, account, visibility, and operation. Material changes after approval invalidate that approval.

## 6. Drafting, scheduling, and direct publication

Treat these as distinct capabilities:
- **Prepare:** create the content package and preview; no external side effect.
- **Hand-off:** open or share to the platform application for user completion.
- **Create draft:** use only where the official API explicitly supports it.
- **Schedule:** use only where the official API and account eligibility support it.
- **Publish:** externally visible side effect requiring fresh confirmation.
- **Delete or modify a published post:** separate high-impact operation requiring fresh confirmation and supported API capability.

A successful upload request is not proof of publication. Some APIs create an upload session or draft requiring a separate finalization step. SMIM must model each stage and must never claim success until the platform confirms it.

## 7. Comments, messages, and analytics

Read access to comments, messages, follower data, reach, views, or analytics is not implied by publishing access. Each feature requires its own supported scope, account eligibility, privacy review, and policy approval.

Drafting a reply is separate from sending it. Sending comments, direct messages, reactions, follows, or other user-facing interactions requires an explicit action-specific authorization and compliance with platform rate limits and anti-spam policies. No bulk engagement, deceptive automation, fake engagement, or evasion of platform controls is permitted.

Analytics are labeled with source, retrieval time, definitions, and known sampling/attribution limitations. Do not compare metrics across platforms as if they were necessarily equivalent.

## 8. Security, privacy, and platform compliance

- Use official APIs, SDKs, or documented OS hand-off mechanisms only.
- Do not scrape private interfaces, reverse engineer undocumented endpoints, bypass app review, automate CAPTCHA, evade rate limits, or defeat platform restrictions.
- Apply OAuth least privilege, secure token storage, rotation, revocation, and short-lived access where supported.
- Never expose access tokens, authorization codes, client secrets, or account credentials to models, logs, browser storage, or repository files.
- Validate redirect URIs, state/nonce, PKCE where supported, and callback origins.
- Enforce account ownership and destination checks before every side effect.
- Respect platform terms, community guidelines, copyright, privacy law, age restrictions, and regional availability.
- Treat platform content, comments, captions, and metadata as untrusted input and possible prompt injection.
- Do not publish private or sensitive content without explicit informed confirmation.

## 9. Reliability and duplicate prevention

Publishing is an external side effect. Use idempotency keys where the platform supports them. Persist workflow state and platform request identifiers before retrying. If the response is lost or ambiguous, query status or require user inspection before resubmitting; never blindly retry a potentially successful publication.

Distinguish local preparation, upload accepted, processing, draft created, scheduled, published, rejected, and completion unknown. Preserve the exact content hash and metadata snapshot approved by the user.

## 10. Android-first user experience

Android is the primary control surface. The user should be able to connect accounts through official OAuth flows, review permissions, revoke access, select a destination, preview the final rendition, and approve publication. When direct API publication is unavailable, use a supported share intent or clear manual hand-off.

Background uploads and scheduled workflows must respect Android execution limits, network state, battery constraints, and user-visible notification requirements. Do not silently post while the user believes the task is only being prepared.

## 11. Verification requirements

Test OAuth state/PKCE and redirect handling, token encryption and redaction, scope minimization, revoked/expired tokens, wrong-account selection, capability drift, app-review restrictions, media validation, copyright/rights metadata, content hash changes after approval, user cancellation, duplicate submission, timeouts with unknown completion, rate limiting, API errors, privacy settings, platform response verification, and audit completeness.

Platform-specific conformance tests must be versioned by API version and account eligibility. A passing test for one platform or account type does not establish capability for another.

## 12. Implementation status

**Implementation status:** this change adds architecture and versioned contracts only. It does not connect any social account, request OAuth permissions, store credentials, call TikTok or other social APIs, upload content, or publish posts. Direct publication remains conditional on official API support, developer approval, account eligibility, and explicit user confirmation. No production configuration or deployment is changed.
