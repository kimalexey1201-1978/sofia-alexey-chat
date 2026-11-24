package com.sofia.ai

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.content.SharedPreferences
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** AES-256-GCM preferences encrypted with a key held by Android Keystore. */
internal class SofiaSecurePreferences(
    private val prefs: SharedPreferences,
    private val namespace: String = "default"
) {
    companion object {
        private const val KEY_ALIAS = "sofia_memory_aes_gcm_v1"
        private const val PREFIX = "enc:v1:"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val TAG_BITS = 128
        private const val IV_BYTES = 12
    }

    @Synchronized
    fun getString(key: String, defaultValue: String?): String? {
        val stored = prefs.getString(key, null) ?: return defaultValue
        if (!stored.startsWith(PREFIX)) {
            // One-time migration: only replace plaintext after encryption persisted successfully.
            val encrypted = encrypt(key, stored)
            check(prefs.edit().putString(key, encrypted).commit()) {
                "Не удалось зашифровать существующую память Софии."
            }
            return stored
        }
        return try {
            decrypt(key, stored.removePrefix(PREFIX))
        } catch (e: Exception) {
            throw IllegalStateException(
                "Не удалось расшифровать локальную память Софии. Исходные данные не изменены.", e
            )
        }
    }

    @Synchronized
    fun putString(key: String, value: String) {
        val encrypted = encrypt(key, value)
        check(prefs.edit().putString(key, encrypted).commit()) {
            "Не удалось сохранить зашифрованную память Софии."
        }
    }

    private fun encrypt(key: String, value: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        cipher.updateAAD(aad(key))
        val ciphertext = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        return PREFIX + Base64.encodeToString(cipher.iv + ciphertext, Base64.NO_WRAP)
    }

    private fun decrypt(key: String, encoded: String): String {
        val payload = Base64.decode(encoded, Base64.NO_WRAP)
        require(payload.size > IV_BYTES) { "Invalid encrypted payload" }
        val iv = payload.copyOfRange(0, IV_BYTES)
        val ciphertext = payload.copyOfRange(IV_BYTES, payload.size)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(TAG_BITS, iv))
        cipher.updateAAD(aad(key))
        return String(cipher.doFinal(ciphertext), Charsets.UTF_8)
    }

    private fun aad(key: String): ByteArray = "$namespace:$key".toByteArray(Charsets.UTF_8)

    private fun secretKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val existing = keyStore.getKey(KEY_ALIAS, null) as? SecretKey
        if (existing != null) return existing

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)
                .build()
        )
        return generator.generateKey()
    }
}
