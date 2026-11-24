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

@RunWith(AndroidJUnit4::class)
class MemoryEngineInstrumentedTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    private val prefsName = "memory_engine_instrumented_test"
    private val legacyPrefsName = "memory_engine_legacy_profile_test"
    private val profileDestinationPrefsName = "memory_engine_profile_destination_test"
    private val historyDestinationPrefsName = "memory_engine_history_destination_test"

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
