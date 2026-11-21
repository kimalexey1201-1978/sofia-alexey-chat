package com.sofia.ai.dev

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.app.PendingIntent
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
    @Volatile
    private var speechService: SpeechService? = null

    @Volatile
    private var wakeHandled = false

    @Volatile
    private var isRunning = true

    @Volatile
    private var isStarting = false

    @Volatile
    private var restartAfterStartup = false

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
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            restartAfterStartup = false
            stopListening()
            stopSelf(startId)
            return START_NOT_STICKY
        }
        if (speechService != null) return START_STICKY
        if (isStarting) {
            // A quick stop/start can arrive while the model is still loading.
            // Let the current worker finish or abort, then honor the new request.
            isRunning = true
            wakeHandled = false
            restartAfterStartup = true
            return START_STICKY
        }

        isRunning = true
        wakeHandled = false
        restartAfterStartup = false
        isStarting = true

        Thread {
            try {
                val modelDirectory = VoskModelInstaller.ensureInstalled(applicationContext)
                val loadedModel = Model(modelDirectory.absolutePath)
                val wakeRecognizer = Recognizer(loadedModel, SAMPLE_RATE, WAKE_GRAMMAR)
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
                val shouldReportFailure = synchronized(this) {
                    isRunning && !restartAfterStartup && !wakeHandled
                }
                if (shouldReportFailure) {
                    val message = "Ошибка запуска локального распознавания: ${error.message ?: "неизвестная ошибка"}"
                    sendStatus(message)
                    postErrorNotification(message)
                    stopForeground(STOP_FOREGROUND_REMOVE)
                    stopSelf(startId)
                }
            } finally {
                val shouldRestart = synchronized(this) {
                    isStarting = false
                    val restart = restartAfterStartup && isRunning && !wakeHandled
                    restartAfterStartup = false
                    restart
                }
                if (shouldRestart) {
                    onStartCommand(Intent(this, VoskWakeService::class.java).apply {
                        action = ACTION_START
                    }, 0, 0)
                }
            }
        }.start()
        return START_NOT_STICKY
    }

    private val listener = object : RecognitionListener {
        override fun onPartialResult(hypothesis: String) = Unit

        override fun onResult(hypothesis: String) {
            if (containsWakeWord(hypothesis)) onWakeWordDetected()
        }

        override fun onFinalResult(hypothesis: String) {
            if (containsWakeWord(hypothesis)) onWakeWordDetected()
        }

        override fun onError(exception: Exception) {
            val shouldReportFailure = synchronized(this@VoskWakeService) {
                isRunning && !wakeHandled
            }
            if (!shouldReportFailure) return
            val message = "Ошибка микрофона: ${exception.message ?: "неизвестная ошибка"}"
            sendStatus(message)
            postErrorNotification(message)
            stopForeground(STOP_FOREGROUND_REMOVE)
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
        } catch (_: Exception) {
        }

        try {
            recognizer?.close()
        } catch (_: Exception) {
        }
        recognizer = null
        try {
            model?.close()
        } catch (_: Exception) {
        }
        model = null

        val openAppIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(EXTRA_START_VOICE, true)
        }
        val pendingIntent = PendingIntent.getActivity(
            this, WAKE_NOTIFICATION_ID, openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val wakeNotification = Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle("София услышала обращение")
            .setContentText("Нажми, чтобы продиктовать команду")
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .build()
        getSystemService(NotificationManager::class.java).notify(WAKE_NOTIFICATION_ID, wakeNotification)
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
        } catch (_: Exception) {
        }
        try {
            recognizer?.close()
        } catch (_: Exception) {
        }
        recognizer = null
        try {
            model?.close()
        } catch (_: Exception) {
        }
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

    private fun postErrorNotification(message: String) {
        val openAppIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(EXTRA_STATUS, message)
        }
        val pendingIntent = PendingIntent.getActivity(
            this, ERROR_NOTIFICATION_ID, openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle("Голосовая активация остановлена")
            .setContentText(message)
            .setStyle(Notification.BigTextStyle().bigText(message))
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .build()
        getSystemService(NotificationManager::class.java).notify(ERROR_NOTIFICATION_ID, notification)
    }

    private fun sendStatus(message: String) {
        sendBroadcast(
            Intent(ACTION_STATUS)
                .setPackage(packageName)
                .putExtra(EXTRA_STATUS, message)
        )
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Голосовая активация Софии",
                NotificationManager.IMPORTANCE_LOW
            )
            getSystemService(NotificationManager::class.java)
                .createNotificationChannel(channel)
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
        const val EXTRA_START_VOICE = "start_voice_after_wake"
        const val WAKE_NOTIFICATION_ID = 7102
        const val ERROR_NOTIFICATION_ID = 7103
        private const val CHANNEL_ID = "sofia_wake_listener"
        private const val NOTIFICATION_ID = 7101
        private const val SAMPLE_RATE = 16000.0f
        private const val WAKE_GRAMMAR = """["софия", "софья", "[unk]"]"""
    }
}
