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
 private val main=Handler(Looper.getMainLooper())
 private val io=Executors.newSingleThreadExecutor()
 private var recognizer:SpeechRecognizer?=null
 private var tts:TextToSpeech?=null
 private var ttsReady=false
 private var waiting=false
 private var restarting=false
 private var destroyed=false
 private var speaking=false
 private var restartTask:Runnable?=null
 override fun onCreate() {
  super.onCreate()
  if (Build.VERSION.SDK_INT>=26) {
   val ch=NotificationChannel(CHANNEL,"Голосовой режим Софии",NotificationManager.IMPORTANCE_LOW)
   getSystemService(NotificationManager::class.java).createNotificationChannel(ch)
  }
  startForeground(NOTIFICATION, notification("Ожидаю слово «София»"))
  tts=TextToSpeech(this,this)
  startRecognition()
 }
 override fun onStartCommand(intent:Intent?,flags:Int,startId:Int)=START_STICKY
 override fun onBind(intent:Intent?):IBinder?=null
 override fun onInit(status:Int) {
  if(status==TextToSpeech.SUCCESS){
   ttsReady=true
   tts?.language=Locale("ru","RU")
   tts?.setOnUtteranceProgressListener(object:UtteranceProgressListener(){
    override fun onStart(id:String){ }
    override fun onDone(id:String){main.post{speaking=false;if(!destroyed)startRecognition()}}
    @Deprecated("Deprecated in Java") override fun onError(id:String){main.post{speaking=false;if(!destroyed)startRecognition()}}
   })
  }
 }
 private fun notification(s:String)=NotificationCompat.Builder(this,CHANNEL)
  .setSmallIcon(android.R.drawable.ic_btn_speak_now).setContentTitle("София активна").setContentText(s).setOngoing(true).build()
 private fun status(s:String)=getSystemService(NotificationManager::class.java).notify(NOTIFICATION,notification(s))
 private fun startRecognition() {
  if(destroyed||restarting||speaking)return
  if(!SpeechRecognizer.isRecognitionAvailable(this)){status("Распознавание речи недоступно");return}
  try {
   recognizer?.destroy()
   recognizer=if(Build.VERSION.SDK_INT>=31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(this)) SpeechRecognizer.createOnDeviceSpeechRecognizer(this) else SpeechRecognizer.createSpeechRecognizer(this)
   recognizer?.setRecognitionListener(object:RecognitionListener {
    override fun onReadyForSpeech(p:Bundle?){status(if(waiting)"София проснулась, жду команду" else "Ожидаю слово «София»")}
    override fun onBeginningOfSpeech(){}; override fun onRmsChanged(v:Float){}; override fun onBufferReceived(b:ByteArray?){}; override fun onEndOfSpeech(){}
    override fun onError(e:Int){restart()}
    override fun onResults(b:Bundle?){val phrase=b?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty();if(phrase.isNotBlank())handle(phrase);if(!speaking && !destroyed)restart()}
    override fun onPartialResults(b:Bundle?){}; override fun onEvent(t:Int,b:Bundle?){}
   })
   val i=Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply { putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);putExtra(RecognizerIntent.EXTRA_LANGUAGE,"ru-RU");putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS,false);putExtra(RecognizerIntent.EXTRA_MAX_RESULTS,1) }
   recognizer?.startListening(i)
  } catch(e:Exception){restart()}
 }
 private fun restart(){
  if(destroyed||restarting||speaking)return
  restarting=true
  restartTask=Runnable{restarting=false;restartTask=null;startRecognition()}
  main.postDelayed(restartTask!!,700)
 }
 private fun stopRecognition(){
  restartTask?.let{main.removeCallbacks(it)}
  restartTask=null
  restarting=false
  recognizer?.cancel()
  recognizer?.destroy()
  recognizer=null
 }
 private fun norm(s:String)=s.lowercase(Locale("ru","RU")).replace(Regex("[.,!?;:]")," ").replace(Regex("\\s+")," ").trim()
 private fun handle(raw:String) {
  val text=norm(raw)
  val match=Regex("(^|\\s)софия(?=\\s|$)").find(text)
  if(!waiting){
   if(match==null)return
   val rest=text.substring(match.range.last+1).trim()
   if(rest.isEmpty()){waiting=true;say("Я слушаю");status("София проснулась, жду команду")}else sendCommand(rest)
  } else if(text!="софия") sendCommand(raw)
 }
 private fun sendCommand(command:String) {
  waiting=false;status("Выполняю команду")
  io.execute {
   try {
    val msgs=JSONArray().put(JSONObject().put("role","system").put("content","Ты София, личный помощник. Отвечай по-русски кратко и естественно.")).put(JSONObject().put("role","user").put("content",command))
    val body=JSONObject().put("messages",msgs).toString()
    val c=URL(ENDPOINT).openConnection() as HttpURLConnection
    c.requestMethod="POST";c.connectTimeout=15000;c.readTimeout=45000;c.doOutput=true;c.setRequestProperty("Content-Type","application/json")
    c.outputStream.use{it.write(body.toByteArray(Charsets.UTF_8))}
    val stream=if(c.responseCode in 200..299)c.inputStream else c.errorStream
    val raw=stream.bufferedReader().use{it.readText()};c.disconnect()
    val answer=JSONObject(raw).optJSONArray("choices")?.optJSONObject(0)?.optJSONObject("message")?.optString("content")?.takeIf{it.isNotBlank()} ?: "Не удалось получить ответ."
    main.post{say(answer);status("Ожидаю слово «София»")}
   }catch(e:Exception){main.post{say("Не удалось связаться с сервером.");status("Ошибка соединения. Ожидаю слово «София»")}}
  }
 }
 private fun say(s:String){
  if(ttsReady){
   speaking=true
   stopRecognition()
   tts?.speak(s,TextToSpeech.QUEUE_FLUSH,null,"sofia-response")
  } else {
   main.postDelayed({if(!destroyed)startRecognition()},1200)
  }
 }
 override fun onDestroy(){destroyed=true;main.removeCallbacksAndMessages(null);recognizer?.destroy();tts?.stop();tts?.shutdown();io.shutdownNow();super.onDestroy()}
 companion object {private const val CHANNEL="sofia_voice";private const val NOTIFICATION=7301;private const val ENDPOINT="https://sofia.kim-alexey1201.workers.dev/api/chat"}
}
