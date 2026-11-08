package io.github.huleixin.tingyu.chrome

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/ChromeSafeGeometry.kt
// A delayed CSS inset must not move native controls down into the gesture bar.
internal fun chromeSafeTop(top:Float,nativeBottom:Float,cssBottom:Float):Float = top-(nativeBottom-cssBottom).coerceAtLeast(0f)

/**
 * 底部两栏（nav / mini）的最终矩形：**唯一**的定位入口，且只在 dp 空间里算一次
 * （2026-11-07 首页底部闪烁专项）。
 *
 * 以前 seed 走 dp 偏移、live 走 `NativeFooterLayout.rect(CSS px) × scale`。JS 的
 * `innerWidth` 是整数（375），而真实 dp 宽度是 375.38，于是 `scale = web.width/viewport`
 * 比 density 大 0.1%：交接那一刻整条底栏会**整体上移 0.8dp**（23:02 报告实测
 * `footer-seed-frame top=735.23` → `footer-live-frame top=734.41`）。
 *
 * 现在两路都从 dp 出发，除了 density 不再有第二个比例，seed 与 live 的矩形**逐位相同**。
 *  · `widthDp/heightDp`        Compose 根尺寸（dp）
 *  · `safeTopDp/safeBottomDp`  系统栏安全区（dp，来自 MainSystemBars 的权威 inset）
 *  · `keyboardPx`              键盘补偿（px，只有 nav/mini 吃，按 density 折回 dp）
 *  · `detail`                  集合详情（非歌手）下迷你条紧贴导航栏
 */
internal fun chromeFooterRect(
    id:String,
    widthDp:Float,
    heightDp:Float,
    safeTopDp:Float,
    safeBottomDp:Float,
    density:Float,
    keyboardPx:Float=0f,
    detail:Boolean=false,
):ChromeRect {
    val boostDp=if(id=="nav"||id=="mini")keyboardPx/density else 0f
    return NativeFooterLayout.rect(id,widthDp,heightDp+boostDp,safeTopDp,safeBottomDp,detail)
}
