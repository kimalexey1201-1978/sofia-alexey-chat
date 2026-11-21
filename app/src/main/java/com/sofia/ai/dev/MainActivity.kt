package com.sofia.ai.dev

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.provider.DocumentsContract
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
    private val imageAnalysisUrl = "https://sofia.kim-alexey1201.workers.dev/api/analyze-image"
    private val sessionUrl = "https://sofia.kim-alexey1201.workers.dev/api/session"
    @Volatile private var ownerSessionToken: String? = null
    private val maxImageBytes = 5 * 1024 * 1024
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
    private var wakeReceiverRegistered = false
    private var wakeListeningRequested = false
    private var wakeModeEnabled = false
    private var activityResumed = false
    private var voiceInputPending = false
    private var voiceInputGeneration = 0L
    private lateinit var wakeButton: Button
    private val wakeReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                VoskWakeService.ACTION_WAKE_DETECTED -> {
                    getSystemService(NotificationManager::class.java).cancel(VoskWakeService.WAKE_NOTIFICATION_ID)
                    wakeListeningRequested = false
                    wakeButton.text = "Активация: вкл"
                    status.text = "Услышала обращение. Слушаю команду…"
                    voiceInputPending = true
                    startVoiceInput()
                }
                VoskWakeService.ACTION_STATUS -> {
                    wakeListeningRequested = false
                    wakeModeEnabled = false
                    wakeButton.text = "Активация: выкл"
                    status.text = intent.getStringExtra(VoskWakeService.EXTRA_STATUS) ?: "Ошибка голосовой активации."
                }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        renderChat()
        handleShareIntent(intent)
        handleWakeIntent(intent)
        if (conversation.isEmpty()) addBubble("assistant", "Привет! Я София. Можешь написать мне или воспользоваться голосовым вводом.")
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleShareIntent(intent)
        handleWakeIntent(intent)
    }

    private fun handleWakeIntent(incoming: Intent?) {
        val wakeError = incoming?.getStringExtra(VoskWakeService.EXTRA_STATUS)
        if (!wakeError.isNullOrBlank()) {
            incoming.removeExtra(VoskWakeService.EXTRA_STATUS)
            getSystemService(NotificationManager::class.java).cancel(VoskWakeService.ERROR_NOTIFICATION_ID)
            wakeListeningRequested = false
            wakeModeEnabled = false
            if (::wakeButton.isInitialized) wakeButton.text = "Активация: выкл"
            if (::status.isInitialized) status.text = wakeError
        }
        if (incoming?.getBooleanExtra(VoskWakeService.EXTRA_START_VOICE, false) == true) {
            incoming.removeExtra(VoskWakeService.EXTRA_START_VOICE)
            getSystemService(NotificationManager::class.java).cancel(VoskWakeService.WAKE_NOTIFICATION_ID)
            wakeListeningRequested = false
            if (::wakeButton.isInitialized) wakeButton.text = if (wakeModeEnabled) "Активация: вкл" else "Активация: выкл"
            if (::status.isInitialized) {
                status.text = "Услышала обращение. Слушаю команду…"
                voiceInputPending = true
                status.post { startVoiceInput() }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        activityResumed = true
        if (!wakeReceiverRegistered) {
            val filter = IntentFilter().apply {
                addAction(VoskWakeService.ACTION_WAKE_DETECTED)
                addAction(VoskWakeService.ACTION_STATUS)
            }
            if (android.os.Build.VERSION.SDK_INT >= 33) {
                registerReceiver(wakeReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                @Suppress("DEPRECATION")
                registerReceiver(wakeReceiver, filter)
            }
            wakeReceiverRegistered = true
        }
        if (wakeModeEnabled && !wakeListeningRequested && speechRecognizer == null && !voiceInputPending) {
            startWakeService()
        }
    }

    override fun onPause() {
        activityResumed = false
        if (wakeReceiverRegistered) {
            unregisterReceiver(wakeReceiver)
            wakeReceiverRegistered = false
        }
        super.onPause()
    }

    override fun onDestroy() {
        voiceInputGeneration++
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
        val galleryButton = Button(this).apply {
            text = "Открыть галерею"
            setOnClickListener { openGalleryPicker() }
        }
        root.addView(galleryButton)
        wakeButton = Button(this).apply {
            text = "Активация: выкл"
            setOnClickListener { toggleWakeListening() }
        }
        root.addView(wakeButton)
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
        val authorize = Button(this).apply {
            text = "Доступ"
            setOnClickListener { showPairingDialog() }
        }
        controls.addView(authorize)
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
            val imageContext = if (selectedImages.isNotEmpty()) analyzeSharedImages(text) else ""
            val answer = if (selectedImages.isNotEmpty() && imageContext == null) null else {
                if (!imageContext.isNullOrBlank()) conversation.add("user" to "Результаты анализа переданных изображений:\n$imageContext")
                requestSofia()
            }
            runOnUiThread {
                if (answer != null) {
                    conversation.add("assistant" to answer)
                    addBubble("assistant", answer)
                    if (selectedImages.isNotEmpty()) selectedImages.clear()
                    status.text = "София на связи"
                } else {
                    status.text = "Не удалось получить ответ. Проверь соединение и повтори."
                    val retry = Button(this).apply {
                        this.text = "Повторить"
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



    private fun showPairingDialog() {
        val field = EditText(this).apply {
            hint = "Код владельца"
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        android.app.AlertDialog.Builder(this)
            .setTitle("Авторизация Sofia")
            .setMessage("Введите личный код подключения. Он не сохраняется на устройстве.")
            .setView(field)
            .setNegativeButton("Отмена", null)
            .setPositiveButton("Подключить") { _, _ ->
                val code = field.text.toString()
                if (code.length < 20) {
                    Toast.makeText(this, "Код слишком короткий.", Toast.LENGTH_LONG).show()
                } else {
                    status.text = "Проверяю доступ…"
                    executor.execute {
                        val token = exchangePairingCode(code)
                        runOnUiThread {
                            ownerSessionToken = token
                            status.text = if (token != null) "Владелец авторизован" else "Авторизация не выполнена"
                            Toast.makeText(this, if (token != null) "Доступ открыт на ограниченное время." else "Код не принят или сервер не настроен.", Toast.LENGTH_LONG).show()
                        }
                    }
                }
            }.show()
    }

    private fun exchangePairingCode(code: String): String? {
        var connection: HttpURLConnection? = null
        return try {
            connection = (URL(sessionUrl).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 15000
                readTimeout = 20000
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
            }
            val body = JSONObject().put("pairingCode", code).toString().toByteArray(Charsets.UTF_8)
            connection.outputStream.use { it.write(body) }
            if (connection.responseCode !in 200..299) return null
            JSONObject(connection.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() })
                .optString("token").takeIf { it.count { ch -> ch == '.' } == 1 }
        } catch (_: Exception) {
            null
        } finally {
            connection?.disconnect()
        }
    }

    private fun analyzeSharedImages(prompt: String): String? {
        val results = mutableListOf<String>()
        for ((index, item) in selectedImages.withIndex()) {
            val (uri, name) = item
            var connection: HttpURLConnection? = null
            try {
                val bytes = contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return null
                if (bytes.isEmpty() || bytes.size > maxImageBytes) return null
                val mime = contentResolver.getType(uri)?.lowercase(Locale.ROOT) ?: return null
                if (mime !in setOf("image/jpeg", "image/png", "image/webp", "image/gif")) return null
                val boundary = "SofiaBoundary" + System.currentTimeMillis().toString()
                connection = (URL(imageAnalysisUrl).openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    connectTimeout = 20000
                    readTimeout = 60000
                    doOutput = true
                    setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
                    setRequestProperty("Authorization", "Bearer ${ownerSessionToken ?: return null}")
                }
                connection.outputStream.use { output ->
                    fun writeText(value: String) { output.write(value.toByteArray(Charsets.UTF_8)) }
                    writeText("--$boundary\r\nContent-Disposition: form-data; name=\"prompt\"\r\n\r\n")
                    writeText("Пользователь просит: $prompt. Проанализируй изображение с учётом этой просьбы. Имя файла: $name")
                    writeText("\r\n--$boundary\r\nContent-Disposition: form-data; name=\"image\"; filename=\"image-$index\"\r\nContent-Type: $mime\r\n\r\n")
                    output.write(bytes)
                    writeText("\r\n--$boundary--\r\n")
                }
                val code = connection.responseCode
                val stream = if (code in 200..299) connection.inputStream else connection.errorStream
                val responseText = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: return null
                if (code !in 200..299) return null
                val analysis = JSONObject(responseText).optJSONObject("analysis")?.optString("text")
                if (analysis.isNullOrBlank()) return null
                results.add("Файл $name: $analysis")
            } catch (_: Exception) {
                return null
            } finally {
                connection?.disconnect()
            }
        }
        return results.joinToString("\n")
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

    private fun toggleWakeListening() {
        if (wakeModeEnabled) {
            wakeModeEnabled = false
            stopWakeService()
            wakeButton.text = "Активация: выкл"
            status.text = "Ожидание обращения остановлено."
            return
        }
        if (android.os.Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 46)
            return
        }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 45)
            return
        }
        wakeModeEnabled = true
        startWakeService()
    }

    private fun startWakeService() {
        if (!wakeModeEnabled || wakeListeningRequested) return
        val serviceIntent = Intent(this, VoskWakeService::class.java).apply {
            action = VoskWakeService.ACTION_START
        }
        try {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent)
            } else {
                startService(serviceIntent)
            }
            wakeListeningRequested = true
            wakeButton.text = "Активация: вкл"
            status.text = "Запускаю локальное ожидание обращения…"
        } catch (error: Exception) {
            wakeListeningRequested = false
            wakeModeEnabled = false
            wakeButton.text = "Активация: выкл"
            status.text = "Не удалось включить активацию: ${error.message ?: "ошибка Android"}"
        }
    }

    private fun stopWakeService() {
        try {
            startService(Intent(this, VoskWakeService::class.java).apply {
                action = VoskWakeService.ACTION_STOP
            })
        } catch (_: Exception) {
        }
        wakeListeningRequested = false
    }

    private fun restartWakeListeningAfterCommand() {
        voiceInputGeneration++
        if (!wakeModeEnabled) {
            speechRecognizer?.destroy()
            speechRecognizer = null
            return
        }
        speechRecognizer?.destroy()
        speechRecognizer = null
        wakeListeningRequested = false
        status.postDelayed({
            if (wakeModeEnabled && activityResumed && !isFinishing && !isDestroyed) {
                startWakeService()
            }
        }, 700)
    }

    private fun startVoiceInput() {
        val generation = ++voiceInputGeneration
        voiceInputPending = false
        // The local wake-word engine and Android SpeechRecognizer must not
        // compete for the microphone. Keep the user's wake-mode preference.
        if (wakeModeEnabled && wakeListeningRequested) {
            stopWakeService()
        }
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            Toast.makeText(this, "Голосовой ввод на этом устройстве недоступен.", Toast.LENGTH_LONG).show()
            restartWakeListeningAfterCommand()
            return
        }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 41)
            return
        }
        speechRecognizer?.destroy()
        speechRecognizer = null
        try {
            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this).apply {
                setRecognitionListener(object : RecognitionListener {
                    override fun onReadyForSpeech(params: Bundle?) {
                        if (generation == voiceInputGeneration) status.text = "Слушаю…"
                    }
                    override fun onBeginningOfSpeech() {}
                    override fun onRmsChanged(rmsdB: Float) {}
                    override fun onBufferReceived(buffer: ByteArray?) {}
                    override fun onEndOfSpeech() {
                        if (generation == voiceInputGeneration) status.text = "Распознаю речь…"
                    }
                    override fun onError(error: Int) {
                        if (generation != voiceInputGeneration) return
                        status.text = "Голос не распознан. Попробуй ещё раз."
                        restartWakeListeningAfterCommand()
                    }
                    override fun onResults(results: Bundle?) {
                        if (generation != voiceInputGeneration) return
                        val phrase = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
                        if (!phrase.isNullOrBlank()) {
                            input.setText(phrase)
                            input.setSelection(phrase.length)
                        }
                        status.text = "На связи"
                        restartWakeListeningAfterCommand()
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
        } catch (error: Exception) {
            speechRecognizer?.destroy()
            speechRecognizer = null
            if (generation == voiceInputGeneration) {
                status.text = "Не удалось запустить голосовой ввод: ${error.message ?: "ошибка Android"}"
                restartWakeListeningAfterCommand()
            }
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if ((requestCode == 45 || requestCode == 46) && grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
            toggleWakeListening()
        } else if (requestCode == 46) {
            Toast.makeText(this, "Для активации в свёрнутом приложении разреши уведомления Sofia в настройках Android.", Toast.LENGTH_LONG).show()
        } else if (requestCode == 45) {
            Toast.makeText(this, "Для голосовой активации нужно разрешение на микрофон.", Toast.LENGTH_LONG).show()
        } else if (requestCode == 41 && grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
            startVoiceInput()
        } else if (requestCode == 41) {
            Toast.makeText(this, "Для голосового ввода нужно разрешение на микрофон.", Toast.LENGTH_LONG).show()
            restartWakeListeningAfterCommand()
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
        addSelectedImages(uris)
    }

    private fun openGalleryPicker() {
        val picker = if (android.os.Build.VERSION.SDK_INT >= 33) {
            Intent(android.provider.MediaStore.ACTION_PICK_IMAGES).apply {
                type = "image/*"
                putExtra(android.provider.MediaStore.EXTRA_PICK_IMAGES_MAX, maxItems)
            }
        } else {
            Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = "image/*"
                putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
            }
        }
        try {
            startActivityForResult(picker, 42)
        } catch (_: Exception) {
            showMessage("Не удалось открыть системную галерею на этом устройстве.")
        }
    }

    @Deprecated("Use the Activity Result API when the UI is migrated")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (resultCode != RESULT_OK || data == null) return
        if (requestCode == 43 || requestCode == 44) {
            val treeUri = data.data ?: return
            val flags = data.flags and (Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
            if (flags and Intent.FLAG_GRANT_WRITE_URI_PERMISSION == 0) {
                showMessage("Android не предоставил право записи в эту папку. Выбери другую.")
                return
            }
            try {
                contentResolver.takePersistableUriPermission(treeUri, flags)
            } catch (_: SecurityException) {
                showMessage("Android не разрешил сохранить доступ к выбранной папке.")
                return
            }
            val treeId = try { DocumentsContract.getTreeDocumentId(treeUri) } catch (_: Exception) {
                showMessage("Не удалось определить выбранную папку.")
                return
            }
            val parentUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, treeId)
            if (requestCode == 43) copySelectedImagesToFolder(parentUri)
            else showCreateFolderDialog(parentUri)
            return
        }
        if (requestCode != 42) return
        val uris = linkedSetOf<Uri>()
        data.data?.let(uris::add)
        data.clipData?.let { clip ->
            for (index in 0 until clip.itemCount) clip.getItemAt(index).uri?.let(uris::add)
        }
        if (uris.isEmpty() || uris.size > maxItems) {
            showMessage(if (uris.isEmpty()) "Не выбраны фотографии." else "За один раз можно выбрать не более $maxItems фотографий.")
            return
        }
        if (android.os.Build.VERSION.SDK_INT < 33) {
            try {
                data.data?.let { contentResolver.takePersistableUriPermission(it, Intent.FLAG_GRANT_READ_URI_PERMISSION) }
                data.clipData?.let { clip ->
                    for (index in 0 until clip.itemCount) {
                        contentResolver.takePersistableUriPermission(clip.getItemAt(index).uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }
                }
            } catch (_: SecurityException) { }
        }
        addSelectedImages(uris)
    }

    private fun addSelectedImages(uris: Set<Uri>) {
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
        val saveButton = Button(this).apply {
            text = "Скопировать в существующую папку"
            isEnabled = selectedImages.isNotEmpty()
            setOnClickListener { chooseDestinationFolder(43) }
        }
        messages.addView(saveButton)
        val newFolderButton = Button(this).apply {
            text = "Создать папку и сохранить"
            isEnabled = selectedImages.isNotEmpty()
            setOnClickListener { chooseDestinationFolder(44) }
        }
        messages.addView(newFolderButton)
        addBubble("assistant", "Исходные фотографии останутся на месте. При сохранении София создаст копии в выбранной папке.")
        input.setText("Работай с выбранными фотографиями.")
    }


    private fun chooseDestinationFolder(requestCode: Int) {
        if (selectedImages.isEmpty()) {
            showMessage("Сначала выбери фотографии.")
            return
        }
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        }
        try {
            startActivityForResult(intent, requestCode)
        } catch (_: Exception) {
            showMessage("Не удалось открыть выбор папки.")
        }
    }

    private fun showCreateFolderDialog(parentUri: Uri) {
        val nameField = EditText(this).apply {
            hint = "Название новой папки"
            setSingleLine(true)
        }
        android.app.AlertDialog.Builder(this)
            .setTitle("Новая папка")
            .setMessage("Укажи имя папки для выбранных фотографий.")
            .setView(nameField)
            .setNegativeButton("Отмена", null)
            .setPositiveButton("Создать и сохранить") { _, _ ->
                val folderName = nameField.text.toString().trim()
                if (folderName.isBlank() || folderName == "." || folderName == ".." ||
                    folderName.any { it == '/' || it == '\\' || it.isISOControl() }) {
                    showMessage("Укажи корректное название папки без символов / и \\.")
                    return@setPositiveButton
                }
                status.text = "Создаю папку…"
                executor.execute {
                    try {
                        val folderUri = DocumentsContract.createDocument(
                            contentResolver, parentUri,
                            DocumentsContract.Document.MIME_TYPE_DIR, folderName
                        ) ?: throw IllegalStateException("Провайдер не создал папку.")
                        runOnUiThread {
                            addBubble("assistant", "Папка «" + folderName + "» создана. Сохраняю фотографии.")
                            copySelectedImagesToFolder(folderUri)
                        }
                    } catch (error: Exception) {
                        runOnUiThread {
                            status.text = "На связи"
                            showMessage("Не удалось создать папку: " + (error.message ?: "ошибка доступа") + ".")
                        }
                    }
                }
            }.show()
    }

    private fun documentExists(directoryUri: Uri, displayName: String): Boolean {
        val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(
            directoryUri, DocumentsContract.getDocumentId(directoryUri)
        )
        return try {
            contentResolver.query(
                childrenUri,
                arrayOf(DocumentsContract.Document.COLUMN_DISPLAY_NAME),
                null, null, null
            )?.use { cursor ->
                val nameColumn = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
                if (nameColumn < 0) false else {
                    var found = false
                    while (cursor.moveToNext()) {
                        if (cursor.getString(nameColumn) == displayName) {
                            found = true
                            break
                        }
                    }
                    found
                }
            } ?: false
        } catch (_: Exception) {
            false
        }
    }

    private fun copySelectedImagesToFolder(directoryUri: Uri) {
        val snapshot = selectedImages.toList()
        status.text = "Копирую фотографии…"
        executor.execute {
            var copied = 0
            val failures = mutableListOf<String>()
            try {
                for ((sourceUri, displayName) in snapshot) {
                    try {
                        val mime = contentResolver.getType(sourceUri)?.takeIf { it.startsWith("image/") }
                            ?: throw IllegalArgumentException("Неизвестный тип файла")
                        val rawName = displayName.substringAfterLast('/').replace(':', '_').replace('?', '_')
                            .replace('*', '_').replace('"', '_').replace('<', '_').replace('>', '_').replace('|', '_')
                            .ifBlank { "photo" }
                        val dot = rawName.lastIndexOf('.').takeIf { it > 0 } ?: rawName.length
                        val base = rawName.substring(0, dot)
                        val extension = rawName.substring(dot)
                        val targetName = generateSequence(0) { it + 1 }.map { suffix ->
                            if (suffix == 0) rawName else "$base ($suffix)$extension"
                        }.first { candidate -> !documentExists(directoryUri, candidate) }
                        val targetUri = DocumentsContract.createDocument(contentResolver, directoryUri, mime, targetName)
                            ?: throw IllegalStateException("Не удалось создать файл назначения")
                        try {
                            contentResolver.openInputStream(sourceUri)?.use { input ->
                                contentResolver.openOutputStream(targetUri, "w")?.use { output ->
                                    input.copyTo(output)
                                } ?: throw IllegalStateException("Не удалось записать копию")
                            } ?: throw IllegalStateException("Не удалось прочитать оригинал")
                            copied++
                        } catch (error: Exception) {
                            try { DocumentsContract.deleteDocument(contentResolver, targetUri) } catch (_: Exception) { }
                            throw error
                        }
                    } catch (error: Exception) {
                        failures.add("${displayName}: ${error.message ?: "ошибка копирования"}")
                    }
                }
            } catch (error: Exception) {
                failures.add(error.message ?: "Ошибка доступа к папке")
            }
            runOnUiThread {
                status.text = "Готово"
                val summary = "Скопировано: ${copied} из ${snapshot.size}. Оригиналы не удалялись." +
                    if (failures.isEmpty()) "" else "\nНе удалось скопировать:\n" + failures.take(5).joinToString("\n")
                addBubble("assistant", summary)
            }
        }
    }

    private fun showMessage(message: String) {
        addBubble("assistant", message)
    }
}
