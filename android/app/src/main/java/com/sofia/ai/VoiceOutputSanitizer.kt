package com.sofia.ai

/**
 * Final deterministic guard for text sent to Android TextToSpeech.
 * Visual symbols are presentation, never spoken content.
 */
internal object VoiceOutputSanitizer {
    private val emojiShortcode = Regex("(?i):[a-z0-9_+-]{2,}:")
    private val textEmoticon = Regex("(?<![\\p{L}\\p{N}])(?:[:;=8xX][-^']?[)(/\\\\DPp]|<3)(?![\\p{L}\\p{N}])")
    private val masculineSelfReference = Regex(
        "(?<![\\p{L}])([Яя])\\s+((?:(?:уже|только что|сейчас|это|всё|все|действительно|наконец)\\s+){0,2})((?:не\\s+)?)(понял|сказал|сделал|проверил|нашёл|нашел|увидел|услышал|забыл|запомнил|подумал|решил|ответил|объяснил|отправил|прочитал|написал|узнал|заметил|приготовил|закончил|начал|выбрал|сохранил|исправил|создал|установил|подключил|включил|выключил|согласился|отказался|ошибся|был|мог|смог|хотел|готов|уверен|рад|согласен|должен|прав|занят|свободен|знаком)",
        RegexOption.IGNORE_CASE
    )

    private val feminineForms = mapOf(
        "понял" to "поняла", "сказал" to "сказала", "сделал" to "сделала",
        "проверил" to "проверила", "нашёл" to "нашла", "нашел" to "нашла",
        "увидел" to "увидела", "услышал" to "услышала", "забыл" to "забыла",
        "запомнил" to "запомнила", "подумал" to "подумала", "решил" to "решила",
        "ответил" to "ответила", "объяснил" to "объяснила", "отправил" to "отправила",
        "прочитал" to "прочитала", "написал" to "написала", "узнал" to "узнала",
        "заметил" to "заметила", "приготовил" to "приготовила", "закончил" to "закончила",
        "начал" to "начала", "выбрал" to "выбрала", "сохранил" to "сохранила",
        "исправил" to "исправила", "создал" to "создала", "установил" to "установила",
        "подключил" to "подключила", "включил" to "включила", "выключил" to "выключила",
        "согласился" to "согласилась", "отказался" to "отказалась", "ошибся" to "ошиблась",
        "был" to "была", "мог" to "могла", "смог" to "смогла", "хотел" to "хотела",
        "готов" to "готова", "уверен" to "уверена", "рад" to "рада",
        "согласен" to "согласна", "должен" to "должна", "прав" to "права",
        "занят" to "занята", "свободен" to "свободна", "знаком" to "знакома"
    )

    fun sanitize(input: String): String {
        val feminine = enforceFeminineSelfReference(input)
        val withoutEmoji = buildString(feminine.length) {
            var offset = 0
            while (offset < feminine.length) {
                val codePoint = feminine.codePointAt(offset)
                if (!isEmojiCodePoint(codePoint)) appendCodePoint(codePoint)
                offset += Character.charCount(codePoint)
            }
        }

        return withoutEmoji
            .replace(emojiShortcode, " ")
            .replace(textEmoticon, " ")
            .replace(Regex("(?s)\\x60\\x60\\x60[^\\n]*\\n?(.*?)\\x60\\x60\\x60"), "$1")
            .replace(Regex("\\[([^\\]]+)\\]\\((?:https?://)?[^)]+\\)"), "$1")
            .replace(Regex("(?m)^\\s{0,3}#{1,6}\\s*"), "")
            .replace(Regex("(?m)^\\s*[-+*]\\s+"), "")
            .replace(Regex("(?m)^\\s*\\d+[.)]\\s+"), "")
            .replace(Regex("[*_~]{1,3}"), "")
            .replace(Regex("`{1,3}"), "")
            .replace(Regex("(?m)^\\s*>\\s?"), "")
            .replace(Regex("[ \\t]{2,}"), " ")
            .replace(Regex(" *\\n *"), "\n")
            .replace(Regex("\\n{3,}"), "\n\n")
            .trim()
    }

    fun enforceFeminineSelfReference(input: String): String =
        masculineSelfReference.replace(input) { match ->
            val originalPronoun = match.groupValues[1]
            val adverbs = match.groupValues[2]
            val negation = match.groupValues[3]
            val masculine = match.groupValues[4].lowercase()
            val feminine = feminineForms[masculine] ?: masculine
            val pronoun = if (originalPronoun == "Я") "Я" else "я"
            "$pronoun $adverbs$negation$feminine"
        }

    private fun isEmojiCodePoint(codePoint: Int): Boolean =
        codePoint in 0x1F000..0x1FAFF ||
            codePoint in 0x2600..0x27BF ||
            codePoint in 0x2300..0x23FF ||
            codePoint in 0x2B00..0x2BFF ||
            codePoint in 0xFE00..0xFE0F ||
            codePoint == 0x200D ||
            codePoint == 0x20E3 ||
            codePoint == 0x00A9 ||
            codePoint == 0x00AE ||
            codePoint == 0x203C ||
            codePoint == 0x2049 ||
            codePoint == 0x2122 ||
            codePoint == 0x2139 ||
            codePoint == 0x24C2 ||
            codePoint == 0x3030 ||
            codePoint == 0x303D ||
            codePoint == 0x3297 ||
            codePoint == 0x3299
}
