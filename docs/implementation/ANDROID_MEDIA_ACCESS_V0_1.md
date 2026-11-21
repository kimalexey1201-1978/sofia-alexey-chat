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


## 10. Incoming selection handoff: Gallery → Share → Sofia

This is the primary v0.1 workflow for acting on photos that the user has already selected in another Android gallery app. It is a bounded handoff of the selected items, not a grant to scan the entire gallery.

### Intent entry points

The Android application should expose an exported, appropriately filtered receiving activity for:
- `ACTION_SEND` for one shared image;
- `ACTION_SEND_MULTIPLE` for multiple shared images;
- image MIME types (`image/*`) as the initial supported scope.

The receiver must inspect both `Intent.EXTRA_STREAM` and `Intent.clipData` because source gallery applications differ in how they package shared items. Normalize the incoming values into a single ordered list of content URIs, remove duplicates, reject null or malformed entries, and enforce configurable item-count and aggregate-size limits before processing. Do not accept arbitrary filesystem paths as substitutes for content URIs.


### Manifest and activity hardening

The eventual Android manifest must declare separate intent filters for the supported combinations:
- `ACTION_SEND` + `CATEGORY_DEFAULT` + `image/*`;
- `ACTION_SEND_MULTIPLE` + `CATEGORY_DEFAULT` + `image/*`.

The receiving activity must be `android:exported="true"` because other apps need to launch it through the Sharesheet. This makes runtime validation mandatory: intent filters are routing declarations, not an authorization boundary. Validate the action, MIME type, URI scheme, read grant, item count, and each provider read even when the incoming intent matched the filter. Never execute a file operation merely because the activity was launched.

On Android 12 and later, explicitly declare `android:exported` for components with intent filters. Handle both the initial `onCreate` intent and subsequent `onNewIntent` deliveries according to the activity launch mode; deduplicate deliveries by an intake/request identifier so the same share is not processed twice. Perform provider I/O and image decoding off the main thread. Avoid accepting `*/*` in the initial release: the app is an image intake target, not a general-purpose file receiver.

### URI access and intake

- Require the source intent's read grant (`FLAG_GRANT_READ_URI_PERMISSION`) and handle missing or expired grants as an item-level intake failure.
- Read metadata through `ContentResolver`; validate MIME type and, where practical, inspect a bounded file signature. Do not trust the filename extension alone.
- Treat incoming URIs as temporary capabilities. Do not assume they remain readable after the share flow or process restart.
- If Sofia needs durable access beyond the receiving session, copy the selected content into Sofia-controlled app storage after explaining the storage action and obtaining the necessary user authorization. Do not assume that a share URI can be persisted with SAF's persistable-grant mechanism.
- Show the user a preview and exact received item count before any write operation. If some items cannot be read, identify the partial intake and do not silently omit them.

### Command interpretation and destination

After intake, bind the received URI list to one active operation/request ID in the current owner session. A command such as “перемести выбранные фотографии в папку Семья” must resolve only to this exact received selection.

Before changing storage:
1. Resolve whether “Семья” is an existing logical album or a physical folder. If ambiguous, ask.
2. If the physical folder does not exist, ask whether Sofia may create it and obtain a valid destination tree/document-provider grant.
3. Present the item count, destination, and exact operation (logical album assignment, copy, or physical move).
4. Require explicit confirmation before copy or move. A direct command that clearly requests a move expresses intent, but the confirmation screen/voice confirmation is still the final execution gate for a potentially destructive cross-provider operation.

### Physical move semantics and failure handling

A physical move is not equivalent to adding references to a logical album. Implement provider-aware behavior:
- Use SAF document-provider operations only when the selected source and destination provider support the required operation and the app has the necessary grants.
- For MediaStore-managed items, use the platform's applicable user-consent/write-request flow for modifications or deletion (for example, `MediaStore.createWriteRequest` on supported Android versions) rather than attempting silent mutation.
- Do not assume every provider supports atomic move or rename. If a true move cannot be performed safely, stop and explain the limitation; do not silently downgrade to copy or logical album assignment.
- Where a provider requires copy-then-delete, first copy the item, verify the destination content (readability, size and available metadata/checksum), and only then request the required source deletion authorization. If verification or deletion fails, retain the source and report that the operation is partial.
- Report per-item outcomes for multi-selection. Never report the whole batch as successful when any item failed or remains unverified.

### In-Sofia selection path

A second supported path is selecting items from Sofia's own media UI using the Android Photo Picker or a permission-scoped MediaStore browser. This is a Sofia-owned selection interface; it is not remote control of another gallery app. The resulting selection enters the same normalized intake and pending-operation pipeline as the Share handoff.

### Acceptance tests — Share handoff

13. A single-image `ACTION_SEND` intent is received and normalized to one image asset.
14. A multi-image `ACTION_SEND_MULTIPLE` intent reads URIs from both supported payload locations, deduplicates them, and preserves stable selection order where the source provides it.
15. Missing read grants, revoked access, malformed URIs, unsupported MIME types, and provider read errors fail closed and are reported per item.
16. A share handoff exposes only the selected items; it does not trigger an unrestricted MediaStore scan.
17. The received selection remains bound to one active owner-session operation and cannot be replaced by an unrelated later share or ambiguous voice reply.
18. No copy, move, folder creation, or deletion occurs before destination resolution and explicit confirmation.
19. A provider that cannot safely perform a physical move causes a clear refusal/limitation result; no silent copy fallback occurs.
20. In copy-then-delete flows, source deletion is not requested until destination verification succeeds and the platform's required user-consent flow is completed.
21. Batch results distinguish complete success, partial success, and failure, with an outcome for each selected item.
22. The in-Sofia Photo Picker/MediaStore selection path enters the same downstream authorization and operation pipeline.
