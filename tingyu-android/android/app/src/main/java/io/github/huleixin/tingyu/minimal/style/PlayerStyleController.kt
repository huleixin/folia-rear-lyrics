package io.github.huleixin.tingyu.minimal.style

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.os.Build
import io.github.huleixin.tingyu.diagnostics.DiagnosticLog
import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

// One style preference and one voluntary-introduction state for all entry points.
enum class PlayerStyle(val id: String, val label: String, val description: String) {
    CLASSIC("classic", "经典极简", "熟悉、简约、纯粹。"),
    IMMERSIVE("immersive", "沉浸极简", "流光、律动、沉浸。");

    companion object {
        fun fromId(id: String?) = entries.firstOrNull { it.id == id } ?: CLASSIC
    }
}

enum class PlayerStylePanel { CLOSED, INTRODUCTION, COFFEE, SELECTION }

class PlayerStyleController(private val preferences: SharedPreferences) {
    constructor(context: Context) : this(recoverPreferences(context))

    private val current = MutableStateFlow(PlayerStyle.fromId(preferences.getString(STYLE_KEY, null)))
    val style = current.asStateFlow()
    private val currentPanel = MutableStateFlow(PlayerStylePanel.CLOSED)
    val panel = currentPanel.asStateFlow()

    fun open() {
        currentPanel.value = if (preferences.getBoolean(INTRO_KEY, false)) PlayerStylePanel.SELECTION else PlayerStylePanel.INTRODUCTION
    }

    fun close() { currentPanel.value = PlayerStylePanel.CLOSED }

    fun back() {
        currentPanel.value = if (currentPanel.value == PlayerStylePanel.COFFEE) PlayerStylePanel.INTRODUCTION else PlayerStylePanel.CLOSED
    }

    fun openCoffee() {
        if (currentPanel.value == PlayerStylePanel.INTRODUCTION) currentPanel.value = PlayerStylePanel.COFFEE
    }

    /** Only an explicit free-experience action acknowledges the introduction. */
    fun experience() {
        if (currentPanel.value != PlayerStylePanel.INTRODUCTION && currentPanel.value != PlayerStylePanel.COFFEE) return
        preferences.edit().putBoolean(INTRO_KEY, true).apply()
        currentPanel.value = PlayerStylePanel.SELECTION
    }

    fun select(style: PlayerStyle) {
        if (currentPanel.value != PlayerStylePanel.SELECTION) return
        restoreStyle(style.id)
        close()
    }

    /** Appearance imports restore visual preference without changing the introduction acknowledgement. */
    fun restoreStyle(id: String?) {
        val next = PlayerStyle.fromId(id)
        preferences.edit().putString(STYLE_KEY, next.id).apply()
        current.value = next
    }

    companion object {
        /** A native renderer crash while visible gets one safe cold-start fallback. */
        private fun recoverPreferences(context: Context): SharedPreferences {
            val app = context.applicationContext
            val prefs = app.getSharedPreferences("player_style", Context.MODE_PRIVATE)
            if (prefs.getBoolean("immersive_visible", false) && Build.VERSION.SDK_INT >= 30) {
                val crashed = try {
                    (app.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager)
                        ?.getHistoricalProcessExitReasons(app.packageName, 0, 1)?.firstOrNull()
                        ?.let { it.reason == ApplicationExitInfo.REASON_CRASH_NATIVE && it.timestamp >= prefs.getLong("immersive_visible_since", Long.MAX_VALUE) } == true
                } catch (_: Exception) { false }
                if (crashed) {
                    prefs.edit().putString(STYLE_KEY, PlayerStyle.CLASSIC.id).apply()
                    DiagnosticLog.event("player-style", "native-crash-safe-fallback")
                }
            }
            prefs.edit().putBoolean("immersive_visible", false).apply()
            return prefs
        }
        const val STYLE_KEY = "playerStyle"
        const val INTRO_KEY = "playerStyleIntroAcknowledged"
    }
}
