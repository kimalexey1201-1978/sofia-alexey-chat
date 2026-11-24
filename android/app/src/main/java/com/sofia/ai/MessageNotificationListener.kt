package com.sofia.ai

import android.app.Notification
import android.app.Person
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.content.Intent
import android.os.Bundle
import android.util.Log
import java.util.LinkedHashMap

/**
 * Reads only notifications explicitly classified by Android as messages.
 * The user must enable this listener in Android's Notification Access settings.
 */
class MessageNotificationListener : NotificationListenerService() {
 private val recentNotifications = LinkedHashMap<String, String>()

 override fun onNotificationPosted(sbn: StatusBarNotification) {
  if (sbn.packageName == packageName) return
  val notification = sbn.notification ?: return
  if (notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) return

  val extras = notification.extras ?: return
  val messageBundles = extras.getParcelableArray(Notification.EXTRA_MESSAGES)
  val latestMessage = messageBundles?.lastOrNull() as? Bundle
  val knownMessagingApps = setOf(
   "com.kakao.talk",
   "com.samsung.android.messaging",
   "com.google.android.apps.messaging",
   "org.telegram.messenger",
   "com.whatsapp",
   "jp.naver.line.android",
   "com.facebook.orca",
   "com.discord",
   "com.instagram.android",
   "com.viber.voip",
   "com.tencent.mm"
  )
  val isMessage = notification.category == Notification.CATEGORY_MESSAGE ||
   latestMessage != null || sbn.packageName in knownMessagingApps
  if (!isMessage) return

  val messageText = latestMessage?.getCharSequence("text")?.toString()
   ?.takeIf { it.isNotBlank() }
   ?: extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()
    ?.takeIf { it.isNotBlank() }
   ?: extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()
    ?.takeIf { it.isNotBlank() }
   ?: return

  @Suppress("DEPRECATION")
  val senderPerson = latestMessage?.getParcelable("sender_person") as? Person
  val sender = senderPerson?.name?.toString()?.takeIf { it.isNotBlank() }
   ?: latestMessage?.getCharSequence("sender")?.toString()?.takeIf { it.isNotBlank() }
   ?: extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.takeIf { it.isNotBlank() }
   ?: "неизвестный отправитель"

  // Keep only a small in-memory deduplication window; message contents are not persisted.
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
     .setAction(VoiceService.ACTION_READ_INCOMING_MESSAGE)
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
 }
}
