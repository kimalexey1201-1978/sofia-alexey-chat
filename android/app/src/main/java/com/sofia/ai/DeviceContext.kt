package com.sofia.ai

import android.content.Context
import java.text.DateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Reads only the local device clock. Location access is intentionally not part of this build.
 */
internal object DeviceContext {
    fun snapshot(context: Context): String {
        val now = System.currentTimeMillis()
        val timeZone = TimeZone.getDefault()
        val date = DateFormat.getDateTimeInstance(
            DateFormat.FULL, DateFormat.LONG, Locale("ru", "RU")
        ).format(Date(now))
        return "Местные дата и время: $date. Часовой пояс: ${timeZone.id}, UTC${offset(timeZone, now)}."
    }

    private fun offset(zone: TimeZone, timestamp: Long): String {
        val totalMinutes = zone.getOffset(timestamp) / 60_000
        val sign = if (totalMinutes >= 0) "+" else "-"
        val absolute = kotlin.math.abs(totalMinutes)
        return "%s%02d:%02d".format(Locale.US, sign, absolute / 60, absolute % 60)
    }
}
