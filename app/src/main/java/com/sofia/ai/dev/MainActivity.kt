package com.sofia.ai.dev

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.view.Gravity
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import java.util.concurrent.Executors

class MainActivity : Activity() {
    private val maxItems = 100
    private val apiUrl = "https://sofia.kim-alexey1201.workers.dev/api/chat"
    private val executor = Executors.newSingleThreadExecutor()
    private val conversation = mutableListOf<Pair<String, String>>()
    private val selectedImages = mutableListOf<Pair<Uri, String>>()
    private var lastIntakeKey: String? = null
    private lateinit var root: LinearLayout
    private lateinit var messages: LinearLayout
    private lateinit var input: EditText
    private lateinit var sendButton: Button
    private lateinit var status: TextView
    private var speechRecognizer: SpeechRecognizer? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        renderChat()
        handleShareIntent(intent)
        if (conversation.isEmpty()) addBubble("assistant", "Привет! Я София. Можешь написать мне или воспользоваться голосовым вводом.")
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleShareIntent(intent)
    }

    override fun onDestroy() {
        speechRecognizer?.destroy()
        executor.shutdown()
        super.onDestroy()
    }

    private fun renderChat() {
        root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(18, 24, 18, 12)
        }
        root.addView(TextView(this).apply {
            text = "София"
            textSize = 26f
        })
        status = TextView(this).apply {
            text = "На связи"
            textSize = 12f
            setPadding(0, 4, 0, 12)
        }
        root.addView(status)
        val scroll = ScrollView(this)
        messages = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }
        scroll.addView(messages)
        root.addView(scroll, LinearLayout.LayoutParams(-1, 0, 1f))

        val controls = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        input = EditText(this).apply {
            hint = "Написать Софии…"
            minLines = 1
            maxLines = 4
            imeOptions = EditorInfo.IME_ACTION_SEND
            setSingleLine(false)
        }
        controls.addView(input, LinearLayout.LayoutParams(0, -2, 1f))
        val mic = Button(this).apply {
            text = "🎙"
            setOnClickListener { startVoiceInput() }
        }
        controls.addView(mic)
        sendButton = Button(this).apply {
            text = "➤"
            setOnClickListener { sendCurrentMessage() }
        }
        controls.addView(sendButton)
        root.addView(controls)
        setContentView(root)
        input.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_SEND) {
                sendCurrentMessage()
                true
            } else false
        }
    }

    private fun addBubble(role: String, text: String) {
        val bubble = TextView(this).apply {
            this.text = (if (role == "user") "Вы: " else "София: ") + text
            textSize = 16f
            setPadding(14, 10, 14, 10)
            setBackgroundColor(if (role == "user") 0xFFDDF3E3.toInt() else 0xFFF0F0F0.toInt())
        }
        val params = LinearLayout.LayoutParams(-1, -2).apply {
            setMargins(0, 5, 0, 5)
        }
        messages.addView(bubble, params)
    }

    private fun sendCurrentMessage() {
        val text = input.text.toString().trim()
        if (text.isEmpty()) return
        input.setText("")
        if (selectedImages.isNotEmpty()) {
            addBubble("user", "К сообщению выбрано изображений: ${selectedImages.size}.")
        }
        conversation.add("user" to text)
        addBubble("user", text)
        setBusy(true)
        executor.execute {
            val answer = requestSofia()
            runOnUiThread {
                if (answer != null) {
                    conversation.add("assistant" to answer)
                    addBubble("assistant", answer)
                    status.text = "София на связи"
                } else {
                    status.text = "Не удалось получить ответ. Проверь соединение и повтори."
                    val retry = Button(this).apply {
                        text = "Повторить"
                        setOnClickListener {
                            setBusy(true)
                            executor.execute {
                                val retryAnswer = requestSofia()
                                runOnUiThread {
                                    if (retryAnswer != null) {
                                        conversation.add("assistant" to retryAnswer)
                                        addBubble("assistant", retryAnswer)
                                        status.text = "София на связи"
                                    } else status.text = "Сервис пока недоступен."
                                    setBusy(false)
                                }
                            }
                        }
                    }
                    messages.addView(retry)
                }
                setBusy(false)
            }
        }
    }

    private fun requestSofia(): String? {
        var connection: HttpURLConnection? = null
        return try {
            val payload = JSONArray()
            conversation.takeLast(30).forEach { (role, content) ->
                payload.put(JSONObject().put("role", role).put("content", content))
            }
            connection = (URL(apiUrl).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 15000
                readTimeout = 25000
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
            }
            val body = JSONObject().put("messages", payload).toString().toByteArray(Charsets.UTF_8)
            connection.outputStream.use { it.write(body) }
            val code = connection.responseCode
            val stream = if (code in 200..299) connection.inputStream else connection.errorStream
            val responseText = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: return null
            if (code !in 200..299) return null
            val response = JSONObject(responseText)
            response.optJSONArray("choices")?.optJSONObject(0)
                ?.optJSONObject("message")?.optString("content")?.takeIf { it.isNotBlank() }
        } catch (_: Exception) {
            null
        } finally {
            connection?.disconnect()
        }
    }

    private fun setBusy(busy: Boolean) {
        sendButton.isEnabled = !busy
        input.isEnabled = !busy
        status.text = if (busy) "София думает…" else "На связи"
    }

    private fun startVoiceInput() {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            Toast.makeText(this, "Голосовой ввод на этом устройстве недоступен.", Toast.LENGTH_LONG).show()
            return
        }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 41)
            return
        }
        speechRecognizer?.destroy()
        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this).apply {
            setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) { status.text = "Слушаю…" }
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(rmsdB: Float) {}
                override fun onBufferReceived(buffer: ByteArray?) {}
                override fun onEndOfSpeech() { status.text = "Распознаю речь…" }
                override fun onError(error: Int) { status.text = "Голос не распознан. Попробуй ещё раз." }
                override fun onResults(results: Bundle?) {
                    val phrase = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
                    if (!phrase.isNullOrBlank()) {
                        input.setText(phrase)
                        input.setSelection(phrase.length)
                    }
                    status.text = "На связи"
                }
                override fun onPartialResults(partialResults: Bundle?) {}
                override fun onEvent(eventType: Int, params: Bundle?) {}
            })
            val request = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ru-RU")
                putExtra(RecognizerIntent.EXTRA_PROMPT, "Говори, я слушаю")
            }
            startListening(request)
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 41 && grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
            startVoiceInput()
        } else if (requestCode == 41) {
            Toast.makeText(this, "Для голосового ввода нужно разрешение на микрофон.", Toast.LENGTH_LONG).show()
        }
    }

    private fun handleShareIntent(incoming: Intent?) {
        if (incoming == null) return
        val action = incoming.action
        if (action != Intent.ACTION_SEND && action != Intent.ACTION_SEND_MULTIPLE) return
        if (!incoming.type.orEmpty().startsWith("image/")) {
            showMessage("Пока принимаются только изображения.")
            return
        }
        if (incoming.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION == 0) {
            showMessage("Android не передал разрешение на чтение выбранных файлов. Повтори отправку из галереи.")
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
        if (uris.isEmpty() || uris.size > maxItems) {
            showMessage(if (uris.isEmpty()) "Не удалось получить выбранные изображения." else "За один раз можно передать не более $maxItems изображений.")
            return
        }
        val key = action + ":" + uris.joinToString("|") { it.toString() }
        if (key == lastIntakeKey) return
        lastIntakeKey = key
        selectedImages.clear()
        uris.forEach { uri ->
            try {
                val mime = contentResolver.getType(uri).orEmpty()
                if (uri.scheme == "content" && mime.startsWith("image/")) {
                    val name = contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                        if (cursor.moveToFirst()) {
                            val index = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                            if (index >= 0) cursor.getString(index) else null
                        } else null
                    } ?: "Изображение"
                    selectedImages.add(uri to name)
                }
            } catch (_: Exception) { }
        }
        showSelection()
    }

    private fun showSelection() {
        addBubble("assistant", "Получено выбранных фотографий: ${selectedImages.size}. Это только переданная подборка, а не вся галерея.")
        selectedImages.forEach { (uri, name) ->
            val row = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(0, 5, 0, 5)
            }
            row.addView(ImageView(this).apply {
                layoutParams = LinearLayout.LayoutParams(72, 72)
                scaleType = ImageView.ScaleType.CENTER_CROP
                try { setImageURI(uri) } catch (_: Exception) { }
            })
            row.addView(TextView(this).apply {
                text = name
                setPadding(10, 0, 0, 0)
            })
            messages.addView(row)
        }
        addBubble("assistant", "Теперь можешь написать или надиктовать команду. Важно: пока изображения доступны только в этом Android-экране; текстовый AI-сервис ещё не получает сами файлы. Никаких файловых изменений я не выполняю.")
        input.setText("Работай с выбранными фотографиями.")
    }

    private fun showMessage(message: String) {
        addBubble("assistant", message)
    }
}
