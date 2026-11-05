package io.github.huleixin.tingyu.chrome

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/MinimalPlayerExitPolicy.kt
//
// 极简播放页离开 stage 时由谁负责"收场"。
//
// 背景（1.3.148 真机录屏 1.08~1.40s）：从播放页点歌手名进入歌手页时，整页播放器的封面、
// 文字、按钮被叠成 3~4 层半透明，每帧多一层，直到歌手页完全盖住才消失。
//
// 原因是同一屏上同时存在两份播放页：Compose 这一份在淡出（fadeOut 200ms + slideOut 300ms），
// 而 WebView 那一份还没换掉 —— 路由一离开 stage，桥帧立刻被拒，JS 的极简页所有权一松手，
// 它自己那份播放页就又挂回 DOM。播放页一旦开始变透明，下面那份就从缝隙里透出来；配合
// WebView 的硬件层残留，看起来就是一层一层叠上去的。
//
// 结论：播放页**不应该在还有另一份自己的时候做任何"变透明/让开"的退场**。集合页
// （歌手 / 专辑）是整块不透明的原生页面，它从右侧压上来本来就会把播放页盖死 ——
// 让播放页保持不透明、停在原地、退到新页面下面，等盖住了再一次摘掉，就既没有透出、
// 也没有突兀的黑白闪。
//
// 这里把"什么时候举着、怎么退场"抽成纯函数，方便单测钉住，不必上真机也能验决策。
internal object MinimalPlayerExitPolicy {

    /** 播放页自己的退场方式。 */
    enum class Exit {
        /** 不做动画：立刻从组合里摘掉（此刻它已经被不透明的页面盖住）。 */
        NONE,

        /** 原来的下滑 + 淡出。只留给"底下露出来就是目标页"的路由。 */
        SLIDE_AND_FADE,
    }

    /**
     * 离开 stage 去 [to] 时，播放页是否应该"原地保持、等新页面盖住"。
     *
     * 只对集合页成立：它是原生绘制的不透明整页，能真的盖住；home/search 底下是 WebView
     * 自己画的目标页，露出它正是要的效果，不需要举着。
     */
    fun holdForCover(
        from: String,
        to: String,
        presentation: String,
        minimalEnabled: Boolean,
    ): Boolean = minimalEnabled && presentation == "minimal" && from == "stage" && to == "collection"

    /**
     * 播放页收场方式。
     *
     * @param destination 当前路由
     * @param covered 目标页是否已经进了组合（`presented != null`）。没盖住就还得退场，
     *                否则会露出下面还没换掉的内容 —— 那正是原来的问题。
     */
    fun exit(destination: String, covered: Boolean): Exit = when {
        // 设置页：原生页早就 presented，直接摘，不留动画（原有行为）。
        destination == "settings" -> Exit.NONE
        // 集合页且已经被盖住：不再演一遍退场，直接在页面底下消失。
        destination == "collection" && covered -> Exit.NONE
        // 其余路由（home / search / 兜底）：底下就是目标页，正常下滑淡出。
        else -> Exit.SLIDE_AND_FADE
    }

    /** 举着播放页的上限：页面迟迟不来时不能一直把它当遮罩。 */
    const val HOLD_TIMEOUT_MS = 1_200L

    /** 目标页进组合后，等它压上来（PUSH 240ms）再摘播放页。 */
    const val COVER_SETTLE_MS = 280L
}
