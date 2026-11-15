package io.github.huleixin.tingyu.minimal.immersive.port
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

import io.github.huleixin.tingyu.minimal.immersive.MeloXPlaybackUiState
// SPDX-License-Identifier: GPL-3.0-only
// Adapted from lladlam/MeloX-Android 0.7.3, c04f36b9af540806b3bb185b347572e9ca12d87d.
// Tingyu modifications: shared command bus and timeline; independent permitted icons;
// no upstream playback, accounts, providers, database or Apple font resources.

/**
 * 实体音量键 → 播放页音量条的**即时**通道。
 *
 * ⚠ 为什么必须存在它（2026-10-07，用户报「物理音量键调节时播放页音量移动**还是**不平滑」）：
 *
 *   1. vivo 上硬件音量键**不发** `android.media.VOLUME_CHANGED_ACTION`
 *      （本仓库 2026-10-06 已实测，见 `MeloXPlayerUi.registerSystemVolumeSync` 的注释）。
 *      所以播放页唯一的信息源，就剩 `MeloXPlayerUi` 里那条 **150ms 轮询**。
 *   2. 于是按下音量键后，页面最多要等 **150ms** 才知道音量变了 —— 条"顿"一下才起步。
 *      单次按键时这就是肉眼可见的卡顿（不是缓动曲线的问题：缓动早已换成速度连续的弹簧）。
 *   3. 音量键的事件是**同步**送到 Activity 的，用它把"该刷新了"推给 UI，
 *      等于把这条延迟从「≤150ms」压到「≈1 帧」。
 *
 * ⚠ 这里**只发信号、不读音量、不管模式**：
 *   - 音量的权威值只能在 UI 侧读（要判 System/Player 模式、要判拖拽中、要用缓存的 maxVolume）；
 *   - 音量键的处理发生在 **system_server 的 `interceptKeyBeforeQueueing`**，
 *     早于事件投递给 App ⇒ Activity 收到 `onKeyDown` 时系统的音量**已经调完**。
 *     所以 UI 收到信号后直接读 `getStreamVolume` 拿到的就是新值，
 *     不需要任何"乐观预测"（那反而会与系统真实档位打架）。
 *
 * 生命周期：`pressTick` 会一直自增，但只有播放页的音量控件在监听 ⇒ 天然按页面作用域生效。
 */
object MeloXVolumeKeyBridge {

    /** 音量加 = +1；音量减 = -1。 */
    const val DIRECTION_UP: Int = 1
    const val DIRECTION_DOWN: Int = -1

    /**
     * 按键事件序号：**按下与松开都** +1。
     *
     * ⚠ 必须是**序号**而不是布尔"按下标志"：连按/长按会连续触发，
     *   用标志位只有第一次能从 false→true 触发，后续重复按下会被吞掉。
     *   用递增序号当 `LaunchedEffect` 的 key ⇒ 每一拍都能重新唤醒。
     *
     * ⚠ 是 Compose state：UI 侧靠它当作键来重启 effect。
     */
    var eventTick by mutableIntStateOf(0)
        private set

    /** 最近一次按键的方向（[DIRECTION_UP] / [DIRECTION_DOWN]）。UI 用它判断是否"越界按"。 */
    var lastDirection by mutableIntStateOf(0)
        private set

    /**
     * 最近一次事件是不是**松开**（true = 抬起，false = 按下）。
     *
     * ⚠ 松开的信号是"过冲拉长"必须的：iOS 的橡皮筋是**手指抬起就回弹**
     *   （而不是靠超时猜），条才不会在放手后还挂在拉长态。
     *   长按音量键时系统只在最后发一次 up ⇒ 整个长按期间蓄力不被打断，抬手即回。
     */
    var lastWasRelease by mutableStateOf(false)
        private set

    /**
     * 最近一次 `onKeyDown` 的 `KeyEvent.repeatCount`。
     *
     * ⚠⚠ 2026-10-07 用户报障「长按到极限音量时条会**二次拉伸**，iOS 不会」——
     *   长按时 Android 会以 ~50ms 间隔自动重复发`onKeyDown`（`repeatCount` 递增），
     *   而**物理上只有一次手指按下**。旧实现只按"按下"累加 `pull` ⇒ 长按到极限后
     *   每次自动重复都再加一次 ⇒ 蓄力无限累积 ⇒ 条越拉越长（"二次拉伸"）。
     *
     *   iOS 的正确语义：**一次连续手势只对应一次蓄力脉冲**，与该手势内系统重复多少次无关；
     *   新的蓄力必须等到**手指真正抬起后再按下**（`repeatCount == 0`）才成立。
     *   ⇒ UI 侧只在 `repeatCount == 0` 时才认为"这是一次新的按压"。
     */
    var lastRepeatCount by mutableIntStateOf(0)
        private set

    /** 本次 `onKeyDown` 是否是"手指刚按下"（而非长按自动重复）。 */
    val isFreshPress: Boolean get() = lastRepeatCount == 0

    /** 由宿主 Activity 的 `onKeyDown` 调用。 */
    fun onVolumeKeyDown(direction: Int, repeatCount: Int) {
        lastDirection = direction
        lastWasRelease = false
        lastRepeatCount = repeatCount
        eventTick++
    }

    /** 由宿主 Activity 的 `onKeyUp` 调用。 */
    fun onVolumeKeyUp(direction: Int) {
        lastDirection = direction
        lastWasRelease = true
        lastRepeatCount = 0
        eventTick++
    }
}
