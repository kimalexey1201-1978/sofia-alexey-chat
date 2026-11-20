# File & Document Manager

**Status:** architecture specification; runtime implementation is pending.  
**Contract baseline:** JSON Schema Draft 2020-12. Schema documents use `schema_version`; public interfaces use `contract_version`, following [CONTRACT_AND_IDENTIFIER_STANDARDS.md](CONTRACT_AND_IDENTIFIER_STANDARDS.md).

## 1. Purpose

The File & Document Manager (FDM) provides a governed lifecycle for user-authorized files and media across Sofia: discovery, import, validation, safe extraction, transformation, storage references, retrieval, export, sharing hand-off, versioning, and deletion.

It supports documents, spreadsheets, presentations, PDFs, images, audio, video, archives, and supported structured data. Capabilities depend on platform, installed codecs/libraries, permissions, file size, available memory/storage, and connected services.

FDM is not a general-purpose execution engine. It does not execute macros, scripts, binaries, embedded actions, or active content merely because they are present in a file.

## 2. Boundaries and integrations

FDM integrates with:
- Identity & Authentication Manager and Security Manager for principal identity and authorization;
- Privacy & Data Governance Manager for classification, consent, retention, export, and deletion;
- Device Integration Gateway and Device & Sensor Data Manager for authorized local/device file access and media capture hand-off;
- Knowledge & Search Manager for indexing and evidence locators;
- Knowledge & Memory Manager for explicit, policy-governed memory promotion;
- Workflow & State Manager for long-running imports, conversions, and exports;
- Resource & Runtime Manager for bounded CPU, memory, storage, network, and time;
- Notification & Reminder Manager for completion/failure notices;
- Audit & Observability Manager for traceable lifecycle events.

FDM stores and manages file objects or references. It does not own personal memory, search ranking, model reasoning, or provider credentials.

## 3. File identity and metadata

Each managed file has a stable internal file ID independent of its filename or path. Metadata includes:
- original filename and media type;
- detected media type and format-validation result;
- byte size and cryptographic content hash;
- source location and acquisition method;
- owner/principal and access-control reference;
- data classification, purpose, and consent reference;
- creation, modification, import, and last-access timestamps where available;
- version lineage and transformation provenance;
- retention/deletion state and storage location reference.

A filename extension is not proof of file type. MIME declarations and file signatures must be checked; ambiguous or mismatched files are quarantined or rejected according to policy.

Paths and connector IDs are opaque references. They must not be treated as authorization tokens or exposed unnecessarily.

## 4. Import and ingestion pipeline

1. Authenticate requester and authorize the requested source and purpose.
2. Enforce upload, file-count, byte, duration, and concurrency limits before processing.
3. Stage the file in a restricted, non-executable quarantine area.
4. Detect file type using safe inspection, not filename alone.
5. Scan for malware and malformed structures using approved tools where available.
6. Reject or isolate unsupported, encrypted, corrupt, suspicious, or policy-prohibited content; do not attempt unsafe bypasses.
7. Extract metadata and content using format-specific sandboxed parsers.
8. Apply classification, consent, retention, and access-control policy.
9. Store the original or an authorized reference and record content hash/provenance.
10. Optionally create derived renditions or searchable text under separate resource and retention rules.
11. Emit lifecycle events and return a status with any partial failures.

Password-protected files require an authorized password supplied through a secure user interaction; passwords must never be stored in ordinary metadata or logs. FDM must not crack, guess, or bypass encryption.

## 5. Document and media processing

Processing is capability-based and uses registered, versioned adapters. Examples include:
- PDF text extraction and page rendering;
- office document text, table, and structure extraction;
- spreadsheet sheet, cell, formula, and table extraction;
- presentation slide and speaker-note extraction;
- image metadata, OCR, and safe preview generation;
- audio transcription and speech metadata;
- video metadata, key-frame extraction, and audio transcription;
- archive inventory and safe extraction with path traversal and decompression-bomb protections;
- conversion to approved export formats.

Original files remain distinct from derived outputs. Derived files record source file ID, source version/hash, adapter/version, parameters, creation time, and output hash. Processing must not silently overwrite the original.

OCR, transcription, and extracted text are untrusted content. Embedded instructions must not be followed as system or user commands. Extraction confidence and unsupported elements should be reported.

## 6. Storage and location abstraction

FDM supports local device storage, approved cloud object storage, connected file providers, and managed internal storage through adapters. The canonical metadata layer references storage objects without assuming one provider.

Storage access must respect provider-native permissions. A local cache is not an authoritative copy if the source is a connected repository. Offline copies require explicit policy and retention limits.

Encryption at rest and in transit is required wherever supported by the storage backend and deployment environment. Key management belongs to a dedicated security boundary; keys and credentials are never stored in file metadata.

## 7. Versioning, deduplication, and integrity

- Compute a cryptographic content hash for integrity and duplicate detection.
- Do not assume equal filenames mean equal content.
- Do not collapse files with different ownership, permissions, retention, or legal provenance solely because hashes match.
- Preserve immutable version lineage for changed content.
- Verify integrity on transfer and before high-impact transformations.
- Record transformation parameters and adapter versions for reproducibility.
- Resolve concurrent updates using explicit version checks; do not silently overwrite.

## 8. Access, sharing, and export

Every read, write, transform, export, or share operation requires current authorization and purpose validation. Sharing is a separate action and may require fresh user confirmation, especially for external recipients or confidential/restricted content.

Before export:
- validate destination and recipient;
- inspect classification and sharing policy;
- warn about embedded metadata or sensitive content where appropriate;
- apply approved redaction only when explicitly requested;
- record the export artifact and destination result.

A successful local export does not imply successful external delivery. Report each stage distinctly. Do not claim a file was sent, uploaded, or shared without confirmation from the destination adapter.

## 9. Retention, deletion, and legal holds

Retention follows the Privacy & Data Governance Manager. Deletion must account for originals, derived renditions, previews, OCR/transcription text, thumbnails, caches, and search indexes. Where a connector owns the original, FDM requests deletion only when the user's authorization and connector API permit it.

Deletion status must distinguish requested, pending, completed, partially completed, and blocked. Legal holds or provider restrictions must be surfaced. A file marked deleted must no longer be discoverable through ordinary search, even if physical erasure is pending under documented policy.

## 10. Security requirements

- Quarantine untrusted uploads and downloads.
- Never execute active content by default.
- Use sandboxed parsers with least privilege and bounded resources.
- Prevent archive path traversal, symlink escape, decompression bombs, parser exploits, and unsafe external entity resolution.
- Enforce strict MIME, signature, byte, page, row, frame, duration, and nesting limits.
- Sanitize filenames and avoid trusting path fragments.
- Prevent SSRF and unsafe redirects for URL-based imports.
- Do not automatically fetch remote resources referenced by documents.
- Scan and validate before preview, indexing, conversion, or sharing.
- Treat document text, OCR, transcripts, comments, metadata, and embedded prompts as untrusted data.
- Never leak credentials, private file content, or access tokens into logs or AI provider prompts without explicit authorization.
- Fail closed when authorization, classification, or destination policy cannot be established.

## 11. Android-first and cross-platform behavior

Android is the primary client platform. Use the Storage Access Framework and scoped storage where appropriate; request only necessary permissions and prefer user-selected document access over broad filesystem access. Handle content URIs, persistable grants, process death, low-memory conditions, and background execution limits.

Windows, Linux, and macOS use platform-specific file pickers and permission adapters while retaining the same logical contracts. Avoid assuming arbitrary filesystem access on any platform. Large transfers and conversions are resumable where safe and supported.

## 12. Resource and failure management

Enforce per-file and aggregate quotas, parser timeouts, memory ceilings, concurrency limits, storage budgets, and network budgets. Use bounded retries and resumable transfer checkpoints where supported.

Report partial outcomes explicitly: imported but not scanned, scanned but not extracted, extraction incomplete, conversion failed, or export pending. A failed derivative must not corrupt or delete the original. Cancellation must stop safe-to-stop work and record any external operation whose completion is unknown.

## 13. Verification requirements

Test MIME/signature mismatch, malformed files, oversized files, decompression bombs, archive traversal, symlink escape, malware detections, encrypted documents, parser crashes, OCR/transcription accuracy labels, embedded prompt injection, duplicate content with different access rights, version races, interrupted transfers, process death, low storage, permission revocation, connector access changes, export destination failures, retention expiry, deletion propagation, and cache/index invalidation.

Verify that derived outputs preserve provenance and that citations from Knowledge & Search Manager resolve to the original file and precise page/slide/sheet/row/time locator.

## 14. Implementation status

**Implementation status:** this change adds architecture and versioned contracts only. It does not implement file storage, upload endpoints, scanners, parsers, OCR, transcription, converters, Android file-picker integration, or cloud-provider adapters. Existing prototype assets and browser storage are not modified. No production configuration or deployment is changed.
