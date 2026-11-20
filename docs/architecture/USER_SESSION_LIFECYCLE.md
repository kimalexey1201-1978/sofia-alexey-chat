# User Session Lifecycle

**Status:** Contract and lifecycle decision  
**Version:** 1.0  
**Applies to:** API Gateway & Session Manager, IAM, Android and Web clients

## 1. Purpose and boundary

The `user-session.schema.json` contract describes a server-issued authenticated session. It does not implement authentication, token validation, persistence, or session revocation.

A session ID is a reference, not a credential. A client cannot authenticate by submitting a session ID, principal ID, device ID, assurance level, or a session object. Trusted fields must be derived or verified by the server from the configured identity provider and server-side session store.

The current Sofia prototype remains unauthenticated. This contract is preparatory only; no protected capability may rely on it until the authentication and storage gates are implemented.

## 2. Lifecycle states

| State | Meaning | Permitted behavior |
| --- | --- | --- |
| `active` | Server has validated the identity-provider credential and session is within idle and absolute expiry limits | Ordinary authenticated requests within granted scope |
| `reauthentication_required` | Session exists but assurance or freshness is insufficient for the requested operation | Only reauthentication/step-up flow; protected operation is blocked |
| `expired` | Idle or absolute expiry reached | No authenticated access; new authentication required |
| `revoked` | Server or identity provider invalidated the session | No access; reauthentication required |
| `closed` | Session ended through an explicit supported closure event | No access; reauthentication required |

Terminal states are `expired`, `revoked`, and `closed`. They must never transition back to `active`. Reauthentication creates a new session identifier.

## 3. Creation

1. Receive an identity-provider credential over TLS.
2. Validate signature or introspection result, issuer, audience, expiry, not-before, and required claims.
3. Resolve the principal from verified claims; ignore any client-supplied principal identifier.
4. Apply account status, risk, client, and device policy.
5. Generate a cryptographically random server-side session identifier.
6. Store session state and credential references server-side; never store raw bearer or refresh tokens in the session record or logs.
7. Record authentication assurance, authentication time, expiry limits, and correlation ID.
8. Return only client-safe session metadata and credentials using the identity provider's supported secure flow.

The initial implementation must use the identity provider's supported token lifecycle rather than inventing a custom refresh-token protocol.

## 4. Validation on each request

The gateway must:
- validate the presented credential independently of any body fields;
- resolve the session from server-side storage;
- verify principal/session binding and client policy;
- reject unknown, expired, revoked, or closed sessions;
- enforce both idle expiry and absolute expiry;
- require step-up when the operation's policy requires stronger assurance or fresher authentication;
- check policy and capability scope separately from authentication;
- fail closed if identity or session state cannot be verified.

A successful authentication does not imply authorization for every capability.

## 5. Expiry and renewal

- `expires_at` is the current idle/session expiry, and must not exceed `absolute_expires_at`.
- `absolute_expires_at` is fixed at session creation and cannot be extended by ordinary activity.
- `last_seen_at` is updated only after a request passes authentication and basic request validation; invalid traffic must not keep a session alive.
- Idle expiry is computed server-side using the configured timeout.
- Renewal must not extend the absolute lifetime.
- Long-lived or sensitive operations must re-check session validity at execution time, not only when the task was submitted.

Exact timeout values are policy configuration and are intentionally not hard-coded by this schema.

## 6. Reauthentication and step-up

When assurance is insufficient or authentication is too old:
1. transition the session to `reauthentication_required` or deny the operation pending step-up;
2. create a single-use, short-lived challenge bound to the session, principal, operation, and request parameters;
3. verify the response through a supported identity-provider or platform authentication mechanism;
4. record the new authentication context and assurance;
5. permit only the specifically approved operation if all policy checks pass.

Voice/speaker matching alone is not sufficient proof for high-risk actions. Explicit confirmation and an approved strong authentication method are required according to policy.

## 7. Rotation and replay resistance

- Credential rotation is performed through the identity provider's supported mechanism.
- Keep only opaque references or protected hashes in server-side records; never expose stored credential material.
- Detect refresh-token reuse when the provider supports rotation/reuse detection.
- On confirmed reuse, revoke the affected token family/session and require fresh authentication.
- Use single-use nonces or idempotency keys for state-changing approval and session-management requests.
- Bind step-up challenges to exact operation parameters; changed parameters require a new challenge.
- Do not use client timestamps or local storage as replay protection.

## 8. Revocation and closure

Revocation sources include owner security action, explicit logout where supported, identity-provider revocation, credential reuse detection, and risk policy.

Revocation must:
- atomically mark the server-side session terminal;
- invalidate associated refresh credentials through the provider where supported;
- prevent new requests and re-check long-running operations before consequential execution;
- emit a redacted audit event with actor, reason, session reference, and correlation ID;
- never expose secrets in audit metadata.

Closing a session is a distinct lifecycle event for normal logout or replacement. Terminal sessions remain immutable for audit; create a new session rather than reopening one.

## 9. Multi-device and concurrent sessions

Each authenticated client installation/session receives its own session ID. A device reference is metadata unless cryptographically bound by a supported device credential. Device names, user-agent strings, and client-supplied device IDs are not authenticators.

Policy may limit concurrent sessions, revoke one device, or revoke all sessions for a principal. Revocation scope must be explicit and auditable. Do not silently treat one device's logout as global logout unless the owner selected that action or policy requires it.

## 10. Required audit events

At minimum, record:
- `session.created`
- `session.authentication_failed`
- `session.reauthentication_required`
- `session.renewed`
- `session.credential_rotated`
- `session.expired`
- `session.revoked`
- `session.closed`
- `session.replay_detected`

Audit records contain references and safe reason codes, not raw tokens, cookies, passwords, biometric templates, or full request bodies.

## 11. Implementation gates

Do not implement or enable authenticated session behavior until:
1. an identity provider is selected and configured;
2. server-side storage and atomic state transitions are available;
3. issuer/audience/signature/expiry validation is tested;
4. session ownership isolation and revocation are tested;
5. refresh/rotation/replay behavior is documented for the selected provider;
6. secure client storage and logout behavior are designed for Android and web;
7. migration, backup, recovery, and rollback are tested.

Supabase Auth remains a candidate integration, not a connected dependency. Its project creation and configuration are intentionally deferred.

## 12. Explicit non-goals

This milestone does not connect an identity provider, create database tables, store user credentials, add cookies or browser tokens, modify the current chat route, alter local chat history, or deploy any service.
