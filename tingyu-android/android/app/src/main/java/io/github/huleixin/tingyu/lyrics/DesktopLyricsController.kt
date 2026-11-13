package io.github.huleixin.tingyu.lyrics

import android.app.AppOpsManager
import android.app.KeyguardManager
import android.content.*
import android.graphics.PixelFormat
import android.hardware.input.InputManager
import android.os.*
import android.provider.Settings
import android.view.*
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.ViewCompositionStrategy
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.core.content.ContextCompat
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import io.github.huleixin.tingyu.playback.PlaybackDiagnostics
import com.getcapacitor.JSObject

// Playback-service-owned overlay; never starts a foreground service or keeps the screen awake.
internal class DesktopLyricsController(private val context: Context, private val projection: LyricsProjectionSource) {
    private val preferences = LyricsPreferences.get(context)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val uiContext = if (Build.VERSION.SDK_INT >= 30) context.createWindowContext(WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY, null) else context
    private val wm = uiContext.getSystemService(WindowManager::class.java)
    private val main = Handler(Looper.getMainLooper())
    private var view: ComposeView? = null
    private var owner: OverlayViewOwner? = null
    private var params: WindowManager.LayoutParams? = null
    private var dragging = false
    private var availableX = 1f
    private var availableY = 1f
    private var leftInset = 0
    private var topInset = 0
    private val receiver = object : BroadcastReceiver() { override fun onReceive(c: Context?, intent: Intent?) { refresh() } }
    private val ops = context.getSystemService(AppOpsManager::class.java)
    private val permissionChange = AppOpsManager.OnOpChangedListener { _, pkg -> if (pkg == context.packageName) main.post { refresh() } }

    init {
        active = this
        runCatching { ContextCompat.registerReceiver(context, receiver, IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_OFF); addAction(Intent.ACTION_SCREEN_ON); addAction(Intent.ACTION_USER_PRESENT); addAction(Intent.ACTION_CONFIGURATION_CHANGED)
        }, ContextCompat.RECEIVER_NOT_EXPORTED) }
        runCatching { ops?.startWatchingMode(AppOpsManager.OPSTR_SYSTEM_ALERT_WINDOW, context.packageName, permissionChange) }
        scope.launch { combine(preferences.state, projection.state) { _, _ -> Unit }.collect { refresh() } }
    }

    /** Visibility gates are events, not polling; permission revocation removes the window too. */
    private fun refresh() {
        val settings = preferences.state.value
        val power = context.getSystemService(PowerManager::class.java)
        val keyguard = context.getSystemService(KeyguardManager::class.java)
        val reason = when {
            !settings.desktop -> "disabled"
            !Settings.canDrawOverlays(context) -> "permission-required"
            power?.isInteractive == false || keyguard?.isKeyguardLocked == true -> "screen-locked"
            settings.hideInApp && appVisible -> "hidden-in-app"
            !projection.state.value.state.playback.track.present -> "waiting-for-playback"
            else -> "visible"
        }
        if (reason != "visible") { removeWindow(); status.value = reason; return }
        try {
            val layout = layout(settings)
            if (view == null) {
                val trees = OverlayViewOwner()
                val compose = ComposeView(uiContext)
                trees.attach(compose)
                compose.setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnDetachedFromWindow)
                owner = trees; view = compose; params = layout
                compose.setContent {
                    val state by projection.state.collectAsState()
                    val prefs by preferences.state.collectAsState()
                    DesktopLyricsView(state, prefs, ::drag, ::savePosition,
                        { preferences.update { it.copy(desktop = false) } }, { preferences.update { it.copy(locked = true) } })
                }
                wm.addView(compose, layout)
            } else {
                if (dragging) params?.let { layout.x = it.x.coerceIn(leftInset, leftInset + availableX.toInt()); layout.y = it.y.coerceIn(topInset, topInset + availableY.toInt()) }
                params = layout; wm.updateViewLayout(view, layout)
            }
            status.value = "visible"
        } catch (error: RuntimeException) {
            removeWindow(); status.value = "window-error"
            PlaybackDiagnostics.note("desktop-lyrics-window", JSObject().put("error", error.javaClass.simpleName))
        }
    }

    private fun layout(settings: LyricsPreferencesState): WindowManager.LayoutParams {
        val density = uiContext.resources.displayMetrics.density
        val metrics = uiContext.resources.displayMetrics
        var width = metrics.widthPixels; var height = metrics.heightPixels
        var right = 0; var bottom = 0; leftInset = 0; topInset = 0
        if (Build.VERSION.SDK_INT >= 30) {
            val bounds = wm.maximumWindowMetrics
            width = bounds.bounds.width(); height = bounds.bounds.height()
            val inset = bounds.windowInsets.getInsetsIgnoringVisibility(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
            leftInset = inset.left; topInset = inset.top; right = inset.right; bottom = inset.bottom
        } else { topInset = (24 * density).toInt(); bottom = (48 * density).toInt() }
        val w = minOf((420 * density).toInt(), width - leftInset - right - (24 * density).toInt()).coerceAtLeast(1)
        val h = ((settings.style.fontSize * 1.6f * (if (settings.style.doubleLine) 1.82f else 1f) * uiContext.resources.configuration.fontScale + 12 + (if (settings.locked) 0 else 48)) * density)
            .toInt().coerceAtMost(height - topInset - bottom).coerceAtLeast(1)
        availableX = (width - leftInset - right - w).coerceAtLeast(0).toFloat()
        availableY = (height - topInset - bottom - h).coerceAtLeast(0).toFloat()
        val flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
            (if (settings.locked) WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE else 0)
        return WindowManager.LayoutParams(w, h, if (Build.VERSION.SDK_INT >= 26) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else WindowManager.LayoutParams.TYPE_PHONE, flags, PixelFormat.TRANSLUCENT).apply {
            gravity = Gravity.TOP or Gravity.LEFT
            if (Build.VERSION.SDK_INT >= 30) setFitInsetsTypes(0)
            x = leftInset + (availableX * settings.x).toInt(); y = topInset + (availableY * settings.y).toInt()
            // Android 12+: an untrusted pass-through window must stay below obscuring opacity.
            val ceiling = if (Build.VERSION.SDK_INT >= 31) context.getSystemService(InputManager::class.java)?.maximumObscuringOpacityForTouch ?: .8f else 1f
            alpha = settings.style.opacity.coerceAtMost(if (settings.locked) ceiling else 1f)
            title = "听屿桌面歌词"
        }
    }

    private fun drag(dx: Float, dy: Float) {
        val p = params ?: return
        dragging = true
        p.x = (p.x + dx).toInt().coerceIn(leftInset, leftInset + availableX.toInt())
        p.y = (p.y + dy).toInt().coerceIn(topInset, topInset + availableY.toInt())
        runCatching { wm.updateViewLayout(view, p) }
    }
    private fun savePosition() {
        val p = params ?: return
        dragging = false
        preferences.update { it.copy(x = (p.x - leftInset) / availableX.coerceAtLeast(1f), y = (p.y - topInset) / availableY.coerceAtLeast(1f)) }
    }
    private fun removeWindow() {
        val current = view; view = null; params = null; dragging = false
        if (current != null) { current.disposeComposition(); runCatching { wm.removeViewImmediate(current) } }
        owner?.close(); owner = null
    }
    fun close() {
        scope.cancel(); main.removeCallbacksAndMessages(null)
        runCatching { context.unregisterReceiver(receiver) }; runCatching { ops?.stopWatchingMode(permissionChange) }
        removeWindow(); if (active === this) active = null; status.value = "service-stopped"
    }
    companion object {
        private var active: DesktopLyricsController? = null
        private var appVisible = false
        val status = MutableStateFlow("service-stopped")
        @JvmStatic fun setAppVisible(value: Boolean) { appVisible = value; active?.refresh() }
    }
}
