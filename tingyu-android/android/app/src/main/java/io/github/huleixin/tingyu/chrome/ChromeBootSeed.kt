package io.github.huleixin.tingyu.chrome

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/ChromeBootSeed.kt
// 冷启动缓存底栏的存活条件（录屏 68723 / 68720）。
//
// 背景：首帧画的是 NativeShellCache 里上一会话的缓存页，底部两栏也用缓存 seed 补齐，
// 否则「页面已显示、底栏缺席」会空 0.3~0.5s（真机实测 0.45s）。
//
// 旧判定 `!surfaces.containsKey(id)` 有两个问题：
//  1. 启动期 JS 的第一次 measure 会因为底栏 DOM 还没量出可见性而先发一个
//     enabled=false 的探测包 —— 只要包到了，surfaces 就有了这个 id，seed 立刻被取消，
//     底栏一路空到第一个 enabled 包（真机 1.3s 才到）。
//  2. seed 的 placement 没有 zIndex，被 zIndex=1 的页面容器盖住，实际从未显示过。
//
// seed 的职责只是覆盖「缓存页已出、live 底栏还没到」这段启动窗口，所以存活条件应为
// 「该 surface 从未收到过 enabled 包」，而不是「从未收到过包」。
internal object ChromeBootSeed {
    fun shouldSeed(id:String,destination:String,firstHomeFrame:Boolean,webOverlay:Boolean,live:Map<String,Boolean>)=
        destination=="home"&&firstHomeFrame&&!webOverlay&&live[id]!=true
}
