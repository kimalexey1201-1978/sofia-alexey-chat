package com.sofia.ai

import android.app.Notification
import android.app.Person
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import org.json.JSONObject

/**
 * Caches the latest notification text from Samsung Messages and WhatsApp.
 *
 * Notifications are never spoken or forwarded to VoiceService automatically.
 * Reading is performed only after the owner gives the matching voice command.
 */
class MessageNotificationListener : NotificationListenerService() {

 override fun onNotificationPosted(sbn: StatusBarNotification) {
  val packageName = sbn.packageName
  if (packageName !in ALLOWED_MESSAGE_PACKAGES || packageName == this.packageName) return

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

  val key = when (packageName) {
   SAMSUNG_MESSAGES_PACKAGE -> LAST_SAMSUNG_MESSAGE_KEY
   WHATSAPP_PACKAGE -> LAST_WHATSAPP_MESSAGE_KEY
   else -> return
  }
  val payload = JSONObject()
   .put("sender", sender.take(200))
   .put("text", messageText.take(8000))
   .toString()

  // Persist separate source slots. No service start, speech, reply, or send action occurs here.
  val saved = try {
   SofiaSecurePreferences(
    getSharedPreferences(INCOMING_MESSAGES_PREFS, MODE_PRIVATE),
    INCOMING_MESSAGES_NAMESPACE
   ).putString(key, payload)
   true
  } catch (e: Exception) {
   Log.w(TAG, "Could not securely cache latest message for source=$packageName", e)
   false
  }
  if (!saved) Log.w(TAG, "Could not cache latest message for source=$packageName")
 }

 companion object {
  private const val TAG = "SofiaMessageListener"
  private const val INCOMING_MESSAGES_PREFS = "sofia_incoming_messages"
  private const val INCOMING_MESSAGES_NAMESPACE = "incoming-messages"
  private const val LAST_SAMSUNG_MESSAGE_KEY = "last_samsung_message"
  private const val LAST_WHATSAPP_MESSAGE_KEY = "last_whatsapp_message"
  private const val SAMSUNG_MESSAGES_PACKAGE = "com.samsung.android.messaging"
  private const val WHATSAPP_PACKAGE = "com.whatsapp"
  private val ALLOWED_MESSAGE_PACKAGES = setOf(SAMSUNG_MESSAGES_PACKAGE, WHATSAPP_PACKAGE)
 }
}
