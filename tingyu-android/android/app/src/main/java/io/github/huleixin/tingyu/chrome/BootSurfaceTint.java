package io.github.huleixin.tingyu.chrome;

import android.app.Activity;
import android.graphics.Color;
import android.view.View;

/**
 * 启动/重建时「Compose 首帧之前」那块窗口区域的底色（录屏 68736）。
 *
 * 背景：MainSystemBars.apply() 把 decor 背景设成 TRANSPARENT（为的是舞台淡出、页面渐变
 * 不被一层固定色带污染）。但窗口本身是不透明的，decor 透明就等于什么都没画，
 * 合成器会把这块区域清成黑色 —— 于是冷启动从「窗口出现」到「Compose 首帧」之间
 * 就是一块纯黑卡片，跟窗口背景设成什么颜色无关（这正是上一轮改窗口底色没效果的原因）。
 *
 * 做法（事件驱动，不是定时器）：
 *  - Activity onCreate 时 arm()：decor 用页面底色（LaunchSurface = 原生首页渐变首色）；
 *  - Compose 第一帧画出来后 settle()：立刻交还透明，恢复「不污染舞台/渐变」的既有行为。
 * 每次 Activity 重建都会重新 arm，暖恢复不会重新上色（pending 已经是 false）。
 */
public final class BootSurfaceTint {
    private static volatile boolean pending;

    private BootSurfaceTint() {}

    /** 进入一次新的启动/重建周期：首帧之前允许用页面底色填窗口。 */
    public static void arm() {
        pending = true;
    }

    /** decor 背景：首帧前上页面底色，首帧后透明。 */
    public static void applyDecor(Activity activity, View decor) {
        if (decor == null) return;
        decor.setBackgroundColor(pending && activity != null
            ? LaunchSurface.INSTANCE.color(InterfaceAppearance.light(activity),InterfaceAppearance.style(activity))
            : Color.TRANSPARENT);
    }

    /** Compose 首帧已画出来：交还透明，并把 decor 立刻刷回透明（避免残留一层色带）。 */
    public static void settle(Activity activity) {
        pending = false;
        if (activity != null && activity.getWindow() != null) {
            applyDecor(activity, activity.getWindow().getDecorView());
        }
    }
}
