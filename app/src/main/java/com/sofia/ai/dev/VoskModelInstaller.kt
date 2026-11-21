package com.sofia.ai.dev

import android.content.Context
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.zip.ZipInputStream

/**
 * Installs the Russian Vosk model into app-private storage.
 * Call ensureInstalled() from a background thread; it performs network and disk I/O.
 */
internal object VoskModelInstaller {
    private const val MODEL_NAME = "vosk-model-small-ru-0.22"
    private const val MODEL_URL =
        "https://alphacephei.com/vosk/models/vosk-model-small-ru-0.22.zip"
    private const val MAX_ARCHIVE_BYTES = 100L * 1024L * 1024L
    private const val MAX_EXTRACTED_BYTES = 250L * 1024L * 1024L
    private const val MAX_ENTRIES = 5000

    fun ensureInstalled(context: Context): File {
        val modelRoot = File(context.filesDir, "vosk-models")
        if (!modelRoot.exists() && !modelRoot.mkdirs()) {
            throw IllegalStateException("Не удалось создать каталог моделей.")
        }

        val installed = File(modelRoot, MODEL_NAME)
        if (isValidModel(installed) && File(installed, ".sofia-ready").isFile) {
            return installed
        }

        val archive = File(context.cacheDir, "$MODEL_NAME.zip.part")
        val staging = File(modelRoot, "$MODEL_NAME.tmp")
        deleteRecursively(staging)
        archive.delete()

        try {
            downloadArchive(archive)
            extractArchive(archive, staging)
            if (!isValidModel(staging)) {
                throw IllegalStateException("Архив загружен, но модель неполная.")
            }
            File(staging, ".sofia-ready").writeText("vosk-small-ru-0.22")
            deleteRecursively(installed)
            if (!staging.renameTo(installed)) {
                throw IllegalStateException("Не удалось завершить установку модели.")
            }
            return installed
        } catch (error: Exception) {
            deleteRecursively(staging)
            throw error
        } finally {
            archive.delete()
        }
    }

    private fun downloadArchive(destination: File) {
        val connection = (URL(MODEL_URL).openConnection() as HttpURLConnection).apply {
            connectTimeout = 15000
            readTimeout = 60000
            instanceFollowRedirects = true
            requestMethod = "GET"
        }
        try {
            val code = connection.responseCode
            if (code !in 200..299) {
                throw IllegalStateException("Сервер модели вернул HTTP $code.")
            }
            val declaredLength = connection.contentLengthLong
            if (declaredLength > MAX_ARCHIVE_BYTES) {
                throw IllegalStateException("Размер архива превышает допустимый предел.")
            }
            var total = 0L
            BufferedInputStream(connection.inputStream).use { input ->
                FileOutputStream(destination).use { output ->
                    val buffer = ByteArray(64 * 1024)
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        total += count
                        if (total > MAX_ARCHIVE_BYTES) {
                            throw IllegalStateException("Загрузка превысила допустимый размер.")
                        }
                        output.write(buffer, 0, count)
                    }
                    output.fd.sync()
                }
            }
            if (total == 0L || (declaredLength > 0 && total != declaredLength)) {
                throw IllegalStateException("Загруженный архив неполный.")
            }
        } finally {
            connection.disconnect()
        }
    }

    private fun extractArchive(archive: File, destination: File) {
        if (!destination.mkdirs()) {
            throw IllegalStateException("Не удалось подготовить каталог распаковки.")
        }
        val destinationCanonical = destination.canonicalFile
        var extractedBytes = 0L
        var entries = 0

        ZipInputStream(BufferedInputStream(archive.inputStream())).use { zip ->
            while (true) {
                val entry = zip.nextEntry ?: break
                entries++
                if (entries > MAX_ENTRIES) {
                    throw IllegalStateException("В архиве слишком много элементов.")
                }

                val normalizedName = entry.name.replace('\\', '/')
                val prefix = "$MODEL_NAME/"
                if (!normalizedName.startsWith(prefix) || normalizedName.contains("../") ||
                    normalizedName.startsWith("/") || normalizedName.contains("/..")) {
                    throw IllegalStateException("Архив содержит недопустимый путь.")
                }

                val relativePath = normalizedName.removePrefix(prefix)
                if (relativePath.isEmpty()) {
                    zip.closeEntry()
                    continue
                }

                val outputFile = File(destination, relativePath).canonicalFile
                if (outputFile != destinationCanonical &&
                    !outputFile.path.startsWith(destinationCanonical.path + File.separator)) {
                    throw IllegalStateException("Обнаружен выход за пределы каталога модели.")
                }

                if (entry.isDirectory) {
                    if (!outputFile.exists() && !outputFile.mkdirs()) {
                        throw IllegalStateException("Не удалось создать каталог модели.")
                    }
                } else {
                    outputFile.parentFile?.let {
                        if (!it.exists() && !it.mkdirs()) {
                            throw IllegalStateException("Не удалось создать каталог файла модели.")
                        }
                    }
                    BufferedOutputStream(FileOutputStream(outputFile)).use { output ->
                        val buffer = ByteArray(32 * 1024)
                        while (true) {
                            val count = zip.read(buffer)
                            if (count < 0) break
                            extractedBytes += count
                            if (extractedBytes > MAX_EXTRACTED_BYTES) {
                                throw IllegalStateException("Распакованная модель превышает допустимый размер.")
                            }
                            output.write(buffer, 0, count)
                        }
                    }
                }
                zip.closeEntry()
            }
        }
    }

    private fun isValidModel(directory: File): Boolean {
        return File(directory, "am/final.mdl").isFile &&
            File(directory, "conf/model.conf").isFile &&
            File(directory, "graph/Gr.fst").isFile &&
            File(directory, "graph/HCLr.fst").isFile
    }

    private fun deleteRecursively(file: File) {
        if (!file.exists()) return
        if (file.isDirectory) file.listFiles()?.forEach(::deleteRecursively)
        file.delete()
    }
}
