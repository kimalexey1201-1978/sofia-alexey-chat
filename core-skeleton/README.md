# Sofia Core Skeleton v1

An isolated, dependency-free architecture prototype. This directory is not imported by the current chat UI or Cloudflare Worker.

## Scope

- Validate a versioned task envelope.
- Select an enabled executor by declared capability.
- Route execution through an injected gateway.
- Require authorization before execution.
- Pass results to an independent verifier.
- Return a normalized task result.

## Non-goals

- No provider credentials or network calls.
- No persistence or memory implementation.
- No production authentication or authorization policy.
- No changes to `index.html`, `_worker.js`, or `wrangler.jsonc`.

## Layout

- `src/contracts/task-envelope.mjs`: input validation.
- `src/registry/agent-registry.mjs`: capability-based executor lookup.
- `src/gateway/executor-gateway.mjs`: bounded execution boundary.
- `src/core/orchestrator.mjs`: task lifecycle coordination.
- `test/core.test.mjs`: Node.js built-in tests.

## Run tests

Requires Node.js 20 or newer:

```sh
node --test core-skeleton/test/*.test.mjs
```

## Integration gate

Do not connect this prototype to the live chat until contracts, security policy, cancellation semantics, persistence, and regression tests have been reviewed. Production permissions must be derived server-side; client-provided permission fields are untrusted.
