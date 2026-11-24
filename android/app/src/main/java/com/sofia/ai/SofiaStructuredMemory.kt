package com.sofia.ai

import android.content.Context
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import java.util.Locale
import java.util.UUID

/**
 * Structured, encrypted memory for Sofia.
 * All persisted content passes through SofiaSecurePreferences (Android Keystore AES-GCM).
 */
internal class SofiaStructuredMemory(context: Context) {
    enum class Type(val wireName: String) {
        WORKING("working"),
        LONG_TERM("long_term"),
        EPISODIC("episodic"),
        PROCEDURAL("procedural")
    }

    data class Record(
        val id: String,
        val type: Type,
        val content: String,
        val source: String,
        val createdAt: Long,
        val updatedAt: Long,
        val confidence: Double,
        val importance: Int,
        val tags: List<String>,
        val sensitive: Boolean
    )

    private val prefs = context.applicationContext
        .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val secure = SofiaSecurePreferences(context.applicationContext, prefs)

    @Synchronized
    fun add(
        type: Type,
        content: String,
        source: String = "owner",
        confidence: Double = 1.0,
        importance: Int = 3,
        tags: List<String> = emptyList(),
        sensitive: Boolean = false,
        id: String = UUID.randomUUID().toString()
    ): Record {
        val clean = content.trim()
        require(clean.isNotEmpty()) { "Нельзя сохранить пустую запись." }
        require(clean.length <= MAX_RECORD_CHARS) { "Запись слишком большая." }
        require(id.isNotBlank() && id.length <= 128) { "Некорректный идентификатор записи." }
        val now = System.currentTimeMillis()
        val record = Record(
            id = id,
            type = type,
            content = clean,
            source = source.trim().take(200),
            createdAt = now,
            updatedAt = now,
            confidence = confidence.coerceIn(0.0, 1.0),
            importance = importance.coerceIn(1, 5),
            tags = tags.map { it.trim().lowercase(Locale.ROOT) }
                .filter { it.isNotEmpty() }.distinct().take(30),
            sensitive = sensitive
        )
        val records = readRecords().toMutableList()
        val index = records.indexOfFirst { it.id == id }
        if (index >= 0) records[index] = record else records.add(record)
        writeRecords(records)
        return record
    }

    @Synchronized
    fun search(query: String, limit: Int = 20, includeSensitive: Boolean = false): List<Record> {
        val terms = tokenize(query)
        if (terms.isEmpty()) return emptyList()
        return readRecords()
            .asSequence()
            .filter { includeSensitive || !it.sensitive }
            .map { it to score(it, terms) }
            .filter { it.second > 0 }
            .sortedWith(compareByDescending<Pair<Record, Int>> { it.second }
                .thenByDescending { it.first.importance }
                .thenByDescending { it.first.updatedAt })
            .take(limit.coerceIn(1, 100))
            .map { it.first }
            .toList()
    }

    /** Sensitive records are deliberately excluded from automatic prompt context. */
    @Synchronized
    fun buildContext(query: String, maxRecords: Int = 6, maxChars: Int = 2200): String {
        val terms = tokenize(query)
        if (terms.isEmpty()) return ""
        val ranked = readRecords()
            .asSequence()
            .filter { !it.sensitive }
            .map { it to score(it, terms) }
            .filter { it.second > 0 }
            .sortedWith(compareByDescending<Pair<Record, Int>> { it.second }
                .thenByDescending { it.first.importance }
                .thenByDescending { it.first.updatedAt })
        val result = StringBuilder()
        for ((record, _) in ranked) {
            if (result.count { it == '\n' } >= maxRecords.coerceIn(1, 12) - 1) break
            val line = "- [${record.type.wireName}] ${record.content}"
            val extra = line.length + if (result.isEmpty()) 0 else 1
            if (result.length + extra > maxChars.coerceIn(256, 5000)) continue
            if (result.isNotEmpty()) result.append('\n')
            result.append(line)
        }
        return result.toString()
    }

    @Synchronized
    fun delete(id: String): Boolean {
        val records = readRecords().toMutableList()
        val removed = records.removeAll { it.id == id }
        if (removed) writeRecords(records)
        return removed
    }

    @Synchronized
    fun deleteByContent(content: String): Boolean {
        val target = content.trim()
        if (target.isEmpty()) return false
        val records = readRecords().toMutableList()
        val removed = records.removeAll { it.content.equals(target, ignoreCase = true) }
        if (removed) writeRecords(records)
        return removed
    }

    @Synchronized
    fun count(): Int = readRecords().size

    private fun score(record: Record, terms: Set<String>): Int {
        val contentTerms = tokenize(record.content)
        var value = 0
        for (term in terms) {
            if (term in record.tags) value += 4
            if (term in contentTerms) value += 2
        }
        if (value > 0 && (record.type == Type.LONG_TERM || record.type == Type.PROCEDURAL)) value++
        return value
    }

    private fun tokenize(value: String): Set<String> =
        Regex("[\\p{L}\\p{N}]{2,}").findAll(value.lowercase(Locale.ROOT))
            .map { it.value }.toSet()

    private fun readRecords(): List<Record> {
        val raw = secure.getString(KEY_RECORDS, "[]") ?: "[]"
        val parsed = try {
            val array = JSONArray(raw)
            buildList {
                for (i in 0 until array.length()) {
                    val item = array.optJSONObject(i) ?: continue
                    val record = try { item.toRecord() } catch (_: JSONException) { null }
                    if (record != null) add(record)
                }
            }
        } catch (_: JSONException) {
            // Keep the encrypted source untouched for recovery; never overwrite it with an empty list.
            emptyList()
        }
        val cutoff = System.currentTimeMillis() - WORKING_TTL_MS
        return parsed.filter { it.type != Type.WORKING || it.updatedAt >= cutoff }
    }

    private fun writeRecords(records: List<Record>) {
        val array = JSONArray()
        records.sortedBy { it.createdAt }.forEach { array.put(it.toJson()) }
        secure.putString(KEY_RECORDS, array.toString())
    }

    private fun Record.toJson() = JSONObject()
        .put("id", id)
        .put("type", type.wireName)
        .put("content", content)
        .put("source", source)
        .put("createdAt", createdAt)
        .put("updatedAt", updatedAt)
        .put("confidence", confidence)
        .put("importance", importance)
        .put("tags", JSONArray(tags))
        .put("sensitive", sensitive)

    private fun JSONObject.toRecord(): Record? {
        val id = optString("id").takeIf { it.isNotBlank() && it.length <= 128 } ?: return null
        val type = Type.values().firstOrNull { it.wireName == optString("type") } ?: return null
        val content = optString("content").trim()
            .takeIf { it.isNotEmpty() && it.length <= MAX_RECORD_CHARS } ?: return null
        val tagsArray = optJSONArray("tags") ?: JSONArray()
        val tags = (0 until tagsArray.length())
            .mapNotNull { tagsArray.optString(it).trim().takeIf(String::isNotEmpty) }
            .take(30)
        return Record(
            id = id,
            type = type,
            content = content,
            source = optString("source", "owner").take(200),
            createdAt = optLong("createdAt", 0L).coerceAtLeast(0L),
            updatedAt = optLong("updatedAt", 0L).coerceAtLeast(0L),
            confidence = optDouble("confidence", 1.0).coerceIn(0.0, 1.0),
            importance = optInt("importance", 3).coerceIn(1, 5),
            tags = tags,
            sensitive = optBoolean("sensitive", false)
        )
    }

    companion object {
        private const val PREFS_NAME = "sofia_structured_memory_v1"
        private const val KEY_RECORDS = "records"
        private const val MAX_RECORD_CHARS = 12000
        private const val WORKING_TTL_MS = 24L * 60L * 60L * 1000L
    }
}
