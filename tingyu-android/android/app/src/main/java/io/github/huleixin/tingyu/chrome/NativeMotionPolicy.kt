package io.github.huleixin.tingyu.chrome

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeMotionPolicy.kt
// Tab replacement has no spatial direction. Only navigation depth moves a page.
internal enum class NativeMotionKind { NONE, TAB, PUSH, POP, STAGE }
internal object NativeMotionPolicy {
    // Spring 参数收编到 TingYuMotion（UI 统一工程）：这里保留原名做别名，调用点不变。
    val Stiffness=TingYuMotion.SpringStiffness
    val Damping=TingYuMotion.SpringDamping // Critically damped: nonlinear deceleration without overshoot.
    private fun root(key:String)=key in setOf("home","library","search","settings:index")||key.startsWith("home:")||key.startsWith("library:")||key.startsWith("search:")
    /**
     * 页面身份：`home:qq:2473297053:false` → `home:qq`。
     *
     * 首页/资料库的 page key 里带着「来源 + 歌单 id」，而歌单是在首帧之后才解析出来的：
     * 同一个首页会先后发 `home:qq::false` 和 `home:qq:2473297053:false` 两包。这两包
     * **不是一次导航**，只是同一页面的身份补全 —— 如果按 route 粗判就会当成 tab 切换，
     * 在冷启动 1.2s 处给首页放一次 8dp 横移 + 200ms 淡入，玻璃底栏采到的是两帧叠影，
     * 真机上就是「打开首页底部闪一下」（2026-11-07 23:02 报告：page-commit 两次，
     * key 只差一个 playlistId）。
     */
    private fun contentId(key:String)=if(key.startsWith("home:")||key.startsWith("library:"))
        key.split(':').take(2).joinToString(":") else key
    fun kind(from:String,to:String,back:Boolean,reduced:Boolean):NativeMotionKind=when {
        reduced||from.isEmpty()||from==to->NativeMotionKind.NONE
        // 同一页面的数据身份补全：不播转场，也不能把上一份内容淡出（那正是叠影）。
        contentId(from)==contentId(to)->NativeMotionKind.NONE
        root(from)&&root(to)->NativeMotionKind.TAB
        // Stage owns its full-window transition, including playlist/detail return paths.
        // A route key's depth must never add a second horizontal page movement to it.
        from=="stage"||to=="stage"->NativeMotionKind.STAGE
        back->NativeMotionKind.POP
        else->NativeMotionKind.PUSH
    }

    /**
     * 页面实例的归属路由（2026-11-07 23:29 录屏专项）。
     *
     * home/library/search 的 key 里带着**会变化的数据身份**（音源、歌单 id）：同一个首页
     * 在冷启动 360ms 内先后发 `home:qq::false` → `home:qq:2473297053:false` 两份模型。
     * 如果页面实例按模型 key 建，就会同时存在两份首页 —— 新一份哪一帧少画一块（异步封面、
     * 区块重组），旧一份（歌单还是空态文案的那份）就从底下露出来，用户看到的就是底部闪一下。
     *
     * 所以页面实例按**路由**归并：同一路由的模型更新走原地重组，永不产生第二份页面；
     * 真正的路由切换（首页↔资料库、设置索引↔子页、歌单 A↔B）key 不同，转场原样保留。
     */
    fun pageRouteKey(key:String):String=when {
        key.startsWith("home:")||key.startsWith("library:")||key.startsWith("search:")->
            key.split(':').first()
        else->key
    }
}
