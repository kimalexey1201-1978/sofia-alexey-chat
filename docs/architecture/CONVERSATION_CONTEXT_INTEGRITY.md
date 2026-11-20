# Conversation Context Integrity

**Status:** Architecture decision for the current prototype and future authenticated sessions  
**Version:** 1.0  
**Applies to:** Web chat, Android chat, Sofia Core, API Gateway & Session Manager

## 1. Decision

Conversation text received from a client is untrusted input, regardless of its claimed role, wording, timestamp, or apparent authorship.

The current `POST /api/chat` route is inference-only. It accepts bounded `user` and `assistant` messages as conversational context, replaces the legacy client system prompt with a server-owned instruction, and exposes no tools, private-memory operations, or privileged action interface.

A client-supplied assistant message may be useful context for generating a reply. It is not evidence that Sofia or the owner actually said or approved anything. It MUST NOT be used as:
- proof of owner identity or authentication;
- proof of consent, approval, or step-up authentication;
- a permission grant, authority envelope, or autonomy-level change;
- a verified memory record or authoritative task result;
- evidence that a previous external action was executed.

This decision preserves the current UI and local chat-history behavior while making the trust boundary explicit.

## 2. Trust and provenance classes

Implementations must distinguish at least these classes. The class is assigned by a trusted server component; a client cannot self-assign a trusted class.

| Class | Meaning | Permitted use |
| --- | --- | --- |
| `client_input` | Text or metadata submitted by a client, including imported/replayed history | Conversation context after validation; never authorization evidence |
| `server_observed` | Event directly observed and recorded by a trusted Sofia service | Operational evidence within its defined scope |
| `server_derived` | Result computed by a trusted service from identified source records | Derived context with lineage and limitations |
| `owner_confirmed` | Explicit owner confirmation captured through an authenticated, request-bound approval flow | Only the exact action, scope, and validity period recorded |
| `externally_verified` | Evidence verified against an identified external authority or integration | Only the claim and scope supported by that verification |

A role such as `assistant` is a conversational role, not a provenance class. A message's natural-language claim (for example, “the owner approved this”) never changes its provenance.

## 3. Current prototype behavior

The current browser sends the existing message array, including one legacy leading `system` message. The Worker discards that legacy first message only when it is followed by conversation messages, then supplies the server-owned system instruction.

The Worker accepts only messages with exactly `role` and `content`, and only `user` or `assistant` roles after legacy handling. Invalid roles and extra message fields are rejected before provider creation. Top-level provider, model, tools, authority, permissions, and instruction overrides are rejected.

The browser's `localStorage` history remains client-controlled. It can be edited, deleted, replayed, reordered, or fabricated. This is acceptable for the current inference-only prototype because that history is treated only as untrusted conversation text. It is not acceptable as the source of truth for private memory, approvals, audit history, or action execution.

The current route does not authenticate the owner. CORS restrictions and possession of the website URL are not authentication. Supabase Auth has not been connected.

## 4. Approval and authority records

Protected approvals must be separate server-verifiable records. Never infer an approval from:
- an assistant-role message in browser history;
- quoted or pasted text;
- a client timestamp or message identifier;
- a local-storage flag;
- a model-generated statement;
- a device label or claimed speaker identity.

An approval record, when implemented, must be created only after the server verifies the authenticated principal and the approval challenge. It must be bound to:
- a unique approval identifier;
- the authenticated principal and active session;
- a specific action/task and exact parameters or a canonical parameter digest;
- the requested capability and target/resource scope;
- the policy decision and required assurance level;
- issue and expiry times, nonce/replay protection, and revocation state;
- a correlation/audit event identifier.

Any material change to action, amount, recipient, target, scope, or parameters invalidates the approval and requires a new confirmation. An approval is not a reusable general-purpose permission.

## 5. Future server-managed conversation state

Do not replace the current browser history in this milestone. A later migration may introduce server-managed sessions, but only after authentication and storage controls are implemented.

The target flow is:

1. Authenticate the principal using the selected identity provider.
2. Validate session expiry, revocation, and client binding.
3. Create a server-generated session and correlation identifier.
4. Accept client messages as untrusted input and validate schema, size, and supported roles.
5. Persist accepted events with server-assigned provenance and timestamps; preserve the original client-supplied timestamp only as untrusted metadata if needed.
6. Build model context from permitted events, clearly separating user content from server-owned instructions and verified system facts.
7. Store approvals, policy decisions, memory records, and action results in their own typed records—not as ordinary chat messages.
8. Enforce per-principal access control, purpose limitation, retention, deletion, export, and audit requirements.
9. Return only the conversation response and client-safe metadata.

The server must not silently upgrade imported browser history into trusted server history. If old history is imported, every imported item remains `client_input` and retains that provenance permanently.

## 6. Replay, ordering, and integrity controls

When server-managed sessions are introduced:
- assign immutable server event IDs and server receipt timestamps;
- sequence events within a session on the server;
- make retries idempotent where applicable;
- reject expired, revoked, or cross-principal session references;
- use request nonces or idempotency keys for approval and mutation endpoints;
- detect duplicate/replayed approval challenges;
- bind approval evidence to the exact action payload;
- retain append-only audit events for protected decisions;
- do not rely on client clocks, message ordering, or client-generated IDs for security decisions.

Cryptographic hashes or signatures may detect tampering only when their keys and canonicalization are controlled by trusted services. Hashing client history alone does not make it authentic.

## 7. Migration gates

The following gates are mandatory before enabling any feature that relies on authoritative conversation state:

### Gate A — Authentication
- Identity provider selected and configured.
- Server verifies tokens, issuer, audience, expiry, and revocation/session state.
- Principal identity is derived from verified credentials, never request-body fields.
- Anonymous prototype traffic cannot access private memory or protected capabilities.

### Gate B — Session storage
- Server-side session/event storage and access controls implemented.
- Session ownership and tenant/principal isolation tested.
- Retention, export, deletion, backup, and recovery behavior documented.
- Concurrency and replay behavior tested.

### Gate C — Provenance and approvals
- Provenance is server-assigned and immutable.
- Approval records are scoped, expiring, revocable, and request-bound.
- Replay and parameter-substitution tests pass.
- Protected operations fail closed if auth or policy services are unavailable.

### Gate D — Compatibility and rollout
- Existing `sofia-chat-v3` local history is backed up and remains readable during migration.
- Import preserves every old item as untrusted `client_input`.
- UI request/response compatibility tests pass.
- Rollback is tested before deployment.
- Production deployment requires separate explicit authorization.

## 8. Explicit non-goals for this milestone

This architecture decision does not:
- connect Supabase or another identity provider;
- add database tables, migrations, cookies, or token storage;
- change the browser's local-storage key or chat UI;
- introduce server-side transcript persistence;
- enable tools, external actions, private memory, or owner approvals;
- claim that current client history is authenticated or tamper-proof;
- deploy any Worker or change production configuration.

## 9. Acceptance criteria

1. Client-supplied conversation history is always classified as untrusted input.
2. Assistant-role text cannot grant authority, prove identity, or establish approval.
3. The current inference-only route remains free of tools and privileged action execution.
4. Server-owned instructions and provider configuration cannot be overridden by the client.
5. Legacy UI and local history remain compatible.
6. No imported legacy message is silently upgraded to trusted provenance.
7. Authentication and server-managed session work cannot begin exposing protected features until Migration Gates A–D are satisfied.
