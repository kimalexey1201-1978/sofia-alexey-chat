package com.sofia.ai

import android.app.*
import android.content.Intent
import android.os.*
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import java.util.concurrent.Executors

class VoiceService : Service(), TextToSpeech.OnInitListener {
 private val main = Handler(Looper.getMainLooper())
 private val io = Executors.newSingleThreadExecutor()
 private var recognizer: SpeechRecognizer? = null
 private var tts: TextToSpeech? = null
 private var ttsReady = false
 private var waiting = false
 private var restarting = false
 private var destroyed = false
 private var speaking = false
 private var requestInFlight = false
 private var pendingSpeech: String? = null
 private var restartTask: Runnable? = null

 override fun onCreate() {
  super.onCreate()
  if (Build.VERSION.SDK_INT >= 26) {
   val ch = NotificationChannel(CHANNEL, "Голосовой режим Софии", NotificationManager.IMPORTANCE_LOW)
   getSystemService(NotificationManager::class.java).createNotificationChannel(ch)
  }
  startForeground(NOTIFICATION, notification("Ожидаю слово «София»"))
  tts = TextToSpeech(this, this)
  startRecognition()
 }

 override fun onStartCommand(intent: Intent?, flags: Int, startId: Int) = START_STICKY
 override fun onBind(intent: Intent?): IBinder? = null

 override fun onInit(status: Int) {
  if (status != TextToSpeech.SUCCESS) {
   status("Не удалось запустить озвучивание")
   return
  }
  ttsReady = true
  tts?.language = Locale("ru", "RU")
  tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
   override fun onStart(id: String) {}
   override fun onDone(id: String) {
    main.post {
     speaking = false
     requestInFlight = false
     if (!destroyed) startRecognition()
    }
   }
   @Deprecated("Deprecated in Java")
   override fun onError(id: String) {
    main.post {
     speaking = false
     requestInFlight = false
     if (!destroyed) startRecognition()
    }
   }
  })
  pendingSpeech?.let {
   pendingSpeech = null
   speakNow(it)
  } ?: if (!requestInFlight && !speaking && !destroyed) startRecognition()
 }

 private fun notification(s: String) = NotificationCompat.Builder(this, CHANNEL)
  .setSmallIcon(android.R.drawable.ic_btn_speak_now)
  .setContentTitle("София активна")
  .setContentText(s)
  .setOngoing(true)
  .build()

 private fun status(s: String) =
  getSystemService(NotificationManager::class.java).notify(NOTIFICATION, notification(s))

 private fun startRecognition() {
  if (destroyed || restarting || speaking || requestInFlight) return
  if (!SpeechRecognizer.isRecognitionAvailable(this)) {
   status("Распознавание речи недоступно")
   return
  }
  try {
   recognizer?.destroy()
   recognizer = if (Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(this))
    SpeechRecognizer.createOnDeviceSpeechRecognizer(this)
   else SpeechRecognizer.createSpeechRecognizer(this)

   recognizer?.setRecognitionListener(object : RecognitionListener {
    override fun onReadyForSpeech(p: Bundle?) {
     status(if (waiting) "София проснулась, жду команду" else "Ожидаю слово «София»")
    }
    override fun onBeginningOfSpeech() {}
    override fun onRmsChanged(v: Float) {}
    override fun onBufferReceived(b: ByteArray?) {}
    override fun onEndOfSpeech() {}
    override fun onError(e: Int) { restart() }
    override fun onResults(b: Bundle?) {
     val phrase = b?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
     val consumed = phrase.isNotBlank() && handle(phrase)
     if (!consumed && !speaking && !requestInFlight && !destroyed) restart()
    }
    override fun onPartialResults(b: Bundle?) {}
    override fun onEvent(t: Int, b: Bundle?) {}
   })

   val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
    putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ru-RU")
    putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
    putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
   }
   recognizer?.startListening(intent)
  } catch (e: Exception) {
   restart()
  }
 }

 private fun restart() {
  if (destroyed || restarting || speaking || requestInFlight) return
  restarting = true
  restartTask = Runnable {
   restarting = false
   restartTask = null
   startRecognition()
  }
  main.postDelayed(restartTask!!, 700)
 }

 private fun stopRecognition() {
  restartTask?.let { main.removeCallbacks(it) }
  restartTask = null
  restarting = false
  recognizer?.cancel()
  recognizer?.destroy()
  recognizer = null
 }

 private fun norm(s: String) = s.lowercase(Locale("ru", "RU"))
  .replace(Regex("[.,!?;:]"), " ")
  .replace(Regex("\\s+"), " ")
  .trim()

 // Returns true when this phrase changed the state and must not restart recognition.
 private fun handle(raw: String): Boolean {
  val text = norm(raw)
  val match = Regex("(^|\\s)софия(?=\\s|$)").find(text)
  if (!waiting) {
   if (match == null) return false
   val rest = text.substring(match.range.last + 1).trim()
   if (rest.isEmpty()) {
    waiting = true
    say("Я слушаю")
    status("София проснулась, жду команду")
   } else sendCommand(rest)
   return true
  }
  if (text != "софия") {
   sendCommand(raw)
   return true
  }
  return false
 }

 private fun sendCommand(command: String) {
  waiting = false
  requestInFlight = true
  stopRecognition()
  status("Выполняю команду")
  io.execute {
   try {
    val messages = JSONArray()
     .put(JSONObject().put("role", "system").put("content", "Ты София, личный помощник. Отвечай по-русски кратко и естественно."))
     .put(JSONObject().put("role", "user").put("content", command))
    val body = JSONObject().put("messages", messages).toString()
    val connection = URL(ENDPOINT).openConnection() as HttpURLConnection
    connection.requestMethod = "POST"
    connection.connectTimeout = 15000
    connection.readTimeout = 45000
    connection.doOutput = true
    connection.setRequestProperty("Content-Type", "application/json")
    connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
    val code = connection.responseCode
    val stream = if (code in 200..299) connection.inputStream else connection.errorStream
    val responseText = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
    connection.disconnect()

    val root = JSONObject(responseText)
    val choice = root.optJSONArray("choices")?.optJSONObject(0)
    val message = choice?.optJSONObject("message")
    val contentValue = message?.opt("content")
    val answer = when (contentValue) {
     is String -> contentValue
     is JSONArray -> (0 until contentValue.length()).mapNotNull { i ->
      contentValue.optJSONObject(i)?.optString("text")?.takeIf { it.isNotBlank() }
     }.joinToString(" ")
     else -> ""
    }.trim()

    val finalAnswer = when {
     code !in 200..299 -> "Сервер вернул ошибку. Попробуй повторить вопрос."
     answer.isNotBlank() -> answer
     root.has("error") -> "Сервис ответа временно недоступен."
     else -> "Я получила пустой ответ. Повтори, пожалуйста, вопрос."
    }
    main.post {
     status(if (code in 200..299) "Готовлю ответ" else "Ошибка ответа сервера")
     say(finalAnswer)
    }
   } catch (e: Exception) {
    main.post {
     status("Ошибка соединения")
     say("Не удалось связаться с сервером. Проверь соединение и повтори вопрос.")
    }
   }
  }
 }

 private fun say(text: String) {
  if (destroyed) return
  if (!ttsReady) {
   pendingSpeech = text
   return
  }
  speakNow(text)
 }

 private fun speakNow(text: String) {
  if (destroyed) return
  speaking = true
  stopRecognition()
  val result = tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "sofia-response")
  if (result == TextToSpeech.ERROR) {
   speaking = false
   requestInFlight = false
   status("Не удалось озвучить ответ")
   startRecognition()
  }
 }

 override fun onDestroy() {
  destroyed = true
  main.removeCallbacksAndMessages(null)
  recognizer?.destroy()
  tts?.stop()
  tts?.shutdown()
  io.shutdownNow()
  super.onDestroy()
 }

 companion object {
  private const val CHANNEL = "sofia_voice"
  private const val NOTIFICATION = 7301
  private const val ENDPOINT = "https://sofia.kim-alexey1201.workers.dev/api/chat"
 }
}
