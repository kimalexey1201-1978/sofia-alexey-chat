package com.sofia.ai

import android.content.Context
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

/**
 * App-private persistent memory for Sofia.
 *
 * v1 deliberately keeps memory on this Android installation. It stores a small
 * profile, explicit facts and a bounded conversation history. It does not
 * silently infer or promote sensitive details into long-term facts.
 */
class SofiaMemory(
    context: Context,
    preferencesName: String = "sofia_memory_v1"
) {
    private val prefs = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
    private val securePrefs = SofiaSecurePreferences(context, prefs)

    init {
        // Voice-mode address preference supplied by the owner.
        if (!securePrefs.contains("preferred_address") || !securePrefs.contains("language")) {
            securePrefs.putString("preferred_address", securePrefs.getString("preferred_address", "мой хороший") ?: "мой хороший")
            securePrefs.putString("language", securePrefs.getString("language", "Russian") ?: "Russian")
        }
    }

    data class Turn(val role: String, val content: String)

    @Synchronized
    fun profileContext(): String {
        val address = securePrefs.getString("preferred_address", "").orEmpty()
        val language = securePrefs.getString("language", "Russian").orEmpty()
        val owner = securePrefs.getString("owner_label", "").orEmpty()
        val facts = readFactsOrNull().orEmpty()
        return buildString {
            append("Я София, личный помощник владельца этого устройства. ")
            append("Основной язык общения: ").append(language).append(". ")
            if (owner.isNotBlank()) append("Обращение к владельцу: ").append(owner).append(". ")
            else append("Не называй владельца по имени и не придумывай обращение. ")
            if (address.isNotBlank()) append("Предпочтительное обращение: ").append(address).append(". ")
            if (facts.isNotEmpty()) {
                append("\nДолговременная память владельца (сохранённые факты):\n")
                facts.forEach { append("- ").append(it).append("\n") }
            }
        }
    }

    @Synchronized
    fun recentTurns(limit: Int = 12): List<Turn> {
        val source = parseArrayOrNull(securePrefs.getString("conversation", "[]")) ?: return emptyList()
        val result = ArrayList<Turn>()
        val start = (source.length() - limit.coerceAtLeast(0)).coerceAtLeast(0)
        for (i in start until source.length()) {
            val item = source.optJSONObject(i) ?: continue
            val role = item.optString("role")
            val text = item.optString("content")
            if ((role == "user" || role == "assistant") && text.isNotBlank()) {
                result.add(Turn(role, text))
            }
        }
        return result
    }

    @Synchronized
    fun rememberTurn(role: String, content: String) {
        if (role != "user" && role != "assistant") return
        val clean = content.trim().take(6000)
        if (clean.isBlank()) return
        // Never replace malformed existing history with a new, apparently empty history.
        val turns = parseArrayOrNull(securePrefs.getString("conversation", "[]")) ?: return
        turns.put(JSONObject().put("role", role).put("content", clean).put("at", System.currentTimeMillis()))
        val bounded = JSONArray()
        val start = (turns.length() - 40).coerceAtLeast(0)
        for (i in start until turns.length()) {
            val item = turns.optJSONObject(i) ?: return
            bounded.put(item)
        }
        securePrefs.putString("conversation", bounded.toString())
    }

    @Synchronized
    fun factsSummary(): String {
        val facts = readFactsOrNull()
            ?: return "Не удалось прочитать сохранённые факты. Исходные данные не изменены."
        return if (facts.isEmpty()) "Пока нет сохранённых долговременных фактов."
        else "Вот что сохранено в моей памяти:\n" + facts.mapIndexed { index, fact -> "${index + 1}. $fact" }.joinToString("\n")
    }

    @Synchronized
    fun forgetFact(fact: String): Boolean {
        val facts = readFactsOrNull()?.toMutableList() ?: return false
        val index = facts.indexOfFirst { it.equals(fact.trim(), ignoreCase = true) }
        if (index < 0) return false
        facts.removeAt(index)
        securePrefs.putString("facts", JSONArray(facts).toString())
        return true
    }

    /** Save only facts explicitly confirmed by the owner or an explicit memory action. */
    @Synchronized
    fun rememberFact(fact: String) {
        val clean = fact.trim().take(500)
        if (clean.isBlank()) return
        // Do not overwrite a malformed facts document with a new partial list.
        val facts = readFactsOrNull()?.toMutableList() ?: return
        if (facts.none { it.equals(clean, ignoreCase = true) }) facts.add(clean)
        securePrefs.putString("facts", JSONArray(facts.takeLast(100)).toString())
    }

    @Synchronized
    fun setPreferredAddress(value: String) {
        securePrefs.putString("preferred_address", value.trim().take(80))
    }

    @Synchronized
    fun setOwnerLabel(value: String) {
        securePrefs.putString("owner_label", value.trim().take(80))
    }

    private fun readFactsOrNull(): List<String>? {
        val array = parseArrayOrNull(securePrefs.getString("facts", "[]")) ?: return null
        return (0 until array.length()).mapNotNull { array.optString(it).takeIf(String::isNotBlank) }
    }

    private fun parseArrayOrNull(value: String?): JSONArray? = try {
        JSONArray(value ?: "[]")
    } catch (_: JSONException) {
        null
    }
}
