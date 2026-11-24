package com.sofia.ai

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.fail
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SofiaMemoryInstrumentedTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    private val prefsName = "sofia_memory_instrumented_test"
    private val prefs by lazy { context.getSharedPreferences(prefsName, Context.MODE_PRIVATE) }

    @Before
    fun setUp() {
        // A dedicated test preference file prevents tests from touching owner memory.
        prefs.edit().clear().commit()
    }

    @After
    fun tearDown() {
        prefs.edit().clear().commit()
    }

    @Test
    fun explicitFactSurvivesMemoryRecreationAndCanBeRemoved() {
        val first = SofiaMemory(context, prefsName)
        first.rememberFact("Тестовый факт")
        first.rememberFact("тестовый факт")

        val reopened = SofiaMemory(context, prefsName)
        assertTrue(reopened.factsSummary().contains("Тестовый факт"))
        assertEquals(1, Regex("Тестовый факт").findAll(reopened.factsSummary()).count())

        assertTrue(reopened.forgetFact("ТЕСТОВЫЙ ФАКТ"))
        assertFalse(reopened.factsSummary().contains("Тестовый факт"))
    }

    @Test
    fun conversationSurvivesMemoryRecreationAndKeepsOnlyFortyTurns() {
        val memory = SofiaMemory(context, prefsName)
        repeat(45) { index ->
            memory.rememberTurn("user", "turn-$index")
        }

        val reopened = SofiaMemory(context, prefsName)
        val turns = reopened.recentTurns(100)
        assertEquals(40, turns.size)
        assertEquals("turn-5", turns.first().content)
        assertEquals("turn-44", turns.last().content)
    }

    @Test
    fun invalidRoleAndBlankFactsAreIgnored() {
        val memory = SofiaMemory(context, prefsName)
        memory.rememberTurn("system", "must-not-be-saved")
        memory.rememberFact("   ")

        assertTrue(memory.recentTurns().isEmpty())
        assertFalse(memory.factsSummary().contains("must-not-be-saved"))
    }

    @Test
    fun legacyPlaintextFactsAreMigratedToEncryptedStorageOnRead() {
        prefs.edit().putString("facts", """["legacy fact"]""").commit()

        val memory = SofiaMemory(context, prefsName)
        assertTrue(memory.factsSummary().contains("legacy fact"))

        val stored = prefs.getString("facts", null).orEmpty()
        assertTrue(stored.startsWith("enc:v1:"))
        assertFalse(stored.contains("legacy fact"))
    }

    @Test
    fun memoryPayloadsAreEncryptedAtRest() {
        val memory = SofiaMemory(context, prefsName)
        memory.rememberFact("private fact")
        memory.rememberTurn("user", "private conversation")

        val storedFacts = prefs.getString("facts", null).orEmpty()
        val storedConversation = prefs.getString("conversation", null).orEmpty()
        assertTrue(storedFacts.startsWith("enc:v1:"))
        assertTrue(storedConversation.startsWith("enc:v1:"))
        assertFalse(storedFacts.contains("private fact"))
        assertFalse(storedConversation.contains("private conversation"))
    }

    @Test
    fun factLengthIsBoundedToFiveHundredCharacters() {
        val memory = SofiaMemory(context, prefsName)
        memory.rememberFact("x".repeat(700))

        val summary = memory.factsSummary()
        assertEquals(500, Regex("x+").find(summary)?.value?.length)
    }

    @Test
    fun tamperedCiphertextFailsClosedAndRemainsStored() {
        val memory = SofiaMemory(context, prefsName)
        memory.rememberFact("protected fact")
        val original = prefs.getString("facts", null).orEmpty()
        val payload = original.removePrefix("enc:v1:")
        val replacement = if (payload.last() == 'A') 'B' else 'A'
        val corrupted = "enc:v1:" + payload.dropLast(1) + replacement
        prefs.edit().putString("facts", corrupted).commit()

        try {
            memory.factsSummary()
            fail("Tampered ciphertext must not be treated as an empty memory.")
        } catch (_: IllegalStateException) {
            // Expected: authenticated decryption rejects modified ciphertext.
        }
        assertEquals(corrupted, prefs.getString("facts", null))
    }

    @Test
    fun malformedFactsJsonIsNotOverwrittenByRememberFact() {
        val memory = SofiaMemory(context, prefsName)
        prefs.edit().putString("facts", "{broken-json").commit()

        memory.rememberFact("new fact")
        val encryptedAfterFirstAttempt = prefs.getString("facts", null)
        memory.rememberFact("another fact")
        val encryptedAfterSecondAttempt = prefs.getString("facts", null)

        assertTrue(encryptedAfterFirstAttempt.orEmpty().startsWith("enc:v1:"))
        assertEquals(encryptedAfterFirstAttempt, encryptedAfterSecondAttempt)
        assertTrue(memory.factsSummary().contains("не удалось прочитать"))
    }

    @Test
    fun malformedConversationJsonIsNotOverwrittenByRememberTurn() {
        val memory = SofiaMemory(context, prefsName)
        prefs.edit().putString("conversation", "{broken-json").commit()

        memory.rememberTurn("user", "new turn")
        val encryptedAfterFirstAttempt = prefs.getString("conversation", null)
        memory.rememberTurn("user", "another turn")
        val encryptedAfterSecondAttempt = prefs.getString("conversation", null)

        assertTrue(encryptedAfterFirstAttempt.orEmpty().startsWith("enc:v1:"))
        assertEquals(encryptedAfterFirstAttempt, encryptedAfterSecondAttempt)
        assertTrue(memory.recentTurns().isEmpty())
    }
}
