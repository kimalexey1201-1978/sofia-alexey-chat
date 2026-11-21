package com.sofia.ai.dev

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

class MainActivity : Activity() {
    private val maxItems = 100
    private var lastIntakeKey: String? = null
    private lateinit var content: LinearLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        renderHome()
        handleShareIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleShareIntent(intent)
    }

    private fun renderHome() {
        content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(24, 32, 24, 24)
        }
        content.addView(TextView(this).apply { text = "София"; textSize = 28f })
        content.addView(TextView(this).apply {
            text = "Выберите фотографии в галерее Android и отправьте их через «Поделиться → Sofia»."
            textSize = 16f
            setPadding(0, 16, 0, 16)
        })
        setContentView(content)
    }

    private fun handleShareIntent(incoming: Intent?) {
        if (incoming == null) return
        val action = incoming.action
        if (action != Intent.ACTION_SEND && action != Intent.ACTION_SEND_MULTIPLE) return
        val declaredMime = incoming.type.orEmpty()
        if (!declaredMime.startsWith("image/")) {
            showMessage("Получен неподдерживаемый тип данных. Пока принимаются только изображения.")
            return
        }
        if (incoming.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION == 0) {
            showMessage("Android не передал разрешение на чтение выбранных файлов. Повторите отправку из галереи.")
            return
        }

        val uris = linkedSetOf<Uri>()
        val stream = if (android.os.Build.VERSION.SDK_INT >= 33) {
            incoming.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
        } else {
            @Suppress("DEPRECATION")
            incoming.getParcelableExtra(Intent.EXTRA_STREAM) as? Uri
        }
        if (stream != null) uris.add(stream)
        incoming.clipData?.let { clip ->
            for (index in 0 until clip.itemCount) clip.getItemAt(index).uri?.let(uris::add)
        }
        if (action == Intent.ACTION_SEND_MULTIPLE) {
            val streams = if (android.os.Build.VERSION.SDK_INT >= 33) {
                incoming.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
            } else {
                @Suppress("DEPRECATION")
                incoming.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)
            }
            streams?.forEach(uris::add)
        }
        if (uris.isEmpty()) {
            showMessage("Галерея не передала адреса выбранных фотографий.")
            return
        }
        if (uris.size > maxItems) {
            showMessage("Выбрано слишком много файлов. Максимум за один раз: " + maxItems + ".")
            return
        }
        val key = action + ":" + uris.joinToString("|") { it.toString() }
        if (key == lastIntakeKey) return
        lastIntakeKey = key

        val validated = mutableListOf<Pair<Uri, String>>()
        val rejected = mutableListOf<String>()
        uris.forEach { uri ->
            try {
                if (uri.scheme != "content") {
                    rejected.add("Неподдерживаемый адрес файла")
                } else {
                    val mime = contentResolver.getType(uri).orEmpty()
                    if (!mime.startsWith("image/")) {
                        rejected.add("Пропущен файл неподдерживаемого типа")
                    } else {
                        contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)
                            ?.use { cursor ->
                                if (cursor.moveToFirst()) {
                                    val index = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                                    val name = if (index >= 0) cursor.getString(index) else null
                                    validated.add(uri to (name ?: "Изображение"))
                                } else rejected.add("Не удалось прочитать метаданные файла")
                            } ?: rejected.add("Поставщик файлов не вернул метаданные")
                    }
                }
            } catch (_: SecurityException) {
                rejected.add("Нет разрешения на чтение одного из файлов")
            } catch (_: Exception) {
                rejected.add("Ошибка чтения одного из файлов")
            }
        }
        showSelection(validated, rejected)
    }

    private fun showMessage(message: String) {
        content.removeAllViews()
        content.addView(TextView(this).apply {
            text = "София\n\n" + message
            textSize = 18f
            setPadding(0, 12, 0, 12)
        })
    }

    private fun showSelection(items: List<Pair<Uri, String>>, rejected: List<String>) {
        content.removeAllViews()
        content.addView(TextView(this).apply {
            text = "Получено фотографий: " + items.size
            textSize = 22f
        })
        content.addView(TextView(this).apply {
            text = "Это только выбранные в галерее файлы. Доступ ко всей галерее не предоставлен."
            textSize = 14f
            setPadding(0, 8, 0, 12)
        })
        val scroll = ScrollView(this)
        val list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        items.forEach { (uri, name) ->
            val row = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(0, 8, 0, 8)
            }
            row.addView(ImageView(this).apply {
                layoutParams = LinearLayout.LayoutParams(88, 88)
                scaleType = ImageView.ScaleType.CENTER_CROP
                try { setImageURI(uri) } catch (_: Exception) { }
            })
            row.addView(TextView(this).apply {
                text = name
                textSize = 14f
                setPadding(12, 0, 0, 0)
            })
            list.addView(row)
        }
        scroll.addView(list)
        content.addView(scroll, LinearLayout.LayoutParams(-1, 0, 1f))
        if (rejected.isNotEmpty()) {
            content.addView(TextView(this).apply {
                text = "Не удалось принять: " + rejected.size + " файл(а)."
                setPadding(0, 12, 0, 0)
            })
        }
        content.addView(TextView(this).apply {
            text = "Следующий шаг — подключить эту подборку к Sofia Core. Пока файлы не копируются, не перемещаются и не удаляются."
            textSize = 14f
            setPadding(0, 16, 0, 0)
        })
    }
}
