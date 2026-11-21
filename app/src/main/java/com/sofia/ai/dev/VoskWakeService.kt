package com.sofia.ai.dev

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import org.json.JSONObject
import org.vosk.Model
import org.vosk.Recognizer
import org.vosk.android.RecognitionListener
import org.vosk.android.SpeechService

/**
 * Local wake-word listener. It only recognizes the wake phrase; command speech
 * is handed to the existing Android SpeechRecognizer by MainActivity.
 */
class VoskWakeService : Service() {
    private var model: Model? = null
    private var recognizer: Recognizer? = null
    private var speechService: SpeechService? = null
    private var wakeHandled = false

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        val notification = Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle("София слушает")
            .setContentText("Локальное ожидание обращения «София»")
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopListening()
            stopSelf()
            return START_NOT_STICKY
        }
        if (speechService != null) return START_STICKY

        Thread {
            try {
                val modelDirectory = VoskModelInstaller.ensureInstalled(applicationContext)
                val loadedModel = Model(modelDirectory.absolutePath)
        private const val WAKE_GRAMMAR = "[\"софия\", \"софья\", \"[unk]\"]"
                val audioService = SpeechService(wakeRecognizer, SAMPLE_RATE)

                synchronized(this) {
                    if (wakeHandled || !isRunning) {
                        audioService.shutdown()
                        wakeRecognizer.close()
                        loadedModel.close()
                        return@Thread
                    }
                    model = loadedModel
                    recognizer = wakeRecognizer
                    speechService = audioService
                }

                audioService.startListening(listener)
            } catch (error: Exception) {
                sendStatus("Ошибка запуска локального распознавания: ${error.message ?: "неизвестная ошибка"}")
                stopSelf()
            }
        }.start()
        return START_NOT_STICKY
    }

    @Volatile private var isRunning = true

    private val listener = object : RecognitionListener {
        override fun onPartialResult(hypothesis: String) = Unit

        override fun onResult(hypothesis: String) {
            if (containsWakeWord(hypothesis)) onWakeWordDetected()
        }

        override fun onFinalResult(hypothesis: String) {
            if (containsWakeWord(hypothesis)) onWakeWordDetected()
        }

        override fun onError(exception: Exception) {
            sendStatus("Ошибка микрофона: ${exception.message ?: "неизвестная ошибка"}")
            stopSelf()
        }

        override fun onTimeout() = Unit
    }

    @Synchronized
    private fun onWakeWordDetected() {
        if (wakeHandled || !isRunning) return
        wakeHandled = true

        val activeSpeechService = speechService
        speechService = null
        try {
            activeSpeechService?.cancel()
            activeSpeechService?.shutdown()
        } catch (_: Exception) { }

        try { recognizer?.close() } catch (_: Exception) { }
        recognizer = null
        try { model?.close() } catch (_: Exception) { }
        model = null

        sendBroadcast(Intent(ACTION_WAKE_DETECTED).setPackage(packageName))
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    @Synchronized
    private fun stopListening() {
        isRunning = false
        val activeSpeechService = speechService
        speechService = null
        try {
            activeSpeechService?.cancel()
            activeSpeechService?.shutdown()
        } catch (_: Exception) { }
        try { recognizer?.close() } catch (_: Exception) { }
        recognizer = null
        try { model?.close() } catch (_: Exception) { }
        model = null
    }

    private fun containsWakeWord(json: String): Boolean {
        return try {
            val word = JSONObject(json).optString("text")
                .lowercase()
                .replace('ё', 'е')
                .replace(Regex("[^\\p{L}\\p{N} ]"), " ")
                .trim()
            word == "софия" || word == "софья"
        } catch (_: Exception) {
            false
        }
    }

    private fun sendStatus(message: String) {
        sendBroadcast(Intent(ACTION_STATUS).setPackage(packageName).putExtra(EXTRA_STATUS, message))
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID, "Голосовая активация Софии", NotificationManager.IMPORTANCE_LOW
            )
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    override fun onDestroy() {
        stopListening()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        const val ACTION_START = "com.sofia.ai.dev.action.START_WAKE"
        const val ACTION_STOP = "com.sofia.ai.dev.action.STOP_WAKE"
        const val ACTION_WAKE_DETECTED = "com.sofia.ai.dev.action.WAKE_DETECTED"
        const val ACTION_STATUS = "com.sofia.ai.dev.action.WAKE_STATUS"
        const val EXTRA_STATUS = "status"
        private const val CHANNEL_ID = "sofia_wake_listener"
        private const val NOTIFICATION_ID = 7101
        private const val SAMPLE_RATE = 16000.0f
        private const val WAKE_GRAMMAR = "[\\"софия\\", \\"софья\\", \\"[unk]\\"]"
    }
}
