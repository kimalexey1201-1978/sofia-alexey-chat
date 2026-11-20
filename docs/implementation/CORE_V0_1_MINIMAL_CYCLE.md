# Sofia Core v0.1 — Minimal Working Cycle

**Status:** implementation baseline proposal  
**Branch:** `core/v0.1-minimal-cycle`  
**Scope:** first stable end-to-end cycle only

## 1. Objective

Introduce a small, testable Sofia Core boundary that accepts a chat request, invokes an AI provider through a provider-independent interface, validates the provider result, and returns a normalized response.

This phase is deliberately limited. It does not implement autonomous actions, tool execution, long-term memory, device control, multi-agent orchestration, or background task scheduling.

## 2. Compatibility constraints

The existing web prototype remains the migration entry point.

- Preserve `POST /api/chat`.
- Preserve browser storage keys `sofia-chat-v3` and `sofia-avatars-v1`.
- Preserve the existing user-facing chat behavior unless a separately tested change is approved.
- Keep provider credentials exclusively in server-side Worker bindings.
- Keep the current production branch and deployment unchanged during this phase.

## 3. Logical components

### 3.1 Core

Responsibilities:

1. Receive the normalized chat request.
2. Validate the request before provider invocation.
3. Build provider input using server-owned instructions.
4. Call the provider interface with bounded execution settings.
5. pass the normalized provider result to the verifier.
6. Return a normalized success or typed failure response.

Core owns request flow and response assembly. It does not contain provider-specific HTTP details and does not treat model output as authority.

### 3.2 Provider Gateway

Expose one internal provider interface:

```ts
type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ProviderRequest = {
  requestId: string;
  messages: ChatMessage[];
  systemInstruction: string; // supplied by trusted server configuration
  model?: string;             // resolved from server configuration only
  maxOutputTokens: number;
  timeoutMs: number;
};

type ProviderResult = {
  text: string;
  providerId: string;
  modelId: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
};

interface AIProvider {
  generate(request: ProviderRequest): Promise<ProviderResult>;
}
```

The initial adapter wraps the existing OpenRouter integration. Core must depend only on `AIProvider`, not on OpenRouter-specific request or response formats.

Provider selection, model selection, endpoint, and credentials are server-controlled. Client input must never override them.

### 3.3 Verifier v0.1

The first verifier is deterministic and intentionally modest. It checks:

- provider result has the required shape;
- response text is present and within configured size bounds;
- provider/model metadata is present;
- usage values, when supplied, are valid non-negative numbers;
- the provider call completed within its deadline;
- no internal provider error or raw credential is copied into the public response.

It returns a typed result such as `passed` or `rejected`, with stable reason codes.

**Important limitation:** this verifier validates response integrity and contract compliance. It does not prove that factual claims made by a language model are true. Independent factual verification is a later capability.

## 4. Trust and validation boundary

- Treat all client input and conversation history as untrusted.
- Accept only the explicitly supported `user` and `assistant` message roles.
- Reject privileged roles and unknown top-level request fields.
- Bound request body size, message count, per-message length, and total content length.
- Build the system instruction on the server; never accept it from the browser.
- Keep API keys and other secrets out of client assets, responses, logs, and repository files.
- Treat provider output as untrusted data; it cannot authorize tools or actions.
- Do not add tool execution or external side effects in this phase.

The existing prototype currently sends a client-supplied system message. Replacing that trust boundary requires a carefully tested server-side prompt migration; it must not be treated as already completed.

## 5. Normalized internal flow

```text
POST /api/chat
      |
      v
Request validation
      |
      v
Sofia Core
      |
      v
AIProvider interface
      |
      v
OpenRouter adapter
      |
      v
Provider result normalization
      |
      v
Verifier v0.1
      |
      v
Normalized API response
```

## 6. Failure behavior

Return typed failures for at least:

- invalid request;
- unsupported message role or field;
- request too large;
- provider timeout;
- provider unavailable;
- invalid provider response;
- verifier rejection;
- internal failure.

Do not return stack traces, raw provider errors, prompts, credentials, or internal configuration. Do not silently retry non-idempotent operations; this phase performs inference only and must not perform external side effects.

## 7. Minimum acceptance tests

1. A valid user message completes the full Core → provider → verifier → response cycle.
2. The Core works against a mock `AIProvider` without OpenRouter-specific code.
3. Replacing the OpenRouter adapter with another adapter does not require changing Core.
4. Client-supplied system/developer roles and privileged fields are rejected.
5. Unknown message roles are rejected.
6. Empty, malformed, and oversized requests are rejected before provider invocation.
7. Provider timeout and provider failure produce typed errors without leaking internals.
8. Empty, malformed, oversized, or metadata-invalid provider results fail verification.
9. A verifier rejection is never returned as a successful assistant answer.
10. Existing chat UI and browser storage compatibility are preserved.
11. No provider key or secret is present in browser assets, repository files, or API responses.
12. No tool, device, memory-write, payment, publication, or other external action can be triggered by model output.

## 8. Implementation sequence

1. Add tests and a mock provider around the proposed interfaces.
2. Implement the minimal Core request/response flow.
3. Implement the OpenRouter adapter behind `AIProvider`.
4. Integrate the flow behind the existing `POST /api/chat` route.
5. Add the deterministic verifier.
6. Run acceptance and compatibility tests.
7. Review the diff and rollback path before any deployment.

## 9. Explicit non-goals

This baseline does not claim to deliver authentication, owner identity verification, permission grants, durable memory, a production task orchestrator, semantic fact-checking, Android runtime integration, or autonomous execution. These remain separate, gated implementation stages.
