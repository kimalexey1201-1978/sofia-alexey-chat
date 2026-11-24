package com.sofia.ai

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale
import java.util.UUID

/**
 * Sofia's private, encrypted, on-device memory store.
 * The persistence contract stays independent so the backend can later move to Room.
 */
class MemoryEngine(
    context: Context,
    preferencesName: String = "sofia_memory_engine",
    legacyProfilePreferencesName: String? = "sofia_profile",
    legacyMemoryPreferencesName: String? = "sofia_memory_v1",
    private val profileDestinationPreferencesName: String = "sofia_profile",
    private val conversationDestinationPreferencesName: String = "sofia_memory"
) {
    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
    private val secure = SofiaSecurePreferences(prefs, "structured-memory")

    init {
        synchronized(STORAGE_LOCK) {
        legacyProfilePreferencesName?.let(::migrateLegacyProfile)
        legacyMemoryPreferencesName?.let(::migrateLegacyMemory)
        seedOwnerKnowledge()
    
        }}

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
        synchronized(STORAGE_LOCK) {
        val clean = content.trim()
        require(clean.isNotEmpty()) { "Memory content cannot be empty" }
        require(clean.length <= MAX_RECORD_CHARS) { "Memory record is too large" }
        require(id.isNotBlank() && id.length <= 128) { "Invalid memory record ID" }
        val now = System.currentTimeMillis()
        val record = MemoryRecord(
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
        val persistedRecord = if (index >= 0) {
            // Updating a stable record must not rewrite its original creation time.
            record.copy(createdAt = records[index].createdAt).also { records[index] = it }
        } else {
            records.add(record)
            record
        }
        writeRecords(records)
        return persistedRecord
    
        }}

    fun search(query: String, limit: Int = 20, includeSensitive: Boolean = false): List<MemoryRecord> {
        synchronized(STORAGE_LOCK) {
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
    
        }}

    /** Sensitive records are never added to automatic model context. */
    fun buildContext(query: String, maxRecords: Int = 8, maxChars: Int = 3000): String {
        synchronized(STORAGE_LOCK) {
        val terms = tokenize(query)
        if (terms.isEmpty()) return ""
        val ranked = readRecords()
            .asSequence()
            .filter { !it.sensitive }
            .map { it to score(it, terms) }
            .filter { it.second > 0 }
            .sortedWith(compareByDescending<Pair<MemoryRecord, Int>> { it.second }
                .thenByDescending { it.first.importance }
                .thenByDescending { it.first.updatedAt })
        val result = StringBuilder()
        var count = 0
        for ((record, _) in ranked) {
            if (count >= maxRecords.coerceIn(1, 12)) break
            val line = "- [${record.type.wireName}] ${record.content}"
            val extra = line.length + if (result.isEmpty()) 0 else 1
            if (result.length + extra > maxChars.coerceIn(256, 5000)) continue
            if (result.isNotEmpty()) result.append('\n')
            result.append(line)
            count++
        }
        return result.toString()
    
        }}

    fun summary(): String {
        synchronized(STORAGE_LOCK) {
        val records = readRecords().filter { !it.sensitive }
        if (records.isEmpty()) return "Структурированная память пока пуста."
        return records.sortedWith(compareBy<MemoryRecord> { it.type.ordinal }
            .thenByDescending { it.importance }
            .thenByDescending { it.updatedAt })
            .take(60)
            .mapIndexed { index, record -> "${index + 1}. [${record.type.wireName}] ${record.content}" }
            .joinToString("\n")
    
        }}

    fun exportJson(): String {
        synchronized(STORAGE_LOCK) {
        val records = JSONArray()
        readRecords().forEach { records.put(it.toJson()) }
        return JSONObject()
            .put("format", FORMAT_NAME)
            .put("schemaVersion", SCHEMA_VERSION)
            .put("exportedAt", System.currentTimeMillis())
            .put("records", records)
            .toString(2)
    
        }}

    fun importJson(json: String): ImportResult {
        synchronized(STORAGE_LOCK) {
        require(json.toByteArray(Charsets.UTF_8).size <= MAX_IMPORT_BYTES) { "Memory file is too large" }
        val root = JSONObject(json)
        require(root.optString("format") == FORMAT_NAME) { "Not a Sofia memory file" }
        val version = root.optInt("schemaVersion", -1)
        require(version in 1..SCHEMA_VERSION) { "Unsupported memory schema version" }
        val incoming = root.optJSONArray("records") ?: JSONArray()
        require(incoming.length() <= MAX_IMPORT_RECORDS) { "Memory file contains too many records" }
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
    
        }}

    fun count(): Int = synchronized(STORAGE_LOCK) { readRecords().size }

    fun delete(id: String): Boolean {
        synchronized(STORAGE_LOCK) {
        val records = readRecords().toMutableList()
        val removed = records.removeAll { it.id == id }
        if (removed) writeRecords(records)
        return removed
    
        }}

    fun deleteByContent(content: String): Boolean {
        synchronized(STORAGE_LOCK) {
        val target = content.trim()
        if (target.isEmpty()) return false
        val records = readRecords().toMutableList()
        val removed = records.removeAll { it.content.equals(target, ignoreCase = true) }
        if (removed) writeRecords(records)
        return removed
    
        }}

    fun clearAll() {
        synchronized(STORAGE_LOCK) {
        writeRecords(emptyList())
    
        }}

    private fun migrateLegacyProfile(preferencesName: String) {
        val legacy = appContext.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
        val secureLegacy = SofiaSecurePreferences(legacy, "owner-profile")
        val ownerName = secureLegacy.getString("owner_name", null)?.trim().orEmpty()
        val preferredAddress = secureLegacy.getString("preferred_address", null)?.trim().orEmpty()
        if (ownerName.isNotEmpty() && readRecords().none { it.id == LEGACY_OWNER_ID }) {
            add(
                type = MemoryType.LONG_TERM,
                content = "Имя владельца: $ownerName. Не использовать его автоматически как обращение.",
                source = "legacy_sofia_profile",
                importance = 5,
                tags = listOf("владелец", "имя", "профиль"),
                sensitive = true,
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
                sensitive = true,
                id = LEGACY_ADDRESS_ID
            )
        }
    }

    /**
     * Imports the v1 on-device memory without modifying or deleting its source values.
     * The old implementation encrypted each preference with AAD equal to the key name,
     * so this migration uses the read-only legacy decryptor and writes only to v2 stores.
     */
    private fun migrateLegacyMemory(preferencesName: String) {
        val legacyPrefs = appContext.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
        val legacy = SofiaSecurePreferences(legacyPrefs, "legacy-sofia-memory")

        val factsRaw = legacy.getLegacyString("facts", null)
        if (!factsRaw.isNullOrBlank()) {
            val facts = try { JSONArray(factsRaw) } catch (e: Exception) {
                throw IllegalStateException("Старая долговременная память повреждена. Исходные данные сохранены.", e)
            }
            for (i in 0 until facts.length()) {
                val fact = facts.optString(i).trim()
                if (fact.isNotEmpty()) {
                    add(
                        type = MemoryType.LONG_TERM,
                        content = fact,
                        source = "legacy_sofia_memory",
                        importance = 4,
                        tags = listOf("миграция", "долговременная память"),
                        id = stableLegacyId("fact", fact)
                    )
                }
            }
        }

        val conversationRaw = legacy.getLegacyString("conversation", null)
        if (!conversationRaw.isNullOrBlank()) {
            val oldTurns = try { JSONArray(conversationRaw) } catch (e: Exception) {
                throw IllegalStateException("Старая история диалога повреждена. Исходные данные сохранены.", e)
            }
            val validTurns = JSONArray()
            for (i in 0 until oldTurns.length()) {
                val item = oldTurns.optJSONObject(i) ?: continue
                val role = item.optString("role")
                val content = item.optString("content").trim()
                if ((role == "user" || role == "assistant") && content.isNotEmpty()) {
                    validTurns.put(JSONObject().put("role", role).put("content", content))
                    val timestamp = item.optLong("at", i.toLong()).coerceAtLeast(0)
                    add(
                        type = MemoryType.EPISODIC,
                        content = "$role: $content",
                        source = "legacy_conversation",
                        importance = 2,
                        tags = listOf("история диалога", role, "миграция"),
                        sensitive = true,
                        id = stableLegacyId("turn", "$role|$timestamp|$content")
                    )
                }
            }
            // Preserve the most recent turns for immediate conversational continuity.
            // Existing v2 history always wins; the legacy source remains untouched.
            if (validTurns.length() > 0) {
                val historyPrefs = appContext.getSharedPreferences(conversationDestinationPreferencesName, Context.MODE_PRIVATE)
                val historySecure = SofiaSecurePreferences(historyPrefs, "conversation-history")
                val existing = historySecure.getString("conversation_history", null)
                if (existing.isNullOrBlank()) {
                    val bounded = JSONArray()
                    val start = (validTurns.length() - 20).coerceAtLeast(0)
                    for (i in start until validTurns.length()) bounded.put(validTurns.getJSONObject(i))
                    historySecure.putString("conversation_history", bounded.toString())
                }
            }
        }

        val address = legacy.getLegacyString("preferred_address", null)?.trim().orEmpty()
        val language = legacy.getLegacyString("language", null)?.trim().orEmpty()
        val ownerLabel = legacy.getLegacyString("owner_label", null)?.trim().orEmpty()

        // Keep profile preferences in the profile namespace consumed by VoiceService.
        if (address.isNotEmpty() || ownerLabel.isNotEmpty()) {
            val profilePrefs = appContext.getSharedPreferences(profileDestinationPreferencesName, Context.MODE_PRIVATE)
            val profile = SofiaSecurePreferences(profilePrefs, "owner-profile")
            if (address.isNotEmpty() && profile.getString("preferred_address", null).isNullOrBlank()) {
                profile.putString("preferred_address", address)
            }
            if (ownerLabel.isNotEmpty() && profile.getString("owner_name", null).isNullOrBlank()) {
                profile.putString("owner_name", ownerLabel)
            }
        }
        if (language.isNotEmpty()) {
            add(
                type = MemoryType.PROCEDURAL,
                content = "Язык общения владельца: $language.",
                source = "legacy_sofia_memory",
                importance = 4,
                tags = listOf("язык", "настройка", "миграция"),
                id = stableLegacyId("language", language)
            )
        }
        if (ownerLabel.isNotEmpty()) {
            add(
                type = MemoryType.LONG_TERM,
                content = "Обозначение владельца в старом профиле: $ownerLabel.",
                source = "legacy_sofia_memory",
                importance = 4,
                tags = listOf("владелец", "профиль", "миграция"),
                sensitive = true,
                id = stableLegacyId("owner-label", ownerLabel)
            )
        }
    }


    /**
     * A versioned starter profile compiled from facts the owner has already shared.
     * Stable ID makes initialization repeatable; updating this seed never clears other memories.
     */
    private fun seedOwnerKnowledge() {
        add(
            type = MemoryType.LONG_TERM,
            content = OWNER_KNOWLEDGE_PROFILE,
            source = "owner_shared_context_seed_v1",
            confidence = 0.95,
            importance = 5,
            tags = listOf(
                "обо мне", "владелец", "профиль", "биография", "предпочтения",
                "работа", "семья", "казахстан", "корея", "софия", "проект",
                "sofia ai", "память", "архитектура", "задачи"
            ),
            sensitive = false,
            id = "owner-knowledge-profile-v1"
        )
    }

    private fun stableLegacyId(kind: String, value: String): String =
        "legacy-$kind-" + UUID.nameUUIDFromBytes("$kind:$value".toByteArray(Charsets.UTF_8)).toString()

    private fun score(record: MemoryRecord, terms: Set<String>): Int {
        val content = tokenize(record.content)
        val tags = record.tags.map(::normalizeToken).toSet()
        var score = 0
        for (term in terms) {
            if (term in tags) score += 4
            if (term in content) score += 2
        }
        if (score > 0 && (record.type == MemoryType.LONG_TERM || record.type == MemoryType.PROCEDURAL)) score++
        return score
    }

    private fun tokenize(value: String): Set<String> =
        Regex("[\\p{L}\\p{N}]{2,}").findAll(value.lowercase(Locale.ROOT))
            .map { normalizeToken(it.value) }.toSet()

    /**
     * A small deterministic normalizer for common Russian inflectional endings.
     * This is not a full morphological analyzer; it lets ordinary case forms such
     * as "архитектуре", "архитектура" and "архитектуру" share a retrieval stem.
     */
    private fun normalizeToken(token: String): String {
        val suffixes = listOf(
            "иями", "ями", "ами", "ией", "иям", "иях",
            "ого", "ему", "ому", "ыми", "ими",
            "ее", "ие", "ые", "ое", "ей", "ий", "ый", "ой",
            "ая", "яя", "ую", "юю",
            "ам", "ям", "ах", "ях", "ов", "ев", "ом", "ем",
            "ы", "и", "а", "я", "у", "ю", "е", "о"
        )
        val suffix = suffixes.firstOrNull {
            token.length - it.length >= 4 && token.endsWith(it)
        }
        return if (suffix == null) token else token.dropLast(suffix.length)
    }

    /**
     * Fail closed on malformed local data. Returning an empty list here would let a later
     * write silently replace the original encrypted value and destroy recoverable records.
     */
    private fun readRecords(): List<MemoryRecord> {
        val raw = secure.getString(KEY_RECORDS, null) ?: return emptyList()
        val array = try {
            JSONArray(raw)
        } catch (e: Exception) {
            throw IllegalStateException("Локальная память повреждена. Исходные данные сохранены.", e)
        }
        val parsed = ArrayList<MemoryRecord>(array.length())
        for (i in 0 until array.length()) {
            val item = array.optJSONObject(i)
                ?: throw IllegalStateException("Запись памяти повреждена. Исходные данные сохранены.")
            val record = try { item.toRecord() } catch (e: Exception) {
                throw IllegalStateException("Запись памяти повреждена. Исходные данные сохранены.", e)
            } ?: throw IllegalStateException("Запись памяти неполная. Исходные данные сохранены.")
            parsed.add(record)
        }
        val cutoff = System.currentTimeMillis() - WORKING_TTL_MS
        return parsed.filter { it.type != MemoryType.WORKING || it.updatedAt >= cutoff }
    }

    private fun writeRecords(records: List<MemoryRecord>) {
        val array = JSONArray()
        records.sortedBy { it.createdAt }.forEach { array.put(it.toJson()) }
        secure.putString(KEY_RECORDS, array.toString())
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
        val id = optString("id").takeIf { it.isNotBlank() && it.length <= 128 } ?: return null
        val type = MemoryType.fromWire(optString("type")) ?: return null
        val content = optString("content").trim()
            .takeIf { it.isNotEmpty() && it.length <= MAX_RECORD_CHARS } ?: return null
        val now = System.currentTimeMillis()
        val createdAt = optLong("createdAt", now)
        val updatedAt = optLong("updatedAt", now)
        // Reject impossible chronology instead of silently normalizing imported metadata.
        if (createdAt < 0L || updatedAt < createdAt) return null

        val tagsArray = optJSONArray("tags") ?: JSONArray()
        val tags = ArrayList<String>(minOf(tagsArray.length(), 30))
        for (i in 0 until minOf(tagsArray.length(), 30)) {
            val tag = tagsArray.optString(i).trim()
            if (tag.isNotEmpty()) tags.add(tag)
        }
        return MemoryRecord(
            id = id,
            type = type,
            content = content,
            source = optString("source", "import").trim().take(200),
            createdAt = createdAt,
            updatedAt = updatedAt,
            confidence = optDouble("confidence", 1.0).coerceIn(0.0, 1.0),
            importance = optInt("importance", 3).coerceIn(1, 5),
            tags = tags,
            sensitive = optBoolean("sensitive", false)
        )
    }

    companion object {
        private val STORAGE_LOCK = Any()
        private const val PREFS_NAME = "sofia_memory_engine"
        private const val KEY_RECORDS = "records_v1"
        private const val FORMAT_NAME = "sofia-memory"
        private const val SCHEMA_VERSION = 1
        private const val MAX_RECORD_CHARS = 12000
        private const val MAX_IMPORT_BYTES = 5 * 1024 * 1024
        private const val MAX_IMPORT_RECORDS = 10000
        private const val WORKING_TTL_MS = 24L * 60L * 60L * 1000L
        private const val LEGACY_OWNER_ID = "legacy-profile-owner-name-v1"
        private const val LEGACY_ADDRESS_ID = "legacy-profile-preferred-address-v1"
        private const val OWNER_KNOWLEDGE_PROFILE = """
ПРОФИЛЬ ВЛАДЕЛЬЦА. Это сведения, которыми владелец ранее делился с ChatGPT. Используй их для естественного продолжения знакомства. Не утверждай, что знаешь то, чего здесь нет; если факт мог устареть, уточни.

Язык и общение:
- Владелец предпочитает русский язык. При запросе перевода между русским и корейским нужно переводить именно между этими языками. Для перевода с русского на корейский давать корейский текст и русскую транслитерацию; с корейского на русский транслитерация не нужна.
- В голосовом общении София говорит о себе в женском роде, спокойным, мягким, естественным голосом. Важно звучать живо, не канцелярски и не шаблонно.
- Для голосового режима ранее задано обращение «мой хороший»; в текстовом общении следует учитывать последнее подтверждённое владельцем обращение и не навязывать имя.
- Владелец ценит прямые ссылки, короткие и понятные инструкции, минимум лишних шагов и отсутствие повторного хождения по кругу. Не менять работающие настройки, ключи и конфигурации без необходимости.
- Если готовится текст для копирования, лучше давать его отдельным чистым блоком.

Место и жизненный контекст:
- Владелец живёт и работает в Южной Корее; в недавних разговорах указывал город Чхонжу. Казахстан также важен для его семьи, планов и поездок; часто упоминается Караганда.
- У владельца есть дети и внуки; часть семьи живёт в Казахстане. Он заботится об образовании детей и хочет помогать им с жильём.
- У владельца большой практический опыт внутренней отделки и строительных работ, около 15 лет. Также он рассказывал о работе в сфере промышленной безопасности на строительных объектах и о работе водителем автобуса.

Проект Sofia AI:
- Владелец разрабатывает личного ИИ-помощника Sofia AI. София должна быть центральным управляющим ядром, а исполнительные модели и инструменты подключаться как отдельные модули. Первым исполнителем планировался Google Gemini; при разработке рассматривался OpenRouter и бесплатные модели.
- Основной приоритет разработки и тестирования интерфейса и автоматизации: Android-first, с дальнейшей кроссплатформенной поддержкой Windows, Linux и macOS.
- Архитектура должна расширяться без переписывания ядра: реестр возможностей и инструментов, подключаемые адаптеры, версионируемые API и контракты, квоты и бюджеты, совместимость версий, песочницы и тестирование модулей.
- Для каждого исполнителя нужен реестр с возможностями, форматами, стоимостью, скоростью, уровнем доверия и историей ошибок. Нужен независимый Critic/Verifier для проверки фактов, вычислений и кода.
- Память должна включать рабочую, долговременную, эпизодическую и процедурную части. Нужны шифрование, аудит, права доступа, защита секретов, фильтрация prompt injection и возможность остановить действия.
- Важные действия финансового, медицинского, юридического и личного характера должны требовать подтверждения владельца.
- Жизненный цикл задачи: приём, уточнение, план, оценка рисков и стоимости, назначение исполнителя, выполнение, независимая проверка, сборка результата, ответ, запись в память и обучение.
- Владелец предпочитает сначала добиться минимальной стабильной версии, а затем постепенно добавлять расширенные функции. Надёжность важнее количества функций.
- В проекте уже был важный рубеж: 18 ноября 2026 года приложение впервые приняло сообщение пользователя и вернуло полноценный текстовый ответ, то есть заработал первый сквозной прототип.
- Пользователь хочет голосовую активацию по слову «София», распознавание голоса владельца в многолюдной обстановке и безопасную повторную проверку владельца при необходимости.
- Устройство-ориентированная архитектура должна предусматривать не только смартфоны, но и часы, браслеты, наушники, очки, камеры, автомобильные системы, умный дом, компьютеры и будущие совместимые устройства.

Технические проекты и договорённости:
- Владелец проектирует гараж в Караганде: основание 7 на 6 метров, высота гаража 3 метра; на бетонной плите по центру располагается помещение шириной 2 метра, длиной 6 метров и высотой 2 метра. Крыша двускатная; ранее согласовывались стропила 100 на 50 мм, OSB 1250 на 2250 мм и утепление минеральной ватой общей толщиной 200 мм. Геометрию и размеры нельзя менять без согласования.
- Для отопления этого проекта обсуждались электрические тёплые полы, отдельные температурные режимы этажей и расчёт зимнего энергопотребления для условий Караганды. К этим расчётам владелец планировал вернуться при поездке в Казахстан.
- Владелец ранее просил отслеживать варианты автомобилей Renault Sandero от 2020 года, с автоматической коробкой, до 4,3 млн тенге в Караганде и Астане; также упоминались Chevrolet Trax и Chevrolet Colorado.
- Для поиска квартир обсуждались Караганда и Астана, небольшие квартиры с заданными ограничениями по цене и районам. Старые критерии нужно перепроверять перед использованием, поскольку они могли измениться.
- Владелец планирует юбилейное путешествие из Южной Кореи в Караганду, затем в Москву, Краснодар, Адыгею и Абхазию; для этого создан отдельный туристический бюджет и еженедельное напоминание откладывать часть зарплаты.
- Владелец хочет, чтобы София была партнёром по разработке и предлагала полезные следующие шаги, но не выполняла рискованные изменения без согласования.

Рабочие правила для Софии:
- Не выдавай предположения за подтверждённые факты. Если сведения противоречат друг другу или устарели, обозначь это и уточни у владельца.
- Не теряй уже согласованные параметры проектов и не меняй их самовольно.
- При работе с кодом сначала сохраняй рабочее состояние, делай узкие изменения, проверяй сборку и тесты. Не затрагивай production, главную ветку, секреты и установленные приложения без явного разрешения.
- Владелец предпочитает практический результат и последовательное продвижение, а не длинные объяснения о том, что можно было бы сделать.
""".trimIndent()
    }
}
