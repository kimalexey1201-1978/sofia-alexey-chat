# Deployment & Release Security Manager

Status: architecture specification; implementation and deployment verification are pending.
Scope: build provenance, deployment configuration, asset exposure, secret bindings, environment separation, release authorization and rollback.
This specification does not change the current Worker, deployment configuration, production branch or live service.

## 1. Security objectives

A release must be traceable to reviewed source, reproducible build inputs, an approved configuration and explicit authorization. The deployed artifact must expose only intended public assets and must never contain provider credentials or private operational data.

Core invariants:
- No deployment from an unreviewed or dirty working tree.
- No production deployment directly from an unprotected development branch.
- No secret value in source, client bundles, build artifacts, logs, test evidence or commit metadata.
- Build artifacts are immutable after verification; a changed artifact requires a new verification.
- The exact artifact digest and configuration revision are bound to the release record.
- Rollback must restore a known-good application/configuration pair without silently rolling back security policy or data protections.
- A green build is not deployment authorization.

## 2. Environment separation

Maintain distinct development, test, staging and production environments with separate credentials, data stores, provider quotas and access policies. Production credentials must not be available to untrusted pull-request jobs or fork builds.

Staging should mirror production security-relevant configuration while using synthetic or explicitly sanitized data. Production verification is read-only by default. Any controlled write probe must be separately approved, bounded and reversible.

## 3. Build provenance and integrity

For each release candidate, record:
- repository, source commit and branch/tag;
- clean/dirty state and reviewed change reference;
- build workflow identity and run ID;
- pinned toolchain and dependency lockfile digests;
- build artifact name, type, size and SHA-256 digest;
- configuration revision/digest, excluding secret values;
- test-run and verification-evidence references;
- build timestamp and signing/attestation reference where supported.

The release process must verify artifact digests after upload and immediately before deployment. A mismatch blocks release. SHA-256 proves byte identity relative to a recorded digest; it does not prove that source or artifact is benign.

## 4. Static asset exposure control — audit A-10

The existing prototype configuration uses an assets directory rooted at the repository root. This is an exposure risk that must be tested against the actual deployment output; it is not proof that every repository file is currently publicly accessible.

Before changing the existing configuration:
1. Enumerate all files included in the current deployment artifact.
2. Classify each path as public, internal, confidential or restricted.
3. Create an explicit public asset allow-list and build output directory.
4. Add negative tests that attempt to retrieve source files, configuration, maps, manifests, test fixtures, private documents and other non-public paths.
5. Verify content types, cache policy, path normalization and encoded traversal cases.
6. Compare staging behavior to the approved allow-list.
7. Only then propose a reviewed configuration change with rollback.

Never copy server source, secret files, test reports or private data into the public asset directory. Do not assume a file is safe merely because it has a static extension.

## 5. Secret binding verification — audit A-11

Provider credentials such as `OPENROUTER_API_KEY` must be stored only in the deployment platform's secret-binding facility and accessed only in server runtime. The model name/configuration may be non-secret but still requires validation and environment control.

Verification requirements:
- Check that the expected secret binding is configured without retrieving or printing its value.
- Use a deployment-safe presence/availability probe that returns only a boolean or opaque status.
- Confirm the key is absent from client bundles, repository history, logs, error messages and test artifacts.
- Verify least-privilege access to deployment settings and rotation procedures.
- Rotate credentials after suspected exposure and invalidate the prior value.
- Never place secret values in schema examples, issue reports, screenshots or evidence artifacts.

The audit finding A-11 remains "unverified" until safe binding-state evidence exists. Do not interpret lack of evidence as proof that a secret is missing or exposed.

## 6. Worker/API deployment controls

For the current Worker gateway and future services:
- Keep system/developer policy instructions server-owned; reject client attempts to set privileged roles or override provider/tool/authority configuration.
- Validate origin and apply CSRF protection where browser credentials/cookies are used.
- Enforce authentication, authorization, request bounds, per-principal/global rate limits and spend quotas before provider calls.
- Set independent request and provider deadlines; do not leak stack traces or secret-bearing upstream errors.
- Apply security headers and explicit cache controls to sensitive responses.
- Log security events with correlation IDs and redacted metadata, not full private prompts by default.
- Verify health/readiness separately from user-facing provider functionality.

These are target controls; the current prototype must be tested and remediated before they can be considered active.

## 7. Deployment authorization workflow

A release candidate must pass the applicable G0–G6 gates defined in the Test & Verification Framework. G7 requires explicit human authorization bound to:
- exact candidate commit;
- exact artifact digest;
- target environment;
- deployment/configuration revision;
- approved change scope and rollback plan.

Authorization for one candidate does not authorize a later commit, rebuilt artifact or different environment. Any material change invalidates the prior approval.

## 8. Rollback and recovery

Maintain a known-good release pointer and tested rollback procedure. Rollback must:
- verify the target artifact and configuration digests;
- restore compatible application/configuration versions;
- preserve user data and avoid destructive schema downgrade;
- record who initiated it, why and what was restored;
- trigger post-rollback health and security checks.

If data migration is not backward-compatible, use a forward-fix or a separately tested recovery procedure rather than blindly reverting application code.

## 9. Incident response

For suspected credential exposure, unauthorized deployment, public data exposure or artifact tampering:
1. Stop further releases and revoke/rotate affected credentials.
2. Preserve relevant audit metadata without copying secrets or unnecessary personal data.
3. Identify affected commits, artifacts, environments and time window.
4. Contain exposure and restore a verified known-good release.
5. Assess user/data impact and required notifications.
6. Add regression tests and record remediation evidence before resuming release flow.

## 10. Current status

This document is a design specification only. No deployment configuration has been changed, no secret binding has been inspected or verified, and no production release has been performed by this work. A-10 and A-11 remain open pending implementation and evidence.
