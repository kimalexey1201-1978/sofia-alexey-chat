package com.sofia.ai

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
    private val namespace: String = "default",
    private val keyAlias: String = DEFAULT_keyAlias
) {
    companion object {
        private val STORAGE_LOCK = Any()
        private const val DEFAULT_keyAlias = "sofia_memory_aes_gcm_v1"
        private const val PREFIX = "enc:v1:"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val TAG_BITS = 128
        private const val IV_BYTES = 12
    }

    fun getString(key: String, defaultValue: String?): String? {
        synchronized(STORAGE_LOCK) {
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
    }

    fun putString(key: String, value: String) {
        synchronized(STORAGE_LOCK) {
        val encrypted = encrypt(key, value)
        check(prefs.edit().putString(key, encrypted).commit()) {
            "Не удалось сохранить зашифрованную память Софии."
        }
    
        }
    }

    private fun encrypt(key: String, value: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateSecretKey())
        cipher.updateAAD(aad(key))
        val ciphertext = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        return PREFIX + Base64.encodeToString(cipher.iv + ciphertext, Base64.NO_WRAP)
    }

    /**
     * Read-only bridge for values encrypted by the pre-namespace implementation.
     * Legacy ciphertext used the preference key itself as GCM AAD. This method
     * deliberately does not rewrite the source value; migration writes into the
     * destination store only after parsing and validating the complete payload.
     */
    fun getLegacyString(key: String, defaultValue: String?): String? {
        synchronized(STORAGE_LOCK) {
        val stored = prefs.getString(key, null) ?: return defaultValue
        if (!stored.startsWith(PREFIX)) return stored
        return try {
            decryptWithAad(key.toByteArray(Charsets.UTF_8), stored.removePrefix(PREFIX))
        } catch (e: Exception) {
            throw IllegalStateException(
                "Не удалось прочитать старую зашифрованную память Софии. Исходные данные сохранены.", e
            )
        }
    
        }
    }

    private fun decrypt(key: String, encoded: String): String =
        decryptWithAad(aad(key), encoded)

    private fun decryptWithAad(aad: ByteArray, encoded: String): String {
        val payload = Base64.decode(encoded, Base64.NO_WRAP)
        require(payload.size > IV_BYTES) { "Invalid encrypted payload" }
        val iv = payload.copyOfRange(0, IV_BYTES)
        val ciphertext = payload.copyOfRange(IV_BYTES, payload.size)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, existingSecretKey(), GCMParameterSpec(TAG_BITS, iv))
        cipher.updateAAD(aad)
        return String(cipher.doFinal(ciphertext), Charsets.UTF_8)
    }

    private fun aad(key: String): ByteArray = "$namespace:$key".toByteArray(Charsets.UTF_8)

    /** Never create a replacement key while decrypting existing ciphertext. */
    private fun existingSecretKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        return keyStore.getKey(keyAlias, null) as? SecretKey
            ?: throw IllegalStateException(
                "Ключ шифрования памяти Софии отсутствует. Зашифрованные данные сохранены без изменений; автоматическое создание нового ключа запрещено."
            )
    }

    /** Key creation is allowed only on a write or plaintext migration path. */
    private fun getOrCreateSecretKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val existing = keyStore.getKey(keyAlias, null) as? SecretKey
        if (existing != null) return existing

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(
                keyAlias,
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
