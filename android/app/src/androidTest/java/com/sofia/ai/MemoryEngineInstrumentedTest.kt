package com.sofia.ai

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class MemoryEngineInstrumentedTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    private val prefsName = "memory_engine_instrumented_test"
    private val legacyPrefsName = "memory_engine_legacy_profile_test"
    private val profileDestinationPrefsName = "memory_engine_profile_destination_test"
    private val historyDestinationPrefsName = "memory_engine_history_destination_test"
    private val concurrentPrefsName = "memory_engine_concurrent_test"

    private fun engine() = MemoryEngine(
        context = context,
        preferencesName = prefsName,
        legacyProfilePreferencesName = null,
        legacyMemoryPreferencesName = null
    )

    @After
    fun cleanUp() {
        context.getSharedPreferences(prefsName, Context.MODE_PRIVATE).edit().clear().commit()
        context.getSharedPreferences(legacyPrefsName, Context.MODE_PRIVATE).edit().clear().commit()
        context.getSharedPreferences("memory_engine_migration_destination", Context.MODE_PRIVATE).edit().clear().commit()
        context.getSharedPreferences(profileDestinationPrefsName, Context.MODE_PRIVATE).edit().clear().commit()
        context.getSharedPreferences(historyDestinationPrefsName, Context.MODE_PRIVATE).edit().clear().commit()
        context.getSharedPreferences(concurrentPrefsName, Context.MODE_PRIVATE).edit().clear().commit()
    }

    @Test
    fun recordsPersistAcrossEngineRecreationAndStableIdsUpdateInPlace() {
        val first = engine()
        val original = first.add(
            type = MemoryEngine.MemoryType.LONG_TERM,
            content = "Проект использует модульную архитектуру",
            id = "architecture"
        )
        val updated = first.add(
            type = MemoryEngine.MemoryType.LONG_TERM,
            content = "Обновлённое описание архитектуры",
            id = "architecture"
        )

        assertEquals(original.createdAt, updated.createdAt)
        assertTrue(updated.updatedAt >= original.updatedAt)

        val reopened = engine()
        assertEquals(1, reopened.count())
        assertEquals(
            "Обновлённое описание архитектуры",
            reopened.search("архитектуры").single().content
        )
    }


    @Test
    fun concurrentAddsAcrossIndependentEngineInstancesDoNotLoseRecords() {
        val workers = 8
        val recordsPerWorker = 10
        val ready = CountDownLatch(workers)
        val start = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(workers)
        try {
            val tasks = (0 until workers).map { worker ->
                executor.submit {
                    val independentEngine = MemoryEngine(
                        context = context,
                        preferencesName = concurrentPrefsName,
                        legacyProfilePreferencesName = null,
                        legacyMemoryPreferencesName = null
                    )
                    ready.countDown()
                    check(start.await(10, TimeUnit.SECONDS))
                    repeat(recordsPerWorker) { index ->
                        independentEngine.add(
                            type = MemoryEngine.MemoryType.LONG_TERM,
                            content = "Concurrent record $worker $index",
                            id = "concurrent-$worker-$index"
                        )
                    }
                }
            }
            assertTrue("Workers did not become ready", ready.await(10, TimeUnit.SECONDS))
            start.countDown()
            tasks.forEach { it.get(60, TimeUnit.SECONDS) }

            val reopened = MemoryEngine(
                context = context,
                preferencesName = concurrentPrefsName,
                legacyProfilePreferencesName = null,
                legacyMemoryPreferencesName = null
            )
            assertEquals(workers * recordsPerWorker, reopened.count())
        } finally {
            start.countDown()
            executor.shutdownNow()
        }
    }

    @Test
    fun contextContainsOnlyRelevantNonSensitiveRecords() {
        val memory = engine()
        memory.add(
            type = MemoryEngine.MemoryType.LONG_TERM,
            content = "Sofia AI использует модульную архитектуру",
            tags = listOf("архитектура", "проект")
        )
        memory.add(
            type = MemoryEngine.MemoryType.LONG_TERM,
            content = "Конфиденциальная запись владельца",
            tags = listOf("архитектура"),
            sensitive = true
        )
        memory.add(
            type = MemoryEngine.MemoryType.EPISODIC,
            content = "Вчера шёл дождь в городе"
        )

        val contextText = memory.buildContext("Расскажи об архитектуре проекта")

        assertTrue(contextText.contains("модульную архитектуру"))
        assertFalse(contextText.contains("Конфиденциальная запись"))
        assertFalse(contextText.contains("шёл дождь"))
    }

    @Test
    fun voiceOutputSanitizerRemovesEmojiShortcodesAndTextEmoticons() {
        val spoken = VoiceOutputSanitizer.sanitize("Привет 😊 :smile: :) <3")
        assertTrue(spoken.contains("Привет"))
        assertFalse(spoken.contains("😊"))
        assertFalse(spoken.contains(":smile:"))
        assertFalse(spoken.contains(":)"))
        assertFalse(spoken.contains("<3"))
    }

    @Test
    fun voiceOutputSanitizerCorrectsFeminineSelfReferenceOnly() {
        val spoken = VoiceOutputSanitizer.sanitize(
            "Я понял, я готов, я уже проверил. Ты сказал это, а он понял."
        )
        assertTrue(spoken.contains("Я поняла"))
        assertTrue(spoken.contains("я готова"))
        assertTrue(spoken.contains("я уже проверила"))
        assertTrue(spoken.contains("Ты сказал"))
        assertTrue(spoken.contains("он понял"))
    }

    @Test
    fun voiceOutputSanitizerRemovesEmojiOnlySpeechInsteadOfNamingSymbols() {
        assertEquals("", VoiceOutputSanitizer.sanitize("😊😂❤️"))
    }

    @Test
    fun voiceContextAlwaysIncludesSeededOwnerProfile() {
        val memory = MemoryEngine(
            context = context,
            preferencesName = prefsName,
            legacyProfilePreferencesName = null,
            legacyMemoryPreferencesName = null,
            seedOwnerProfile = true
        )

        val voiceContext = memory.buildContext(
            query = "Что ты знаешь обо мне?",
            maxRecords = 8,
            maxChars = 5000,
            includeOwnerProfile = true
        )

        assertTrue(voiceContext.contains("ПРОФИЛЬ ВЛАДЕЛЬЦА"))
        assertTrue(voiceContext.contains("Южной Корее"))
        assertTrue(memory.buildContext("Что ты знаешь обо мне?").isEmpty())
    }

    @Test
    fun migratedOwnerProfileRecordsAreSensitiveAndExcludedFromModelContext() {
        val legacyPrefs = context.getSharedPreferences(legacyPrefsName, Context.MODE_PRIVATE)
        val legacyProfile = SofiaSecurePreferences(legacyPrefs, "owner-profile")
        legacyProfile.putString("owner_name", "Private Owner Name")
        legacyProfile.putString("preferred_address", "Private Voice Address")

        val memory = MemoryEngine(
            context = context,
            preferencesName = prefsName,
            legacyProfilePreferencesName = legacyPrefsName,
            legacyMemoryPreferencesName = null
        )

        val migratedOwner = memory.search("Private Owner", includeSensitive = true)
            .single { it.content.contains("Private Owner Name") }
        assertTrue(migratedOwner.sensitive)
        val migratedAddress = memory.search("Private Voice Address", includeSensitive = true)
            .single { it.content.contains("Private Voice Address") }
        assertTrue(migratedAddress.sensitive)
        assertTrue(memory.buildContext("Private Owner Name").isEmpty())
        assertTrue(memory.buildContext("Private Voice Address").isEmpty())
    }

    @Test
    fun encryptedRecordsAreNotStoredAsPlaintext() {
        val memory = engine()
        memory.add(
            type = MemoryEngine.MemoryType.LONG_TERM,
            content = "private memory payload",
            id = "private-record"
        )

        val raw = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
            .getString("records_v1", null).orEmpty()

        assertTrue(raw.startsWith("enc:v1:"))
        assertFalse(raw.contains("private memory payload"))
    }

    @Test
    fun malformedStoredJsonIsPreservedAndNeverOverwritten() {
        val prefs = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
        val secure = SofiaSecurePreferences(prefs, "structured-memory")
        secure.putString("records_v1", "{broken-json")
        val original = prefs.getString("records_v1", null)

        val memory = engine()
        var failedClosed = false
        try {
            memory.add(
                type = MemoryEngine.MemoryType.LONG_TERM,
                content = "must not overwrite recoverable data"
            )
        } catch (_: IllegalStateException) {
            failedClosed = true
        }

        assertTrue(failedClosed)
        assertEquals(original, prefs.getString("records_v1", null))
    }

    @Test
    fun tamperedCiphertextFailsClosedAndRemainsUntouched() {
        val prefs = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
        engine().add(
            type = MemoryEngine.MemoryType.LONG_TERM,
            content = "protected record",
            id = "protected"
        )
        val original = prefs.getString("records_v1", null).orEmpty()
        val payload = original.removePrefix("enc:v1:")
        val replacement = if (payload.first() == 'A') 'B' else 'A'
        val corrupted = "enc:v1:" + replacement + payload.drop(1)
        prefs.edit().putString("records_v1", corrupted).commit()

        var failedClosed = false
        try {
            engine().count()
        } catch (_: IllegalStateException) {
            failedClosed = true
        }

        assertTrue(failedClosed)
        assertEquals(corrupted, prefs.getString("records_v1", null))
    }

    @Test
    fun exportCanBeImportedIntoAnIsolatedStore() {
        val source = engine()
        source.add(
            type = MemoryEngine.MemoryType.PROCEDURAL,
            content = "Всегда проверять результат независимым модулем",
            tags = listOf("проверка", "правило"),
            id = "verification-rule"
        )
        val exported = source.exportJson()

        val destination = MemoryEngine(
            context = context,
            preferencesName = "memory_engine_import_test",
            legacyProfilePreferencesName = null,
            legacyMemoryPreferencesName = null
        )
        try {
            val result = destination.importJson(exported)
            assertEquals(1, result.imported)
            assertEquals("verification-rule", destination.search("независимым модулем").single().id)
        } finally {
            context.getSharedPreferences("memory_engine_import_test", Context.MODE_PRIVATE)
                .edit().clear().commit()
        }
    }

    @Test
    fun importSkipsRecordsWithImpossibleTimestamps() {
        val memory = engine()
        val valid = org.json.JSONObject()
            .put("id", "valid-time")
            .put("type", "long_term")
            .put("content", "Корректная запись")
            .put("createdAt", 100L)
            .put("updatedAt", 200L)
        val invalid = org.json.JSONObject()
            .put("id", "invalid-time")
            .put("type", "long_term")
            .put("content", "Запись с неверной хронологией")
            .put("createdAt", 300L)
            .put("updatedAt", 200L)
        val payload = org.json.JSONObject()
            .put("format", "sofia-memory")
            .put("schemaVersion", 1)
            .put("records", org.json.JSONArray().put(valid).put(invalid))

        val result = memory.importJson(payload.toString())

        assertEquals(1, result.imported)
        assertEquals(1, result.skipped)
        assertEquals(1, memory.count())
        assertTrue(memory.search("Корректная запись").any { it.id == "valid-time" })
        assertTrue(memory.search("неверной хронологией").isEmpty())
    }

    @Test
    fun malformedLegacyFactsAbortMigrationWithoutChangingSource() {
        val legacy = context.getSharedPreferences(legacyPrefsName, Context.MODE_PRIVATE)
        val malformed = "{not-a-valid-facts-array"
        legacy.edit().putString("facts", malformed).commit()

        var failedClosed = false
        try {
            MemoryEngine(
                context = context,
                preferencesName = "memory_engine_bad_legacy_destination",
                legacyProfilePreferencesName = null,
                legacyMemoryPreferencesName = legacyPrefsName
            )
        } catch (_: IllegalStateException) {
            failedClosed = true
        }

        assertTrue(failedClosed)
        assertEquals(malformed, legacy.getString("facts", null))
        assertFalse(
            context.getSharedPreferences("memory_engine_bad_legacy_destination", Context.MODE_PRIVATE)
                .contains("records_v1")
        )
    }

    @Test
    fun malformedLegacyConversationPreservesSourceAndAllowsIdempotentRetry() {
        // Bootstrap the legacy AES/GCM key before encrypting fixture values.
        engine().add(
            type = MemoryEngine.MemoryType.LONG_TERM,
            content = "keystore bootstrap for malformed conversation",
            id = "conversation-bootstrap"
        )
        val legacy = context.getSharedPreferences(legacyPrefsName, Context.MODE_PRIVATE)
        val factsRaw = org.json.JSONArray().put("Факт для частичной миграции").toString()
        val brokenConversation = "{broken-conversation-json"
        val factsCiphertext = encryptLegacy(factsRaw, "facts")
        val conversationCiphertext = encryptLegacy(brokenConversation, "conversation")
        legacy.edit()
            .putString("facts", factsCiphertext)
            .putString("conversation", conversationCiphertext)
            .commit()

        var failedClosed = false
        try {
            MemoryEngine(
                context = context,
                preferencesName = "memory_engine_bad_conversation_destination",
                legacyProfilePreferencesName = null,
                legacyMemoryPreferencesName = legacyPrefsName,
                profileDestinationPreferencesName = profileDestinationPrefsName,
                conversationDestinationPreferencesName = historyDestinationPrefsName
            )
        } catch (_: IllegalStateException) {
            failedClosed = true
        }

        assertTrue(failedClosed)
        assertEquals(factsCiphertext, legacy.getString("facts", null))
        assertEquals(conversationCiphertext, legacy.getString("conversation", null))

        val destinationName = "memory_engine_bad_conversation_destination"
        val partial = MemoryEngine(
            context = context,
            preferencesName = destinationName,
            legacyProfilePreferencesName = null,
            legacyMemoryPreferencesName = null
        )
        assertEquals(1, partial.search("Факт для частичной миграции").size)

        val repairedConversation = org.json.JSONArray()
            .put(org.json.JSONObject().put("role", "user").put("content", "Восстановленная история").put("at", 300L))
            .toString()
        val repairedCiphertext = encryptLegacy(repairedConversation, "conversation")
        legacy.edit().putString("conversation", repairedCiphertext).commit()

        val retried = MemoryEngine(
            context = context,
            preferencesName = destinationName,
            legacyProfilePreferencesName = null,
            legacyMemoryPreferencesName = legacyPrefsName,
            profileDestinationPreferencesName = profileDestinationPrefsName,
            conversationDestinationPreferencesName = historyDestinationPrefsName
        )

        assertEquals(1, retried.search("Факт для частичной миграции").size)
        assertEquals(1, retried.search("Восстановленная история", includeSensitive = true).size)
        val history = SofiaSecurePreferences(
            context.getSharedPreferences(historyDestinationPrefsName, Context.MODE_PRIVATE),
            "conversation-history"
        ).getString("conversation_history", null)
        assertEquals(1, org.json.JSONArray(history).length())
        assertEquals(factsCiphertext, legacy.getString("facts", null))
        assertEquals(repairedCiphertext, legacy.getString("conversation", null))
    }

    @Test
    fun importRejectsMoreThanMaximumRecordsWithoutChangingStoredMemory() {
        val memory = engine()
        memory.add(
            type = MemoryEngine.MemoryType.LONG_TERM,
            content = "Existing record must survive rejected import",
            id = "existing-before-large-import"
        )
        val records = org.json.JSONArray()
        repeat(10001) { index ->
            records.put(
                org.json.JSONObject()
                    .put("id", "bulk-$index")
                    .put("type", "long_term")
                    .put("content", "Bulk record $index")
                    .put("createdAt", 100L)
                    .put("updatedAt", 100L)
            )
        }
        val payload = org.json.JSONObject()
            .put("format", "sofia-memory")
            .put("schemaVersion", 1)
            .put("records", records)

        var rejected = false
        try {
            memory.importJson(payload.toString())
        } catch (_: IllegalArgumentException) {
            rejected = true
        }

        assertTrue("Import over 10000 records must be rejected", rejected)
        assertEquals(1, memory.count())
        assertEquals(
            "Existing record must survive rejected import",
            memory.search("Existing record").single().content
        )
    }

    @Test
    fun securePreferencesConcurrentInstancesKeepSharedValueReadable() {
        val prefs = context.getSharedPreferences(
            "secure_preferences_concurrent_test",
            Context.MODE_PRIVATE
        )
        val initial = "legacy plaintext value"
        prefs.edit().putString("shared-key", initial).commit()
        // Complete the one-time plaintext migration before starting concurrent writers.
        assertEquals(initial, SofiaSecurePreferences(prefs, "concurrent-test")
            .getString("shared-key", null))

        val workers = 8
        val ready = CountDownLatch(workers)
        val start = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(workers)
        try {
            val tasks = (0 until workers).map {
                executor.submit {
                    val secure = SofiaSecurePreferences(prefs, "concurrent-test")
                    ready.countDown()
                    check(start.await(10, TimeUnit.SECONDS))
                    assertTrue(secure.getString("shared-key", null)?.isNotBlank() == true)
                    secure.putString("shared-key", "updated-by-worker-$it")
                }
            }
            assertTrue("Workers did not become ready", ready.await(10, TimeUnit.SECONDS))
            start.countDown()
            tasks.forEach { it.get(60, TimeUnit.SECONDS) }

            val reopened = SofiaSecurePreferences(prefs, "concurrent-test")
            val finalValue = reopened.getString("shared-key", null)
            assertTrue(finalValue?.startsWith("updated-by-worker-") == true)
            assertTrue(prefs.getString("shared-key", null).orEmpty().startsWith("enc:v1:"))
        } finally {
            start.countDown()
            executor.shutdownNow()
            prefs.edit().clear().commit()
        }
    }

    @Test
    fun missingKeystoreKeyPreservesCiphertextAndDoesNotCreateReplacementKey() {
        val alias = "sofia_test_missing_key_${System.currentTimeMillis()}"
        val prefsName = "secure_preferences_missing_key_test"
        val prefs = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
        val keyStore = java.security.KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        try {
            val secure = SofiaSecurePreferences(prefs, "missing-key-test", alias)
            secure.putString("protected-value", "recoverable encrypted payload")
            val originalCiphertext = prefs.getString("protected-value", null)
            assertTrue(originalCiphertext.orEmpty().startsWith("enc:v1:"))
            assertFalse(originalCiphertext.orEmpty().contains("recoverable encrypted payload"))

            keyStore.deleteEntry(alias)
            var rejected = false
            try {
                secure.getString("protected-value", null)
            } catch (_: IllegalStateException) {
                rejected = true
            }

            assertTrue("Reading ciphertext without its key must fail closed", rejected)
            assertEquals("Ciphertext must remain byte-for-byte unchanged", originalCiphertext,
                prefs.getString("protected-value", null))
            assertFalse("A replacement key must not be generated during failed decryption",
                keyStore.containsAlias(alias))
        } finally {
            keyStore.deleteEntry(alias)
            prefs.edit().clear().commit()
        }
    }
    private fun encryptLegacy(value: String, keyName: String): String {
        val keyStore = java.security.KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val secret = keyStore.getKey("sofia_memory_aes_gcm_v1", null) as javax.crypto.SecretKey
        val cipher = javax.crypto.Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(javax.crypto.Cipher.ENCRYPT_MODE, secret)
        cipher.updateAAD(keyName.toByteArray(Charsets.UTF_8))
        val encrypted = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        return "enc:v1:" + android.util.Base64.encodeToString(cipher.iv + encrypted, android.util.Base64.NO_WRAP)
    }

    @Test
    fun legacyV1FactsConversationAndProfileMigrateWithoutChangingSource() {
        // Create the same Android Keystore key used by the legacy implementation.
        engine().add(
            type = MemoryEngine.MemoryType.LONG_TERM,
            content = "keystore bootstrap",
            id = "bootstrap"
        )
        val legacyPrefs = context.getSharedPreferences(legacyPrefsName, Context.MODE_PRIVATE)
        val facts = org.json.JSONArray()
            .put("Старый факт номер один")
            .put("Старый факт номер два")
        val turns = org.json.JSONArray()
            .put(org.json.JSONObject().put("role", "user").put("content", "Прежний вопрос").put("at", 100L))
            .put(org.json.JSONObject().put("role", "assistant").put("content", "Прежний ответ").put("at", 200L))
        val sourceValues = mapOf(
            "facts" to facts.toString(),
            "conversation" to turns.toString(),
            "preferred_address" to "мой хороший",
            "language" to "Russian",
            "owner_label" to "Владелец теста"
        )
        sourceValues.forEach { (key, value) ->
            legacyPrefs.edit().putString(key, encryptLegacy(value, key)).commit()
        }
        val originalFacts = legacyPrefs.getString("facts", null)
        val originalConversation = legacyPrefs.getString("conversation", null)

        val migrated = MemoryEngine(
            context = context,
            preferencesName = "memory_engine_migration_destination",
            legacyProfilePreferencesName = null,
            legacyMemoryPreferencesName = legacyPrefsName,
            profileDestinationPreferencesName = profileDestinationPrefsName,
            conversationDestinationPreferencesName = historyDestinationPrefsName
        )

        assertTrue(migrated.search("Старый факт номер один").any {
            it.type == MemoryEngine.MemoryType.LONG_TERM && it.content == "Старый факт номер один"
        })
        assertTrue(migrated.search("Старый факт номер два").any { it.content == "Старый факт номер два" })
        assertTrue(migrated.search("Прежний вопрос", includeSensitive = true).any {
            it.type == MemoryEngine.MemoryType.EPISODIC && it.sensitive
        })
        val migratedOwnerLabel = migrated.search("Владелец теста", includeSensitive = true).single()
        assertTrue(migratedOwnerLabel.sensitive)
        assertTrue(migrated.buildContext("Владелец теста").isEmpty())
        assertEquals(originalFacts, legacyPrefs.getString("facts", null))
        assertEquals(originalConversation, legacyPrefs.getString("conversation", null))

        val profile = SofiaSecurePreferences(
            context.getSharedPreferences(profileDestinationPrefsName, Context.MODE_PRIVATE),
            "owner-profile"
        )
        assertEquals("мой хороший", profile.getString("preferred_address", null))
        assertEquals("Владелец теста", profile.getString("owner_name", null))

        val history = SofiaSecurePreferences(
            context.getSharedPreferences(historyDestinationPrefsName, Context.MODE_PRIVATE),
            "conversation-history"
        ).getString("conversation_history", null)
        assertEquals(2, org.json.JSONArray(history).length())

        val beforeReopen = migrated.count()
        val reopened = MemoryEngine(
            context = context,
            preferencesName = "memory_engine_migration_destination",
            legacyProfilePreferencesName = null,
            legacyMemoryPreferencesName = legacyPrefsName,
            profileDestinationPreferencesName = profileDestinationPrefsName,
            conversationDestinationPreferencesName = historyDestinationPrefsName
        )
        assertEquals(beforeReopen, reopened.count())
        assertEquals(2, org.json.JSONArray(
            SofiaSecurePreferences(
                context.getSharedPreferences(historyDestinationPrefsName, Context.MODE_PRIVATE),
                "conversation-history"
            ).getString("conversation_history", null)
        ).length())
    }

    @Test
    fun legacyProfileMigrationIsEncryptedAndIdempotent() {
        val legacy = context.getSharedPreferences(legacyPrefsName, Context.MODE_PRIVATE)
        legacy.edit()
            .putString("owner_name", "Тестовый владелец")
            .putString("preferred_address", "мой хороший")
            .commit()

        val migrated = MemoryEngine(
            context,
            prefsName,
            legacyPrefsName,
            legacyMemoryPreferencesName = null
        )
        assertEquals(2, migrated.count())

        val encryptedName = legacy.getString("owner_name", null).orEmpty()
        val encryptedAddress = legacy.getString("preferred_address", null).orEmpty()
        assertTrue(encryptedName.startsWith("enc:v1:"))
        assertTrue(encryptedAddress.startsWith("enc:v1:"))
        assertFalse(encryptedName.contains("Тестовый владелец"))

        val reopened = MemoryEngine(
            context,
            prefsName,
            legacyPrefsName,
            legacyMemoryPreferencesName = null
        )
        assertEquals(2, reopened.count())
    }
}
