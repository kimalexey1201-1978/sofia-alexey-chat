# Sofia Memory Reliability v1.1

## Goal

Verify that local memory remains private, readable, and recoverable across normal app lifecycle events. The checklist combines automated Android instrumentation coverage with device-only release checks. Instrumentation tests use a dedicated preference namespace and do not clear or modify the owner's production memory.

## Current storage contract

- Memory is stored in app-private SharedPreferences.
- Values are encrypted with AES/GCM/NoPadding.
- The AES key is generated and held by Android Keystore.
- The preference key is supplied as GCM additional authenticated data.
- Legacy plaintext values are migrated on read; the original value is retained if migration cannot be completed.
- Conversation history is bounded to 40 turns; individual turn content is limited to 6,000 characters.
- Long-term facts are explicitly saved, bounded to 100 entries, and limited to 500 characters each.
- A decryption failure must not be treated as an empty JSON array or silently overwrite the stored value.

## Verification matrix

| ID | Scenario | Expected result |
|---|---|---|
| MEM-01 | Save a fact, force-stop the app, reopen it, request memory summary | The fact remains available |
| MEM-02 | Save several conversation turns, restart the app, send another voice request | Recent turns are supplied to the assistant |
| MEM-03 | Save the same fact twice with different letter casing | Only one copy is stored |
| MEM-04 | Remove an existing fact by exact phrase | The fact is removed and absent from the summary |
| MEM-05 | Remove a phrase that is not stored | No other fact is changed |
| MEM-06 | Install an upgrade over a build containing legacy plaintext preferences | Existing values remain readable and are migrated to encrypted form |
| MEM-07 | Interrupt or deny a legacy-value migration write | Original plaintext value remains intact; app does not claim migration succeeded |
| MEM-08 | Modify one byte of an encrypted payload | Decryption fails closed; the stored payload is not replaced with an empty value |
| MEM-09 | Change the preference key associated with a ciphertext | Authentication fails; ciphertext remains untouched |
| MEM-10 | Remove the Keystore key in a test-only environment | App reports a memory-access error; it does not silently reset memory |
| MEM-11 | Save more than 40 turns | Only the newest 40 turns remain |
| MEM-12 | Save a fact longer than 500 characters | Stored fact is safely truncated to the documented limit |
| MEM-13 | Save an empty or whitespace-only fact | No empty fact is added |
| MEM-14 | Run memory reads while voice recognition is restarting | No crash, duplicate recognizer, or lost saved fact |

## Automated coverage added in this branch\n\n`SofiaMemoryInstrumentedTest` currently covers: fact persistence across memory-object recreation, case-insensitive deduplication and removal, the 40-turn history bound, invalid-role and blank-fact rejection, legacy plaintext migration, encryption at rest, the 500-character fact limit, and preservation of malformed facts/history payloads, and fail-closed handling of modified ciphertext. These tests are committed but have not yet been executed on an Android emulator or device.\n\nThe test suite uses a separate SharedPreferences name (`sofia_memory_instrumented_test`). It must never call `clear()` on the production `sofia_memory_v1` preferences.\n\n## Release gates

1. Run the Android debug build and unit/instrumentation tests.
2. Run MEM-01 through MEM-14 on an Android device or emulator.
3. Verify that a normal app update preserves the same Keystore alias and existing encrypted values.
4. Verify that uninstall/reinstall behavior is documented separately. Android Keystore keys are app-install scoped and must not be assumed to survive uninstall.
5. Do not add automatic key deletion, automatic preference clearing, or silent fallback to an empty memory after decryption errors.
6. Do not log plaintext memory, ciphertext payloads, API credentials, or key material.

## Known limitations to resolve before calling memory production-ready

- Instrumentation tests now exist, but there is no verified Gradle wrapper or CI workflow in the repository, and the tests have not yet been executed.
- A Keystore key invalidation or uninstall can make ciphertext unreadable. A future recovery/export design must be explicit and must never pretend that lost encrypted data was recovered.
- The current memory API is synchronous. If memory volume grows, move persistence work off the main thread while preserving serialized writes.
- The app currently stores the identity profile separately from encrypted owner memory. This is intentional for now; do not move identity settings into the owner-facts store without a migration plan.
