package com.sofia.ai

import android.app.Notification
import android.app.Person
import android.content.Intent
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import java.util.LinkedHashMap

/**
 * Processes message notifications only from the explicitly approved messaging apps.
 *
 * Android grants notification access at the listener level, not per source app. Therefore
 * the package allowlist is checked before notification extras or message text are read.
 * The owner must explicitly enable this listener in Android Notification Access settings.
 */
class MessageNotificationListener : NotificationListenerService() {
 private val recentNotifications = LinkedHashMap<String, String>()

 override fun onNotificationPosted(sbn: StatusBarNotification) {
  // Enforce the source allowlist before inspecting any notification content.
  if (sbn.packageName !in ALLOWED_MESSAGE_PACKAGES) return
  if (sbn.packageName == packageName) return

  val notification = sbn.notification ?: return
  if (notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) return

  val extras = notification.extras ?: return
  val messageBundles = extras.getParcelableArray(Notification.EXTRA_MESSAGES)
  val latestMessage = messageBundles?.lastOrNull() as? Bundle

  val messageText = latestMessage?.getCharSequence("text")?.toString()
   ?.takeIf { it.isNotBlank() }
   ?: extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()
    ?.takeIf { it.isNotBlank() }
   ?: extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()
    ?.takeIf { it.isNotBlank() }
   ?: extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)
    ?.joinToString("\\n") { it.toString() }
    ?.takeIf { it.isNotBlank() }
   ?: return

  @Suppress("DEPRECATION")
  val senderPerson = latestMessage?.getParcelable("sender_person") as? Person
  val sender = senderPerson?.name?.toString()?.takeIf { it.isNotBlank() }
   ?: latestMessage?.getCharSequence("sender")?.toString()?.takeIf { it.isNotBlank() }
   ?: extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.takeIf { it.isNotBlank() }
   ?: "неизвестный отправитель"

  // Log only the approved source package and message length, never message content.
  Log.i(TAG, "Accepted message notification package=${sbn.packageName}, chars=${messageText.length}")

  // Keep a small in-memory deduplication window; message contents are not persisted here.
  val key = sbn.key
  if (recentNotifications[key] == messageText) return
  recentNotifications[key] = messageText
  while (recentNotifications.size > 100) {
   val first = recentNotifications.keys.firstOrNull() ?: break
   recentNotifications.remove(first)
  }

  try {
   startService(
    Intent(this, VoiceService::class.java)
     .setAction(VoiceService.ACTION_CACHE_INCOMING_MESSAGE)
     .putExtra(VoiceService.EXTRA_MESSAGE_SOURCE, if (sbn.packageName == "com.whatsapp") "whatsapp" else "sms")
     .putExtra(VoiceService.EXTRA_MESSAGE_SENDER, sender.take(200))
     .putExtra(VoiceService.EXTRA_MESSAGE_TEXT, messageText.take(8000))
   )
  } catch (e: Exception) {
   Log.w(TAG, "Could not hand an incoming message to the active voice service", e)
  }
 }

 override fun onNotificationRemoved(sbn: StatusBarNotification) {
  recentNotifications.remove(sbn.key)
 }

 companion object {
  private const val TAG = "SofiaMessageListener"

  // Samsung Messages, Google Messages, and WhatsApp only.
  private val ALLOWED_MESSAGE_PACKAGES = setOf(
   "com.samsung.android.messaging",
   "com.google.android.apps.messaging",
   "com.whatsapp"
  )
 }
}
