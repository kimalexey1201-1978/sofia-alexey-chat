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

class MainActivity : Activity() {
 private lateinit var status: TextView
 private val req = 41
 override fun onCreate(savedInstanceState: Bundle?) {
  super.onCreate(savedInstanceState)
  status = TextView(this).apply { text = "София готова к запуску голосового режима."; textSize = 18f; gravity = Gravity.CENTER; setPadding(24,24,24,24) }
  val start = Button(this).apply { text = "Запустить голосовой режим"; setOnClickListener { requestAudio() } }
  val stop = Button(this).apply { text = "Остановить Софию"; setOnClickListener { stopService(Intent(this@MainActivity, VoiceService::class.java)); status.text = "Голосовой режим остановлен." } }
  setContentView(LinearLayout(this).apply { orientation=LinearLayout.VERTICAL; gravity=Gravity.CENTER; setPadding(24,24,24,24); addView(status); addView(start); addView(stop) })
 }
 private fun requestAudio() {
  val p = mutableListOf(Manifest.permission.RECORD_AUDIO)
  if (Build.VERSION.SDK_INT >= 33) p += Manifest.permission.POST_NOTIFICATIONS
  val missing = p.filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
  if (missing.isEmpty()) startVoice() else requestPermissions(missing.toTypedArray(), req)
 }
 override fun onRequestPermissionsResult(requestCode:Int, permissions:Array<out String>, grantResults:IntArray) {
  super.onRequestPermissionsResult(requestCode,permissions,grantResults)
  if (requestCode==req) { if (grantResults.isNotEmpty() && grantResults[0]==PackageManager.PERMISSION_GRANTED) startVoice() else status.text="Нужно разрешение на микрофон." }
 }
 private fun startVoice() {
  val i=Intent(this,VoiceService::class.java)
  if (Build.VERSION.SDK_INT>=Build.VERSION_CODES.O) startForegroundService(i) else startService(i)
  status.text="София работает в фоне и ждёт слово «София»."
 }
}
