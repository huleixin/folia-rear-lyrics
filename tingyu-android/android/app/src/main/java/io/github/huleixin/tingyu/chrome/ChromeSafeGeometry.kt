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

/**
 * 键盘补偿高度的唯一解算入口（2026-11-09 真机 68869）。
 *
 * 背景：`MainSystemBars` 给 `android.R.id.content` 加了键盘高度的 padding，并把 ime inset
 * consume 成 0 —— Compose 侧 `WindowInsets.ime` 恒为 0。旧逻辑于是只剩「窗口是否贴屏幕底边」
 * 一条路，而窗口被 padding 压矮后这条也不成立，补偿恒为 0：底栏跟着变矮的根贴到键盘上方。
 *
 * 现在的优先级：
 *  1. `nativeImeDp >= 0`：窗口监听下发的真实键盘高度（权威，0 就代表没键盘）。
 *  2. 退回 Compose 的 ime inset（监听缺席时的旧路径）。
 *  3. 退回「窗口贴屏幕底边」的整屏差（分屏/小窗下故意不生效）。
 */
internal fun chromeKeyboardPx(
    nativeImeDp:Float,
    imeInsetPx:Int,
    pinnedToScreenBottom:Boolean,
    screenPx:Float,
    rootPx:Float,
    density:Float,
):Float = when {
    nativeImeDp >= 0f -> nativeImeDp * density
    imeInsetPx > 0 -> imeInsetPx.toFloat()
    pinnedToScreenBottom -> (screenPx - rootPx).coerceAtLeast(0f)
    else -> 0f
}
