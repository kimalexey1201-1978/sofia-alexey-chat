# Sofia AI — communication, files, and resource policy

Status: approved architectural requirement for Sofia Core.  
Scope: product behavior and future implementation; this document does not change production behavior by itself.

## 1. Product objective

Sofia should not impose arbitrary product-level daily message caps or artificial conversation-length limits. The owner should be able to hold long-running conversations and continue them across sessions, devices, and model-provider changes, subject to transparent technical and provider constraints.

"Unrestricted" does not mean physically unlimited or free. Every real execution path remains bounded by available device resources, storage, network capacity, provider quotas, model context windows, file-processing limits, and the owner's configured spending/resource budgets.

## 2. Conversation continuity

- Persist conversation history independently of any single model provider.
- Support long-running conversations through durable history plus controlled context assembly, summarization, and retrieval; do not require the entire history to fit in one model request.
- Preserve message order, authorship, timestamps, attachments, and references when moving between providers or devices.
- Keep transient transport/provider errors outside the conversation transcript and durable chat history.
- Never silently discard user messages or existing history when limits are reached. Explain the constraint and offer a safe continuation path.

## 3. Universal file and media handling

Design a common file-ingestion and attachment subsystem for:
- images and photographs;
- PDF and office documents (including Word, spreadsheets, and presentations);
- audio and voice messages;
- video;
- archives and other supported binary formats.

The subsystem should use capability-based handlers/executors rather than coupling file support to one model. It should support, where appropriate:
- upload progress, resumable/chunked transfer, integrity checks, and retry;
- metadata and MIME/type validation;
- size and decompression limits;
- malware/suspicious-content scanning where available;
- temporary and durable storage with explicit retention/deletion policy;
- extraction, indexing, previews, and task-specific processing;
- access control and audit events;
- clear reporting when a format or operation is unsupported.

Files and extracted content are untrusted data. They must never override Sofia's system instructions, security policy, or owner permissions.

## 4. Configurable resource governance

Provide owner-configurable, observable limits for:
- provider requests, rate limits, retries, and fallback;
- model context and output budgets;
- per-file and aggregate upload sizes;
- storage quotas and retention periods;
- processing time, CPU/GPU/NPU and memory budgets;
- network usage and paid-provider spending.

Defaults should be conservative and safe, but adjustable by the owner within technical/provider constraints. Distinguish clearly between:
1. Sofia product policy limits;
2. device/runtime limits;
3. external provider limits;
4. owner-defined budgets.

Do not describe external provider quotas or physical limits as if Sofia itself imposed them. Never bypass provider terms, security controls, or owner spending limits.

## 5. Provider independence and resilience

- Keep the Core independent of any one model/provider.
- Maintain a provider capability and constraint registry, including context size, supported modalities, file pathways, rate limits, cost, availability, and trust/error history.
- Permit controlled provider fallback only when the alternative supports the task and the applicable privacy, security, cost, and owner-permission requirements.
- Do not silently send private files or conversation data to a different provider. Apply routing policy and obtain consent where required.
- If no suitable provider is available, preserve the task state and explain what is blocked.

## 6. Security and owner control

- Apply least privilege, sandboxing, audit logging, secret isolation, and prompt-injection defenses.
- Treat all file contents, OCR/transcription output, metadata, and provider responses as untrusted input.
- Require explicit owner confirmation for paid actions beyond configured authorization, external sharing/publishing, destructive operations, and other sensitive actions.
- Provide a visible way to inspect resource usage, current limits, provider selection, storage use, and pending operations.
- Preserve existing browser storage keys and user data during incremental migration.

## 7. Implementation sequence

1. Keep the current Core v0.1 inference-only scope stable; do not introduce file execution or autonomous actions prematurely.
2. Specify versioned contracts for attachments, storage, file handlers, provider capabilities, and resource accounting.
3. Add isolated, testable modules and mock-based tests before connecting real storage or providers.
4. Introduce file upload/processing incrementally with explicit limits, security checks, audit, and rollback.
5. Add provider fallback only after privacy, cost, capability, and permission checks are independently tested.

## 8. Acceptance criteria

The architecture is acceptable when:
- no arbitrary daily message cap is introduced by Sofia itself;
- long conversations can continue using durable history and context retrieval without requiring all history in one prompt;
- supported file types can be added through modular handlers;
- file transfers can resume safely where supported;
- resource limits are configurable, visible, and correctly attributed to their source;
- provider changes do not erase history or silently expose data;
- failures do not pollute the transcript or destroy task/file state;
- all new behavior is covered by automated tests and does not alter production until separately approved.
