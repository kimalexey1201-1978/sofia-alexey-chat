package com.sofia.ai

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale
import java.util.UUID

/**
 * Sofia's private, on-device memory store.
 *
 * The public API is intentionally independent of the persistence backend so the
 * implementation can move to SQLite/Room later without changing callers.
 * No memory content is written to logs or shipped in the APK.
 */
class MemoryEngine(context: Context) {
    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    init {
        migrateLegacyProfile()
    }

    enum class MemoryType(val wireName: String) {
        WORKING("working"),
        LONG_TERM("long_term"),
        EPISODIC("episodic"),
        PROCEDURAL("procedural");

        companion object {
            fun fromWire(value: String): MemoryType? = values().firstOrNull { it.wireName == value }
        }
    }

    data class MemoryRecord(
        val id: String,
        val type: MemoryType,
        val content: String,
        val source: String,
        val createdAt: Long,
        val updatedAt: Long,
        val confidence: Double,
        val importance: Int,
        val tags: List<String>,
        val sensitive: Boolean
    )

    data class ImportResult(val imported: Int, val skipped: Int, val total: Int)

    @Synchronized
    fun add(
        type: MemoryType,
        content: String,
        source: String = "owner",
        confidence: Double = 1.0,
        importance: Int = 3,
        tags: List<String> = emptyList(),
        sensitive: Boolean = false,
        id: String = UUID.randomUUID().toString()
    ): MemoryRecord {
        val clean = content.trim()
        require(clean.isNotEmpty()) { "Memory content cannot be empty" }
        require(clean.length <= MAX_RECORD_CHARS) { "Memory record is too large" }
        val now = System.currentTimeMillis()
        val record = MemoryRecord(
            id = id,
            type = type,
            content = clean,
            source = source.take(200),
            createdAt = now,
            updatedAt = now,
            confidence = confidence.coerceIn(0.0, 1.0),
            importance = importance.coerceIn(1, 5),
            tags = tags.map { it.trim().lowercase(Locale.ROOT) }.filter { it.isNotEmpty() }.distinct().take(30),
            sensitive = sensitive
        )
        val records = readRecords().toMutableList()
        val index = records.indexOfFirst { it.id == id }
        if (index >= 0) records[index] = record else records.add(record)
        writeRecords(records)
        return record
    }

    @Synchronized
    fun search(query: String, limit: Int = 20, includeSensitive: Boolean = false): List<MemoryRecord> {
        val terms = tokenize(query)
        if (terms.isEmpty()) return emptyList()
        return readRecords()
            .asSequence()
            .filter { includeSensitive || !it.sensitive }
            .map { it to score(it, terms) }
            .filter { it.second > 0 }
            .sortedWith(compareByDescending<Pair<MemoryRecord, Int>> { it.second }
                .thenByDescending { it.first.importance }
                .thenByDescending { it.first.updatedAt })
            .take(limit.coerceIn(1, 100))
            .map { it.first }
            .toList()
    }

    /**
     * Returns only query-relevant memory, never the entire profile.
     * Sensitive records require a stronger lexical match.
     */
    fun buildContext(query: String, maxRecords: Int = 8, maxChars: Int = 3000): String {
        val terms = tokenize(query)
        if (terms.isEmpty()) return ""
        val ranked = readRecords()
            .map { it to score(it, terms) }
            .filter { (record, score) -> score >= if (record.sensitive) 4 else 1 }
            .sortedWith(compareByDescending<Pair<MemoryRecord, Int>> { it.second }
                .thenByDescending { it.first.importance }
                .thenByDescending { it.first.updatedAt })
        val result = StringBuilder()
        var count = 0
        for ((record, _) in ranked) {
            if (count >= maxRecords.coerceIn(1, 20)) break
            val line = "- [${record.type.wireName}] ${record.content}"
            val extra = line.length + if (result.isEmpty()) 0 else 1
            if (result.length + extra > maxChars.coerceIn(256, 8000)) continue
            if (result.isNotEmpty()) result.append('\n')
            result.append(line)
            count++
        }
        return result.toString()
    }

    @Synchronized
    fun exportJson(): String {
        val records = JSONArray()
        readRecords().forEach { records.put(it.toJson()) }
        return JSONObject()
            .put("format", FORMAT_NAME)
            .put("schemaVersion", SCHEMA_VERSION)
            .put("exportedAt", System.currentTimeMillis())
            .put("records", records)
            .toString(2)
    }

    @Synchronized
    fun importJson(json: String): ImportResult {
        require(json.toByteArray(Charsets.UTF_8).size <= MAX_IMPORT_BYTES) { "Memory file is too large" }
        val root = JSONObject(json)
        require(root.optString("format") == FORMAT_NAME) { "Not a Sofia memory file" }
        val version = root.optInt("schemaVersion", -1)
        require(version in 1..SCHEMA_VERSION) { "Unsupported memory schema version" }
        val incoming = root.optJSONArray("records") ?: JSONArray()
        val records = readRecords().associateBy { it.id }.toMutableMap()
        var imported = 0
        var skipped = 0
        for (i in 0 until incoming.length()) {
            val item = incoming.optJSONObject(i)
            val parsed = try { item?.toRecord() } catch (_: Exception) { null }
            if (parsed == null) {
                skipped++
                continue
            }
            val existing = records[parsed.id]
            if (existing == null || parsed.updatedAt > existing.updatedAt) {
                records[parsed.id] = parsed
                imported++
            } else {
                skipped++
            }
        }
        writeRecords(records.values.toList())
        return ImportResult(imported, skipped, records.size)
    }

    @Synchronized
    fun count(): Int = readRecords().size

    @Synchronized
    fun delete(id: String): Boolean {
        val records = readRecords().toMutableList()
        val removed = records.removeAll { it.id == id }
        if (removed) writeRecords(records)
        return removed
    }

    @Synchronized
    fun clearAll() {
        writeRecords(emptyList())
    }

    private fun migrateLegacyProfile() {
        val legacy = appContext.getSharedPreferences("sofia_profile", Context.MODE_PRIVATE)
        val ownerName = legacy.getString("owner_name", null)?.trim().orEmpty()
        val preferredAddress = legacy.getString("preferred_address", null)?.trim().orEmpty()
        if (ownerName.isNotEmpty() && readRecords().none { it.id == LEGACY_OWNER_ID }) {
            add(
                type = MemoryType.LONG_TERM,
                content = "Имя владельца: $ownerName. Не использовать его автоматически как обращение.",
                source = "legacy_sofia_profile",
                importance = 5,
                tags = listOf("владелец", "имя", "профиль"),
                id = LEGACY_OWNER_ID
            )
        }
        if (preferredAddress.isNotEmpty() && readRecords().none { it.id == LEGACY_ADDRESS_ID }) {
            add(
                type = MemoryType.LONG_TERM,
                content = "Предпочтительное обращение к владельцу в голосовом режиме: $preferredAddress.",
                source = "legacy_sofia_profile",
                importance = 5,
                tags = listOf("владелец", "обращение", "голос"),
                id = LEGACY_ADDRESS_ID
            )
        }
    }

    private fun score(record: MemoryRecord, terms: Set<String>): Int {
        val content = tokenize(record.content)
        val tags = record.tags.toSet()
        var score = 0
        for (term in terms) {
            if (term in tags) score += 4
            if (term in content) score += 2
        }
        if (score > 0 && (record.type == MemoryType.LONG_TERM || record.type == MemoryType.PROCEDURAL)) score += 1
        return score
    }

    private fun tokenize(value: String): Set<String> =
        Regex("[\\p{L}\\p{N}]{2,}").findAll(value.lowercase(Locale.ROOT))
            .map { it.value }
            .toSet()

    private fun readRecords(): List<MemoryRecord> {
        val raw = prefs.getString(KEY_RECORDS, null) ?: return emptyList()
        return try {
            val array = JSONArray(raw)
            buildList {
                for (i in 0 until array.length()) {
                    val record = try { array.optJSONObject(i)?.toRecord() } catch (_: Exception) { null }
                    if (record != null) add(record)
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Memory store could not be parsed; preserving the raw value for recovery")
            emptyList()
        }
    }

    private fun writeRecords(records: List<MemoryRecord>) {
        val array = JSONArray()
        records.sortedBy { it.createdAt }.forEach { array.put(it.toJson()) }
        check(prefs.edit().putString(KEY_RECORDS, array.toString()).commit()) {
            "Could not persist Sofia memory"
        }
    }

    private fun MemoryRecord.toJson() = JSONObject()
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

    private fun JSONObject.toRecord(): MemoryRecord? {
        val id = optString("id").takeIf { it.isNotBlank() } ?: return null
        val type = MemoryType.fromWire(optString("type")) ?: return null
        val content = optString("content").trim().takeIf { it.isNotEmpty() && it.length <= MAX_RECORD_CHARS } ?: return null
        val tagsArray = optJSONArray("tags") ?: JSONArray()
        val tags = (0 until tagsArray.length()).mapNotNull { tagsArray.optString(it).takeIf { tag -> tag.isNotBlank() } }.take(30)
        return MemoryRecord(
            id = id,
            type = type,
            content = content,
            source = optString("source", "import").take(200),
            createdAt = optLong("createdAt", System.currentTimeMillis()).coerceAtLeast(0),
            updatedAt = optLong("updatedAt", System.currentTimeMillis()).coerceAtLeast(0),
            confidence = optDouble("confidence", 1.0).coerceIn(0.0, 1.0),
            importance = optInt("importance", 3).coerceIn(1, 5),
            tags = tags,
            sensitive = optBoolean("sensitive", false)
        )
    }

    companion object {
        private const val TAG = "SofiaMemory"
        private const val PREFS_NAME = "sofia_memory_engine"
        private const val KEY_RECORDS = "records_v1"
        private const val FORMAT_NAME = "sofia-memory"
        private const val SCHEMA_VERSION = 1
        private const val MAX_RECORD_CHARS = 12000
        private const val MAX_IMPORT_BYTES = 5 * 1024 * 1024
        private const val LEGACY_OWNER_ID = "legacy-profile-owner-name-v1"
        private const val LEGACY_ADDRESS_ID = "legacy-profile-preferred-address-v1"
    }
}
