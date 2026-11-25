package com.sofia.ai

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.speech.tts.TextToSpeech
import android.speech.tts.Voice
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.SeekBar
import android.widget.Spinner
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast

class MainActivity : Activity() {
 private lateinit var status: TextView
 private lateinit var voiceButton: Button
 private var voiceRequested = true
 private var previewTts: TextToSpeech? = null
 private var previewTtsReady = false
 private val voicePrefs by lazy { getSharedPreferences("sofia_voice_settings", MODE_PRIVATE) }
 private val maxMemoryImportBytes = 5 * 1024 * 1024
 private val req = 41
 private val importRequest = 42
 private val exportRequest = 43

 override fun onCreate(savedInstanceState: Bundle?) {
  super.onCreate(savedInstanceState)
  previewTts = TextToSpeech(this) { result ->
   previewTtsReady = result == TextToSpeech.SUCCESS
  }
  status = TextView(this).apply {
   text = "София запускает голосовое ожидание. После разрешения микрофона приложение можно свернуть."
   textSize = 18f
   gravity = Gravity.CENTER
   setPadding(24,24,24,24)
  }
  voiceButton = Button(this).apply {
   text = "Остановить голосовой режим"
   setOnClickListener {
    if (voiceRequested) stopVoice() else requestAudioAndStart()
   }
  }
  val voiceSettings = Button(this).apply {
   text = "Настройки голоса Софии"
   setOnClickListener { openVoiceSettings() }
  }
  val importMemory = Button(this).apply {
   text = "Импортировать память Софии"
   setOnClickListener { openMemoryImport() }
  }
  val exportMemory = Button(this).apply {
   text = "Экспортировать память Софии"
   setOnClickListener { openMemoryExport() }
  }
  setContentView(LinearLayout(this).apply {
   orientation=LinearLayout.VERTICAL
   gravity=Gravity.CENTER
   setPadding(24,24,24,24)
   addView(status)
   addView(voiceButton)
   addView(voiceSettings)
   addView(importMemory)
   addView(exportMemory)
  })
  requestAudioAndStart()
 }

 private fun openVoiceSettings() {
  val engine = previewTts
  if (!previewTtsReady || engine == null) {
   Toast.makeText(this, "Голосовой движок Android ещё загружается. Попробуй через несколько секунд.", Toast.LENGTH_LONG).show()
   return
  }
  val voices = engine.voices.orEmpty().filter { voice ->
   voice.locale.language == "ru" && !voice.features.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)
  }.sortedWith(compareBy<Voice> { it.name })
  if (voices.isEmpty()) {
   AlertDialog.Builder(this)
    .setTitle("Русские голоса не найдены")
    .setMessage("В установленном движке Android пока нет доступных русских голосов. Проверь установку русского голосового пакета в настройках синтеза речи Android.")
    .setPositiveButton("Понятно", null)
    .show()
   return
  }

  val labels = voices.map { voice ->
   val mode = if (voice.features.contains(TextToSpeech.Engine.KEY_FEATURE_NETWORK_SYNTHESIS)) "онлайн" else "офлайн"
   "${voice.name} · ${mode} · качество ${voice.quality}"
  }
  val voicePicker = Spinner(this).apply {
   adapter = ArrayAdapter(this@MainActivity, android.R.layout.simple_spinner_dropdown_item, labels)
  }
  val savedName = voicePrefs.getString("voice_name", null)
  val selectedIndex = voices.indexOfFirst { it.name == savedName }.let { if (it >= 0) it else 0 }
  voicePicker.setSelection(selectedIndex)

  val pitchLabel = TextView(this).apply { textSize = 16f }
  val pitchBar = SeekBar(this).apply { max = 100; progress = ((voicePrefs.getFloat("pitch", 1.0f) - 0.7f) / 0.8f * 100).toInt().coerceIn(0, 100) }
  val rateLabel = TextView(this).apply { textSize = 16f }
  val rateBar = SeekBar(this).apply { max = 100; progress = ((voicePrefs.getFloat("rate", 0.95f) - 0.75f) / 0.65f * 100).toInt().coerceIn(0, 100) }
  fun pitchValue() = 0.7f + pitchBar.progress / 100f * 0.8f
  fun rateValue() = 0.75f + rateBar.progress / 100f * 0.65f
  fun refreshLabels() {
   pitchLabel.text = "Высота голоса: ${"%.2f".format(java.util.Locale.US, pitchValue())}"
   rateLabel.text = "Скорость речи: ${"%.2f".format(java.util.Locale.US, rateValue())}"
  }
  pitchBar.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
   override fun onProgressChanged(seekBar: SeekBar?, progress: Int, fromUser: Boolean) = refreshLabels()
   override fun onStartTrackingTouch(seekBar: SeekBar?) {}
   override fun onStopTrackingTouch(seekBar: SeekBar?) {}
  })
  rateBar.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
   override fun onProgressChanged(seekBar: SeekBar?, progress: Int, fromUser: Boolean) = refreshLabels()
   override fun onStartTrackingTouch(seekBar: SeekBar?) {}
   override fun onStopTrackingTouch(seekBar: SeekBar?) {}
  })
  refreshLabels()
  val content = LinearLayout(this).apply {
   orientation = LinearLayout.VERTICAL
   setPadding(32, 8, 32, 0)
   addView(TextView(this@MainActivity).apply { text = "Русский голос Android"; textSize = 16f })
   addView(voicePicker)
   addView(pitchLabel)
   addView(pitchBar)
   addView(rateLabel)
   addView(rateBar)
   addView(TextView(this@MainActivity).apply {
    text = "Прослушай образец для каждого варианта. Обозначение голоса не гарантирует его тембр."
    textSize = 13f
   })
  }
  var auditionedVoiceName: String? = null
  var auditionedPitch: Float? = null
  var auditionedRate: Float? = null
  val dialog = AlertDialog.Builder(this)
   .setTitle("Голос Софии")
   .setView(content)
   .setNegativeButton("Отмена", null)
   .setNeutralButton("Прослушать", null)
   .setPositiveButton("Сохранить", null)
   .create()
  dialog.setOnShowListener {
   dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
    val selected = voices[voicePicker.selectedItemPosition]
    if (auditionedVoiceName != selected.name ||
     auditionedPitch != pitchValue() ||
     auditionedRate != rateValue()) {
     Toast.makeText(this, "Сначала прослушай именно этот голос с текущими настройками.", Toast.LENGTH_LONG).show()
     return@setOnClickListener
    }
    voicePrefs.edit()
     .putString("voice_name", selected.name)
     .putFloat("pitch", pitchValue())
     .putFloat("rate", rateValue())
     .apply()
    if (VoiceService.isRunning) {
     val update = Intent(this, VoiceService::class.java).setAction(VoiceService.ACTION_UPDATE_TTS_SETTINGS)
     try {
      startService(update)
      Toast.makeText(this, "Настройки сохранены и применяются", Toast.LENGTH_SHORT).show()
     } catch (e: Exception) {
      Toast.makeText(this, "Настройки сохранены. Перезапусти голосовой режим для применения.", Toast.LENGTH_LONG).show()
     }
    } else {
     Toast.makeText(this, "Настройки сохранены. Они применятся при следующем запуске голосового режима.", Toast.LENGTH_LONG).show()
    }
    dialog.dismiss()
   }
   dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener {
    val selected = voices[voicePicker.selectedItemPosition]
    try {
     engine.voice = selected
     engine.setPitch(pitchValue())
     engine.setSpeechRate(rateValue())
     val result = engine.speak("Привет, я София. Я внимательно тебя слушаю. Я уже проверила настройки, подготовила ответ и сейчас спокойно объясню, что получилось. Если захочешь, мы можем сменить тему и продолжить разговор.", TextToSpeech.QUEUE_FLUSH, null, "sofia-voice-preview")
     if (result == TextToSpeech.SUCCESS) {
      auditionedVoiceName = selected.name
      auditionedPitch = pitchValue()
      auditionedRate = rateValue()
     } else {
      auditionedVoiceName = null
      Toast.makeText(this, "Android не смог запустить прослушивание этого голоса.", Toast.LENGTH_LONG).show()
     }
    } catch (e: Exception) {
     auditionedVoiceName = null
     Toast.makeText(this, "Не удалось прослушать выбранный голос: ${e.message ?: "ошибка TTS"}", Toast.LENGTH_LONG).show()
    }
   }
  }
  dialog.setOnDismissListener { engine.stop() }
  dialog.show()
 }

 private fun openMemoryImport() {
  val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
   addCategory(Intent.CATEGORY_OPENABLE)
   type = "application/json"
  }
  startActivityForResult(intent, importRequest)
 }

 private fun openMemoryExport() {
  AlertDialog.Builder(this)
   .setTitle("Экспорт памяти Софии")
   .setMessage(
    "Файл экспорта содержит все записи памяти, включая конфиденциальные и личные данные. " +
     "Он будет сохранён как обычный JSON без дополнительного шифрования. " +
     "Храните файл в безопасном месте и не отправляйте его посторонним."
   )
   .setNegativeButton("Отмена", null)
   .setPositiveButton("Продолжить") { _, _ ->
    val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
     addCategory(Intent.CATEGORY_OPENABLE)
     type = "application/json"
     putExtra(Intent.EXTRA_TITLE, "sofia-memory.json")
    }
    startActivityForResult(intent, exportRequest)
   }
   .show()
 }

 @Deprecated("Deprecated in Java")
 override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
  super.onActivityResult(requestCode, resultCode, data)
  if (resultCode != RESULT_OK) return
  val uri = data?.data ?: return
  try {
   when (requestCode) {
    importRequest -> {
     val bytes = contentResolver.openInputStream(uri)?.use { input ->
      val output = java.io.ByteArrayOutputStream()
      val buffer = ByteArray(8192)
      var total = 0
      while (true) {
       val count = input.read(buffer)
       if (count < 0) break
       total += count
       require(total <= maxMemoryImportBytes) { "Файл памяти больше 5 МБ" }
       output.write(buffer, 0, count)
      }
      output.toByteArray()
     } ?: throw IllegalStateException("Не удалось открыть файл")
     val result = MemoryEngine(this).importJson(String(bytes, Charsets.UTF_8))
     Toast.makeText(
      this,
      "Импортировано: ${result.imported}, пропущено: ${result.skipped}. Всего записей: ${result.total}",
      Toast.LENGTH_LONG
     ).show()
    }
    exportRequest -> {
     val json = MemoryEngine(this).exportJson()
     contentResolver.openOutputStream(uri)?.use { it.write(json.toByteArray(Charsets.UTF_8)) }
      ?: throw IllegalStateException("Не удалось сохранить файл")
     Toast.makeText(this, "Память Софии экспортирована", Toast.LENGTH_LONG).show()
    }
   }
  } catch (e: Exception) {
   Toast.makeText(this, "Ошибка работы с памятью: ${e.message ?: "неизвестная ошибка"}", Toast.LENGTH_LONG).show()
  }
 }

 private fun requestAudioAndStart() {
  val p = mutableListOf(
   Manifest.permission.RECORD_AUDIO,
   Manifest.permission.ACCESS_COARSE_LOCATION,
   Manifest.permission.ACCESS_FINE_LOCATION
  )
  if (Build.VERSION.SDK_INT >= 33) p += Manifest.permission.POST_NOTIFICATIONS
  val missing = p.filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
  if (missing.isEmpty()) startVoice()
  else requestPermissions(missing.toTypedArray(), req)
 }

 override fun onDestroy() {
  previewTts?.stop()
  previewTts?.shutdown()
  previewTts = null
  super.onDestroy()
 }

 override fun onRequestPermissionsResult(requestCode:Int, permissions:Array<out String>, grantResults:IntArray) {
  super.onRequestPermissionsResult(requestCode,permissions,grantResults)
  if (requestCode==req) {
   val audioGranted = checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED
   val locationGranted = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED ||
    checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED
   if (audioGranted) {
    startVoice()
    if (!locationGranted) Toast.makeText(this, "Геолокация не разрешена. София сможет сообщать время, но не текущее местоположение.", Toast.LENGTH_LONG).show()
   } else status.text="Без разрешения на микрофон София не сможет слушать."
  }
 }

 private fun startVoice() {
  try {
   val intent = Intent(this, VoiceService::class.java)
   if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(intent) else startService(intent)
   voiceRequested = true
   voiceButton.text = "Остановить голосовой режим"
   status.text = "Команда запуска отправлена. Ожидаю подтверждения голосовой службы."
  } catch (e: Exception) {
   voiceRequested = false
   voiceButton.text = "Запустить голосовой режим"
   status.text = "Не удалось запустить голосовую службу: ${e.message ?: "ошибка Android"}"
  }
 }

 private fun stopVoice() {
  stopService(Intent(this, VoiceService::class.java))
  voiceRequested = false
  voiceButton.text = "Запустить голосовой режим"
  status.text = "Голосовой режим остановлен."
 }
}
