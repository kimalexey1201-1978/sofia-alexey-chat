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
  setContentView(LinearLayout(this).apply {
   orientation=LinearLayout.VERTICAL
   gravity=Gravity.CENTER
   setPadding(24,24,24,24)
   addView(status)
   addView(stop)
  })
  requestAudioAndStart()
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
