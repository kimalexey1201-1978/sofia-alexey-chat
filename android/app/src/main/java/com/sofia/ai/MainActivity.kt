package com.sofia.ai

import android.Manifest
import android.app.Activity
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
  val stop = Button(this).apply {
   text = "Остановить голосовой режим"
   setOnClickListener {
    stopService(Intent(this@MainActivity, VoiceService::class.java))
    status.text = "Голосовой режим остановлен."
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
   addView(stop)
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
  val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
   addCategory(Intent.CATEGORY_OPENABLE)
   type = "application/json"
   putExtra(Intent.EXTRA_TITLE, "sofia-memory.json")
  }
  startActivityForResult(intent, exportRequest)
 }

 @Deprecated("Deprecated in Java")
 override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
  super.onActivityResult(requestCode, resultCode, data)
  if (resultCode != RESULT_OK) return
  val uri = data?.data ?: return
  try {
   when (requestCode) {
    importRequest -> {
     val bytes = contentResolver.openInputStream(uri)?.use { it.readBytes() }
      ?: throw IllegalStateException("Не удалось открыть файл")
     require(bytes.size <= 5 * 1024 * 1024) { "Файл памяти больше 5 МБ" }
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
  val i=Intent(this,VoiceService::class.java)
  if (Build.VERSION.SDK_INT>=Build.VERSION_CODES.O) startForegroundService(i) else startService(i)
  status.text="София активна. Можешь свернуть приложение. Она ждёт слово «София»."
 }
}
