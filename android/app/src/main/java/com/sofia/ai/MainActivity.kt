package com.sofia.ai

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast

class MainActivity : Activity() {
 private lateinit var status: TextView
 private lateinit var voiceButton: Button
 private var voiceRequested = true
 private val maxMemoryImportBytes = 5 * 1024 * 1024
 private val req = 41
 private val importRequest = 42
 private val exportRequest = 43

 override fun onCreate(savedInstanceState: Bundle?) {
  super.onCreate(savedInstanceState)
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
   addView(importMemory)
   addView(exportMemory)
  })
  requestAudioAndStart()
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
  val p = mutableListOf(Manifest.permission.RECORD_AUDIO)
  if (Build.VERSION.SDK_INT >= 33) p += Manifest.permission.POST_NOTIFICATIONS
  val missing = p.filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
  if (missing.isEmpty()) startVoice()
  else requestPermissions(missing.toTypedArray(), req)
 }

 override fun onRequestPermissionsResult(requestCode:Int, permissions:Array<out String>, grantResults:IntArray) {
  super.onRequestPermissionsResult(requestCode,permissions,grantResults)
  if (requestCode==req) {
   val audioGranted = checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED
   if (audioGranted) startVoice() else status.text="Без разрешения на микрофон София не сможет слушать."
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
