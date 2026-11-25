package com.sofia.ai

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.SystemClock
import java.text.DateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/**
 * Reads local device time and (when permission is granted) a GPS-backed location.
 * No network connection is required for the clock or GPS provider.
 */
internal object DeviceContext {
    fun snapshot(context: Context): String {
        val now = System.currentTimeMillis()
        val timeZone = TimeZone.getDefault()
        val date = DateFormat.getDateTimeInstance(
            DateFormat.FULL, DateFormat.LONG, Locale("ru", "RU")
        ).format(Date(now))
        val clock = "Местные дата и время: $date. Часовой пояс: ${timeZone.id}, UTC${offset(timeZone, now)}."

        val fine = context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val coarse = context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (!fine && !coarse) return "$clock\nГеолокация: разрешение Android не предоставлено."

        val manager = context.getSystemService(LocationManager::class.java)
            ?: return "$clock\nГеолокация: служба местоположения Android недоступна."
        if (!manager.isLocationEnabled) return "$clock\nГеолокация: службы определения местоположения выключены."

        val candidates = mutableListOf<Location>()
        val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER)
        for (provider in providers) {
            try {
                if (manager.isProviderEnabled(provider)) {
                    manager.getLastKnownLocation(provider)?.let { candidates.add(it) }
                }
            } catch (_: SecurityException) {
                // Permission can be revoked while the service is running.
            } catch (_: IllegalArgumentException) {
                // Provider is not available on this device.
            }
        }

        // On Android 11+, request a fresh fix briefly; GPS works without internet.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            for (provider in listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)) {
                try {
                    if (!manager.isProviderEnabled(provider)) continue
                    val result = AtomicReference<Location?>()
                    val latch = CountDownLatch(1)
                    manager.getCurrentLocation(provider, null, context.mainExecutor) { location ->
                        result.set(location)
                        latch.countDown()
                    }
                    latch.await(7, TimeUnit.SECONDS)
                    result.get()?.let { candidates.add(it) }
                    if (candidates.any { it.provider == LocationManager.GPS_PROVIDER && ageMillis(it) < 120_000L }) break
                } catch (_: SecurityException) {
                    break
                } catch (_: Exception) {
                    // Fall back to a cached location, clearly reporting its age.
                }
            }
        }

        val best = candidates.maxByOrNull { it.time }
            ?: return "$clock\nГеолокация: координаты пока не получены. Для первого GPS-определения может потребоваться несколько минут на открытом месте."
        val age = ageMillis(best)
        val ageText = when {
            age < 60_000L -> "только что"
            age < 3_600_000L -> "${age / 60_000L} мин. назад"
            else -> "${age / 3_600_000L} ч. ${(age % 3_600_000L) / 60_000L} мин. назад"
        }
        val accuracy = if (best.hasAccuracy()) "±${best.accuracy.toInt()} м" else "точность неизвестна"
        val freshness = if (age > 15 * 60_000L) "ВНИМАНИЕ: координаты устарели." else "Координаты актуальны по последнему измерению."
        return "$clock\nКоординаты: ${"%.6f".format(Locale.US, best.latitude)}, ${"%.6f".format(Locale.US, best.longitude)}. Источник: ${best.provider}. Точность: $accuracy. Получены: $ageText. $freshness"
    }

    private fun ageMillis(location: Location): Long =
        (System.currentTimeMillis() - location.time).coerceAtLeast(0L)

    private fun offset(zone: TimeZone, timestamp: Long): String {
        val totalMinutes = zone.getOffset(timestamp) / 60_000
        val sign = if (totalMinutes >= 0) "+" else "-"
        val absolute = kotlin.math.abs(totalMinutes)
        return "%s%02d:%02d".format(Locale.US, sign, absolute / 60, absolute % 60)
    }
}
