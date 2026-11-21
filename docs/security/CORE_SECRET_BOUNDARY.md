# Sofia Core secret boundary

## Decision

All provider credentials and future privileged secrets remain in server-side Cloudflare Worker Secret bindings. They are not stored in browser storage, Android resources, repository files, executor manifests, or provider adapter configuration.

Only trusted Sofia Core server code may turn a server-side secret into a narrowly scoped capability. Provider adapters and executor modules must never receive:
- the Worker `env` object;
- a raw API key, password, token, or signing key;
- a general-purpose secret-store client.

## Provider credential flow

For OpenRouter, the trusted `src/core/provider-credential-port.mjs` module reads the Worker environment and creates a request capability. That capability:
- permits only HTTPS POST requests to the exact OpenRouter chat-completions endpoint;
- accepts only JSON request bodies within an 8 MiB bound;
- injects the Authorization header internally and overwrites caller-supplied authorization;
- forwards only the explicitly permitted provider metadata headers;
- rejects redirects and disables browser credentials, caching, and referrer propagation;
- never returns the secret or exposes it through provider configuration.

The OpenRouter adapter receives only this function as `fetchImpl`. It has no API-key parameter and cannot select a different destination through the capability. Image analysis uses the same boundary.

## Required review rules for future executors

1. Do not pass `env`, a secret-store binding, or raw credentials to an executor/provider.
2. Do not add generic `getSecret(name)` methods to executor interfaces.
3. Grant a capability per provider/action, with a fixed destination, method, data shape, size limit, and lifetime where practical.
4. Keep provider secrets separate by provider and environment; Preview credentials must never be copied from Production.
5. Never log authorization headers, secrets, raw credential-bearing errors, or request bodies that may contain sensitive data.
6. Add tests proving that adapters receive no raw key and that capabilities reject unapproved destinations, methods, headers, and oversized requests.
7. Require explicit human approval before granting a new module access to a privileged capability.

## Security boundary and limitations

This is capability-based separation inside one Cloudflare Worker isolate, not a separate operating-system process or a sandbox against arbitrary malicious code already executing in the same isolate. It prevents ordinary provider adapters from receiving the raw credential and constrains their authorized network call, but it does not replace code review, dependency pinning, deployment access control, Cloudflare account security, or runtime testing.

Cloudflare Worker Secret bindings protect values from being committed as plaintext configuration. They do not make the credential inaccessible to trusted Worker code that is explicitly given the environment. Keep the set of modules that receive the environment as small as possible.

## Deployment policy

The changes are developed on an isolated Git branch and must be reviewed and tested in a separate Preview Worker before any Production deployment. No Production secret values are copied, displayed, or rotated as part of this code change. A Preview deployment must use independently generated Preview-only credentials.
