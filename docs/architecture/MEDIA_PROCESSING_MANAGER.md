# Media Processing Manager

**Status:** architecture specification; runtime implementation is pending.  
**Contract baseline:** JSON Schema Draft 2020-12. Schema documents use `schema_version`; public interfaces use `contract_version`, following [CONTRACT_AND_IDENTIFIER_STANDARDS.md](CONTRACT_AND_IDENTIFIER_STANDARDS.md).

## 1. Purpose and scope

The Media Processing Manager (MPM) coordinates authorized processing and editing of image, audio, and video assets. It provides a common capability and job model while delegating codec, rendering, capture, effects, and editor-specific operations to versioned adapters.

MPM is distinct from File & Document Manager:
- FDM governs file identity, access, import/export, storage, integrity, and retention.
- MPM governs media-specific analysis, transformation, editing timelines, rendering, and quality validation.
- MPM references FDM file IDs and never silently replaces source media.

Supported workflows may include trimming, splitting, joining, cropping, resizing, rotation, stabilization, color and audio adjustments, subtitles, transcription, denoising, format conversion, thumbnails, key frames, and multi-track editing. Actual support depends on codecs, platform APIs, installed editors, hardware acceleration, licensing, and resource limits.

## 2. Architectural boundaries

MPM integrates with:
- File & Document Manager for source and output file lifecycle;
- Device Integration Gateway and Device & Sensor Data Manager for authorized camera, microphone, and device media access;
- Voice Interaction Manager for speech sessions and user commands;
- AI Provider Gateway for optional AI-assisted media operations;
- AI Evaluation & Quality Manager for capability-specific quality assessment;
- Resource & Runtime Manager for CPU/GPU/NPU, memory, storage, thermal, battery, and time budgets;
- Workflow & State Manager for durable, resumable editing/rendering workflows;
- Security, Identity, Autonomy, and Privacy managers for authorization, confirmation, consent, and data handling;
- Knowledge & Search Manager for indexing approved metadata, transcripts, and generated captions;
- Notification & Reminder Manager for job completion/failure notices;
- Audit & Observability Manager for provenance and operation records.

MPM does not grant device permissions, infer user authority from model output, or execute arbitrary scripts supplied by a media file.

## 3. Media asset model

A media asset references an FDM-managed file and includes:
- stable media asset ID and source file ID/version;
- media kind (image, audio, video, or audiovisual);
- detected container, codecs, dimensions, frame rate, duration, sample rate, channels, orientation, and color characteristics where available;
- metadata extraction status and confidence;
- classification, ownership, purpose, and access reference;
- source hash and provenance;
- derived asset lineage.

Metadata is descriptive, not authorization. Sensitive metadata such as location, device identifiers, faces, or voice characteristics is subject to privacy policy and minimization.

## 4. Capability and adapter registry

Every media operation is provided by a registered adapter with:
- stable adapter ID and semantic version;
- supported input/output media types and codecs;
- supported operations and parameter schema;
- platform and minimum OS/runtime requirements;
- hardware acceleration requirements and fallback behavior;
- resource estimates and hard limits;
- licensing/availability constraints;
- quality characteristics and evaluation evidence;
- sandbox and permission requirements.

Capability discovery must reflect the actual device and installed software. Do not claim an operation is supported until the adapter has passed compatibility checks. Provider/editor adapters may include native Android media APIs, approved open-source libraries, desktop media frameworks, or external editor integrations.

## 5. Editing project and timeline

A project is a versioned, non-destructive description of an edit. It references source assets and stores tracks, clips, ordering, in/out points, transforms, effects, transitions, overlays, captions, audio mix settings, and output profile.

Timeline rules:
- use a defined timebase and integer ticks or rational timestamps to avoid floating-point drift;
- preserve source time ranges and clip provenance;
- validate track references, clip bounds, transitions, and effect parameters;
- define deterministic ordering for operations at the same timestamp;
- keep edit decisions separate from rendered output;
- use immutable project revisions or compare-and-swap updates to prevent silent overwrites.

A project may be rendered repeatedly to different output profiles without modifying source media.

## 6. Processing pipeline

1. Validate requester, permissions, purpose, and consent.
2. Resolve source asset IDs and verify current file versions and access.
3. Discover compatible adapters and device capabilities.
4. Validate operation parameters and resource budget.
5. Build an explicit processing graph and estimate output size/time.
6. Obtain confirmation when the action is consequential, costly, externally shared, or may overwrite/delete data.
7. Execute in a sandbox with bounded resources and cancellation support.
8. Validate output container, codecs, duration, dimensions, audio/video synchronization, and integrity.
9. Store output as a new FDM-managed derived file with provenance.
10. Record quality metrics, warnings, and partial failures.
11. Emit workflow and audit events and report completion status accurately.

AI-generated or AI-assisted edits must be labeled in provenance. Model suggestions are proposals; they do not authorize access, capture, export, or publication.

## 7. AI-assisted media features

Optional AI operations may include:
- speech-to-text and subtitle alignment;
- translation and subtitle localization;
- scene and shot detection;
- semantic media search;
- object/scene descriptions;
- background noise reduction;
- image enhancement or segmentation;
- rough-cut suggestions and highlight selection.

Each capability requires a task-specific adapter, evaluation evidence, confidence/uncertainty reporting, and privacy review. External provider processing requires data-classification approval and any required user consent. Do not assume the newest or largest model is the best option.

Biometric identification, face recognition, voice identity inference, or other sensitive analysis is not enabled by this architecture by default; any future capability requires separate explicit policy, legal review, and user-facing controls.

## 8. Android-first editor integration

Android is the primary interaction platform. MPM must:
- use Android-supported media APIs and codecs where appropriate;
- respect scoped storage, content URI grants, microphone/camera permissions, and background execution limits;
- detect device codec and hardware-accelerator capabilities at runtime;
- account for thermal throttling, battery state, memory pressure, and available storage;
- use foreground execution only when justified and user-visible;
- checkpoint long renders and resume safely after process death where supported;
- provide a clear hand-off to a user-selected installed editor when direct integration is unavailable.

External editor control is limited to documented APIs, intents, share contracts, or user-authorized UI automation. MPM must not promise arbitrary control over every third-party editor. User-visible confirmation is required before publishing, sharing, or overwriting content.

## 9. Cross-platform support

Windows, Linux, and macOS use platform-specific media adapters while sharing project and job contracts. A project should declare required capabilities and report unsupported effects or codecs rather than silently changing the edit. Cross-platform rendering equivalence must be evaluated; identical project data does not guarantee bit-identical output across different codec implementations.

## 10. Quality and output profiles

Output profiles define container, video/audio codec, resolution, frame rate, bitrate or quality target, audio sample rate/channels, color space, and compatibility constraints. Presets may be optimized for social platforms, messaging, archive, or local playback, but platform limits must be validated at render time.

Quality checks include:
- decode and container integrity;
- expected duration and frame count;
- audio/video synchronization;
- resolution, frame rate, and aspect ratio;
- clipping, silence, black frames, and dropped-frame indicators where measurable;
- subtitle timing and encoding;
- perceptual quality metrics where available.

A successful encoder exit code alone is not proof of a valid deliverable.

## 11. Resource management and resilience

MPM must enforce limits for input size, duration, resolution, frame rate, track count, effect complexity, memory, CPU/GPU time, storage, battery, thermal state, network transfer, and provider cost.

Use bounded retries, resumable checkpoints, cancellation, and explicit handling for unknown completion. Avoid retrying non-idempotent external publication actions without checking their status. If a device overheats or resources fall below safe thresholds, pause or downgrade only with a transparent explanation and user policy; do not silently degrade output quality.

## 12. Security and privacy

- Treat media metadata, captions, OCR, transcripts, subtitles, and embedded project files as untrusted input.
- Parse media in sandboxed, patched components.
- Restrict remote URL imports and external resource fetching.
- Apply consent and visible capture state for camera/microphone acquisition.
- Minimize or strip sensitive metadata only according to user-selected export policy.
- Keep originals immutable unless the user explicitly requests a separately authorized destructive operation.
- Do not upload media to external AI providers without data-policy approval and required consent.
- Record access, transformation, export, and publication events without logging unnecessary media content.

## 13. Verification requirements

Tests must cover malformed media, codec mismatch, truncated files, oversized duration/resolution, resource exhaustion, thermal throttling, interrupted renders, process death, timeline precision, audio/video drift, missing fonts, subtitle encoding, adapter incompatibility, hardware/software fallback, source version changes, permission revocation, sensitive metadata handling, prompt injection in captions/subtitles, output integrity, and external editor hand-off failures.

Evaluation suites must measure operation-specific output quality, latency, resource consumption, reproducibility, and failure rates across representative Android devices and supported desktop environments.

## 14. Implementation status

**Implementation status:** this change adds architecture and versioned contracts only. It does not add a media engine, codec library, timeline editor, renderer, AI media pipeline, Android editor integration, or desktop adapter. No existing prototype files, browser storage, production settings, or deployments are modified.
