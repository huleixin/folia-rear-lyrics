package io.github.huleixin.tingyu

import android.app.Activity
import android.view.WindowManager
import java.lang.ref.WeakReference

// android/app/src/main/java/io/github/huleixin/tingyu/NativeKeepScreenOn.kt
//
// FLAG_KEEP_SCREEN_ON 的**唯一裁决者**。
//
// 这个窗口标志有两个来源：
//   1. 「歌词舞台屏幕常亮」开关（JS 设置 → FoliaNative.setKeepScreenOn）；
//   2. 「极简歌词页常亮」——只在 Compose 极简页停在歌词页、且页面真正可见时生效
//      （宿主 ComposeChromeHost 根据 pager 页 + 生命周期计算后上报）。
//
// 如果两处各自动 addFlags/clearFlags，后写的一方会把另一方的意图抹掉：
// 舞台常亮与极简歌词页常亮必须按各自页面独立释放。
// 所以两个来源都只更新自己的布尔值，由这里按 `(global && stageVisible) || lyrics` 统一应用。
//
// 注意：FLAG_KEEP_SCREEN_ON 只阻止"无操作自动息屏"，不影响电源键手动锁屏，也不改
// 系统亮度——这正是产品要求的行为。
object NativeKeepScreenOn {
    private var global = false
    private var stageVisible = false
    private var lyrics = false
    private var activityRef: WeakReference<Activity>? = null

    fun attach(activity: Activity) {
        activityRef = WeakReference(activity)
    }

    @Synchronized
    fun setGlobal(enabled: Boolean) {
        global = enabled
        apply()
    }

    @Synchronized
    fun setStageVisible(visible: Boolean) {
        if (stageVisible == visible) return
        stageVisible = visible
        apply()
    }

    /** 极简歌词页常亮。只在值真的变化时才碰窗口标志。 */
    @Synchronized
    fun setLyrics(enabled: Boolean) {
        if (lyrics == enabled) return
        lyrics = enabled
        apply()
    }

    /** 宿主销毁/进程内重建时复位，避免把"上一页的常亮"带到下一屏。 */
    @Synchronized
    fun reset() {
        lyrics = false
        stageVisible = false
        apply()
    }

    private fun apply() {
        val activity = activityRef?.get() ?: return
        activity.runOnUiThread {
            val want = (global && stageVisible) || lyrics
            if (want) {
                activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            } else {
                activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
        }
    }
}
