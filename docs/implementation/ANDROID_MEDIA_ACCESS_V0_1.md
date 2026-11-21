# Android Media Access v0.1 — Implementation Boundary

**Status:** implementation design prepared; Android runtime source is not yet present in this repository branch.
**Target:** Android-first client, using platform-supported APIs only.
**Related architecture:** `FILE_DOCUMENT_MANAGER.md`, `MEDIA_PROCESSING_MANAGER.md`, `SOFIA_DEVICE_RUNTIME_ANDROID_HOST.md`.

## 1. Scope of v0.1

Implement read-only discovery and preview of user-authorized images before enabling any write or move operation.

Included:
- enumerate images visible through Android MediaStore;
- enumerate user-selected folders through Storage Access Framework (SAF);
- retain and revalidate persistable URI grants when the user selects a folder;
- return normalized metadata and opaque content-URI references;
- distinguish image, video, and non-media document sources using provider MIME/type metadata and bounded signature inspection where access permits;
- expose album/folder search by user-defined display name;
- show selected images in the Sofia UI using content URIs and platform content resolvers.

Not included in v0.1:
- broad unrestricted filesystem access;
- biometric identity inference or face recognition;
- automatic uploads to external AI providers;
- destructive move, overwrite, or delete;
- claiming that an image belongs to a person based only on a model guess.

## 2. Android access strategy

### MediaStore
Use MediaStore collections for media that Android exposes to the app. Query only required columns, use paged queries, and close cursors promptly. Respect Android-version-specific media permissions and the user's selected-media scope. An empty or partial result must be reported as such; it must not be described as a complete device scan.

### Storage Access Framework
Use `ACTION_OPEN_DOCUMENT_TREE` when the user explicitly selects a folder. Persist the returned read permission (and write permission only when a later approved workflow needs it) with `takePersistableUriPermission`. Store the tree URI as an opaque provider reference, not as a filesystem path. Revalidate grants before each operation and handle revocation or provider removal.

### Permission principles
- Request the narrowest permission supported by the Android version and use case.
- Prefer the system photo picker or SAF when broad library access is unnecessary.
- Explain the exact purpose before triggering a runtime permission prompt.
- OS permission and Sofia capability grant are separate gates; both must allow the operation.
- Permission denial or revocation disables only dependent functionality where possible.
- Never attempt to bypass scoped storage, SAF, or platform permission UI.

## 3. Normalized read contract

A read result should contain:
- `asset_ref`: opaque content URI reference;
- `display_name`: provider display name, if available;
- `mime_type`: provider MIME type, validated where possible;
- `media_kind`: `image | video | audio | document | unknown`;
- `size_bytes`, `modified_at`, `width`, `height`, `duration_ms` when available;
- `source_scope`: `media_store | user_selected_tree | user_selected_document`;
- `permission_state`: `available | revoked | unavailable`;
- `classification_status`: `not_run | metadata_only | analyzed | uncertain`.

Do not expose raw absolute paths as stable IDs. A URI is a locator, not proof of authorization; resolve it only after checking the active grant and caller.

## 4. Album and folder semantics

Keep two concepts distinct:
- **Physical folder:** a directory/tree managed by the Android document provider, requiring a valid SAF grant for operations.
- **Logical album:** Sofia's user-defined collection of asset references and display name; it does not move or duplicate source files.

When the user says “save this image” without a destination, create a pending decision and ask which logical album or physical folder to use. Do not write until the destination and operation mode are clear.

Default behavior is non-destructive:
- add to a logical album by reference;
- preserve the original source;
- do not copy or move unless the user explicitly chooses that operation;
- before physical copy/move, show source, destination, and operation and request confirmation;
- if the destination is missing, ask permission to create it;
- after execution, verify the provider result and report success, partial success, or failure accurately.

## 5. Search and classification

Search is layered:
1. user-specified folder or album name;
2. provider metadata (display name, MIME type, timestamps, dimensions);
3. optional local OCR or image classification adapter after explicit capability and privacy checks.

OCR and model-generated labels are probabilistic metadata, not authorization or identity evidence. For sensitive documents, show a preview and confidence/uncertainty before assigning a semantic category. Do not send private images to a remote model by default.

For a command such as “show my personal documents”, return only accessible assets and group them by detected document type. Clearly indicate inaccessible scopes and uncertain classifications.

## 6. Pending user decision state

A pending file operation must persist:
- operation ID and initiating request ID;
- selected source asset references;
- requested action;
- missing decision (destination, copy vs move, or create-folder approval);
- expiry and cancellation state.

A follow-up such as “Family” resolves the pending destination only when there is exactly one active compatible pending operation in the current owner session. Otherwise ask a clarification. Expired, cancelled, or completed operations cannot be resumed by an ambiguous short reply.

## 7. Security and audit

- Resolve owner identity and current session before reading or writing.
- Check both OS URI permission and Sofia's scoped capability grant on every operation.
- Bind grants to resource, operation, purpose, principal, and expiry.
- Treat filenames, EXIF, OCR, captions, and embedded text as untrusted input.
- Keep credentials and sensitive image content out of logs.
- Audit discovery, preview, grant, copy, move, create-folder, and failure events with minimized metadata.
- Fail closed when destination authorization, permission, or operation outcome is unknown.

## 8. Acceptance tests

1. No MediaStore query occurs before the required OS permission or selected-media access is available.
2. Partial photo access returns only permitted items and is labelled partial.
3. SAF folder selection persists a read grant and survives process restart where Android permits.
4. Revoked SAF grants fail closed and prompt the user to reselect the folder.
5. MediaStore and SAF results normalize to the same asset contract without assuming filesystem paths.
6. A video is not classified as a still image solely because it has a thumbnail.
7. A screenshot remains an image asset with a screenshot classification; it is not silently treated as a document.
8. “Save image” without destination creates a pending decision and performs no write.
9. “Family” resolves only the single compatible active pending decision.
10. Logical album assignment does not duplicate or move the source.
11. Physical copy/move requires explicit destination and operation confirmation.
12. Failed or interrupted writes leave the source intact and report the actual outcome.

## 9. Repository integration gate

Before Kotlin implementation, add or identify the Android Gradle application module, application ID, minimum/target SDK, manifest, dependency catalog, and existing UI entry point. This branch currently contains the web Worker/Core and architecture/contracts, but the inspected paths do not include an Android Gradle module or Android manifest. Do not invent a package namespace or modify the working web prototype to simulate native gallery access.

The first code change after the Android module is available should be a small read-only adapter plus instrumentation tests for MediaStore permission scope and SAF grant persistence. Album writes follow only after those tests pass.
