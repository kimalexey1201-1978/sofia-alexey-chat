package com.sofia.ai

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Geocoder
import android.location.Location
import android.location.LocationManager
import android.os.Build
import java.text.DateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/**
 * Reads the local device clock and resolves the last known location to a human-readable
 * city and district. Raw coordinates are never added to Sofia's model context.
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
        if (!fine && !coarse) return "$clock\nМестоположение: разрешение Android не предоставлено."

        val manager = context.getSystemService(LocationManager::class.java)
            ?: return "$clock\nМестоположение: служба Android недоступна."
        if (!manager.isLocationEnabled) return "$clock\nМестоположение: службы геолокации выключены."

        val candidates = mutableListOf<Location>()
        for (provider in listOf(LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER, LocationManager.GPS_PROVIDER)) {
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

        val best = candidates.maxByOrNull { it.time }
            ?: return "$clock\nГород и район пока не определены. Android ещё не предоставил сохранённое местоположение."

        val age = (System.currentTimeMillis() - best.time).coerceAtLeast(0L)
        val place = resolveCityAndDistrict(context, best)
            ?: return "$clock\nГород и район пока не удалось определить. Попробуй повторить запрос на улице или при включённой геолокации."

        val ageText = when {
            age < 60_000L -> "координаты получены только что"
            age < 3_600_000L -> "местоположение обновлялось ${age / 60_000L} мин. назад"
            else -> "местоположение обновлялось ${age / 3_600_000L} ч. назад"
        }
        val freshness = if (age > 15 * 60_000L) " Данные могут быть устаревшими." else ""
        return "$clock\nМестоположение: $place. $ageText.$freshness"
    }

    private fun resolveCityAndDistrict(context: Context, location: Location): String? {
        if (!Geocoder.isPresent()) return null
        val geocoder = Geocoder(context, Locale("ru", "RU"))
        val addresses = try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                val result = AtomicReference<List<android.location.Address>?>(null)
                val latch = CountDownLatch(1)
                geocoder.getFromLocation(location.latitude, location.longitude, 1) { found ->
                    result.set(found)
                    latch.countDown()
                }
                if (!latch.await(2, TimeUnit.SECONDS)) return null
                result.get().orEmpty()
            } else {
                @Suppress("DEPRECATION")
                geocoder.getFromLocation(location.latitude, location.longitude, 1).orEmpty()
            }
        } catch (_: Exception) {
            return null
        }
        val address = addresses.firstOrNull() ?: return null

        val city = address.locality?.takeIf { it.isNotBlank() }
            ?: address.subAdminArea?.takeIf { it.isNotBlank() }
            ?: address.adminArea?.takeIf { it.isNotBlank() }
        val district = address.subLocality?.takeIf { it.isNotBlank() }
            ?: address.subAdminArea?.takeIf { it.isNotBlank() && it != city }

        return when {
            city != null && district != null -> "город/населённый пункт $city, район $district"
            city != null -> "город/населённый пункт $city"
            district != null -> "район $district"
            else -> null
        }
    }

    private fun offset(zone: TimeZone, timestamp: Long): String {
        val totalMinutes = zone.getOffset(timestamp) / 60_000
        val sign = if (totalMinutes >= 0) "+" else "-"
        val absolute = kotlin.math.abs(totalMinutes)
        return "%s%02d:%02d".format(Locale.US, sign, absolute / 60, absolute % 60)
    }
}
