# Sofia AI Foundation

## Purpose

This repository evolves the existing Sofia web prototype into an extensible, Android-first, cross-platform assistant. The current web experience remains operational during migration.

## Verified starting point

- Default branch: `main`
- Baseline commit: `c7de372d5ea786f554c128fddb35047ed09ba690`
- Existing application: `index.html`
- Existing Cloudflare Worker: `_worker.js`
- Cloudflare configuration: `wrangler.jsonc`
- Existing static asset binding: `ASSETS`
- Existing chat endpoint: `POST /api/chat`
- Existing provider integration: OpenRouter, configured through server-side environment bindings
- Existing browser storage keys: `sofia-chat-v3` and `sofia-avatars-v1`

The baseline files are preserved. New foundation work is developed on a separate branch.

## Non-negotiable architecture decisions

1. Preserve the current web prototype and its user data.
2. Keep provider-specific code behind adapters; Sofia Core must not depend on a single model vendor.
3. Android is the primary client platform. Desktop platforms are supported through platform adapters.
4. Add capabilities through versioned contracts and modules, not by rewriting Core.
5. Enforce least privilege, explicit approval for consequential actions, auditability, and independent verification.
6. Treat model output, retrieved documents, web pages, and device input as untrusted data.
7. Do not expose API keys or other secrets to browser code, logs, or model context.
8. Do not automatically repeat side-effecting operations after uncertain failures.

## Target component boundaries

- **Sofia Core** — system boundary, policy coordination, lifecycle integration.
- **Task Orchestrator** — task state, dependencies, retries, recovery, approvals and completion.
- **Module Registry** — software modules, versions, dependencies and trust state.
- **Capability Registry** — validated capabilities and their providers.
- **Universal Device Manager** — device identity, connection and device adapters.
- **Agent Manager** — selection and coordination of model-backed agents.
- **Tool Manager** — controlled execution of tools and external actions.
- **Security Manager** — identity, authentication, authorization, policy enforcement and audit.
- **Memory Engine** — governed storage and retrieval of user-approved memory.
- **Translation Engine** — provider-independent text, speech and visual translation.
- **Verifier** — independent validation of task results.

No component may bypass Security Manager or grant itself permissions.

## Migration strategy

Use an incremental strangler migration:

1. Keep `main` as the known-good prototype baseline.
2. Develop foundation work on feature branches.
3. Add contracts and tests before connecting new components to production traffic.
4. Preserve the existing `/api/chat` route and browser storage compatibility until an explicit migration is tested.
5. Introduce new server-side boundaries and authentication before exposing additional tools.
6. Run regression tests against the existing chat before any deployment.
7. Merge only reviewed, tested changes; deploy separately from repository commits.

## Initial repository layout

```text
/
  index.html                 # existing web client; preserve during migration
  _worker.js                 # existing Worker; preserve until replacement is tested
  wrangler.jsonc             # existing deployment configuration
  docs/
    architecture/
      FOUNDATION.md
  contracts/
    v1/
  core/
  android/
  web/
  tests/
```

Directories are introduced only when they contain real files. This document records the architecture baseline; it does not claim that the target components have already been implemented.

## Current implementation status

Architecture baseline recorded. No existing application source, deployment configuration, secrets, or user data has been modified by this foundation change.
