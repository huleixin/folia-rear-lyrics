package io.github.huleixin.tingyu.chrome

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeFooterLayout.kt
// Footer placement is route state, never a measured pose of an invisible HTML animation.
// `detail` = 集合详情（非歌手）按页面层级判定：隐藏一级导航、迷你条上提；宽屏（≥840dp）保留侧边导航。
//
// 2026-11-09 一级页面底部行为统一（场景见 听屿1.3.188-底部导航与迷你条统一.md）：
//   推荐 / 资料库 / 搜索 → 导航 + 迷你条都在
//   设置主页            → 只有导航（迷你条退场，但播放不中断）
//   歌单详情（非歌手）   → 只有迷你条
//   设置二/三级、舞台     → 都不显示
// 这里只回答「这个路由**允许**画哪一条」。设置页用原生已提交的 pageTarget 判断层级，
// 避免 JS 清理/effect 时序漏掉二级页，或在返回时多发一帧底栏。
internal object NativeFooterLayout {
    const val SettingsDepthExitMs = 220
    const val SettingsDepthOffsetDp = 14f

    fun settingsRoot(route:String,pageTarget:String,requested:Boolean=true):Boolean = requested&&route=="settings"&&pageTarget=="settings:index"

    fun visible(id:String,route:String,detail:Boolean,width:Float,artist:Boolean=false,settingsRoot:Boolean=true):Boolean = when {
        route=="collection"&&artist -> false
        else -> when(id){
        "stage"->route=="stage"
        "nav"->when(route){
            "home"->true
            "collection"->!detail||width>=840f
            "search"->true
            "settings"->settingsRoot
            else->false
        }
        // 设置页不显示迷你条；歌单详情反而保留它。
        else->route in setOf("home","collection","search")
    }
    }
    fun rect(id:String,width:Float,height:Float,top:Float,bottom:Float,detail:Boolean):ChromeRect {
        val wide=width>=840f;val short=wide&&height<=600f
        if(id=="stage"){
            // 舞台播放胶囊：与首页迷你播放器同一条安全边距（手机左右各 10dp），
            // 平板按迷你条宽度收窄并居中。高度 96dp = 14 padding + 46 控制行 + 6 间隙 + 30 进度区。
            // 横屏手机也限宽居中，让五个播放按钮仍在单手可触及的范围内。
            val stageWidth=when {
                width>height -> minOf(width-20f,430f)
                wide -> minOf(width-148f,600f)
                else -> width-20f
            }
            val stageHeight=96f
            return ChromeRect((width-stageWidth)/2,height-stageHeight-bottom-10f,stageWidth,stageHeight,1f)
        }
        return if(id=="nav"){
            if(wide)ChromeRect(if(short)8f else 12f,16f+top,80f,height-32f-top,1f)
            else ChromeRect(10f,height-62f-bottom,width-20f,54f,1f)
        }else if(wide)ChromeRect(if(short)108f else 116f,height-(if(short)72f else 76f),width-(if(short)128f else 148f),if(short)64f else 62f,1f)
        else ChromeRect(10f,height-(if(detail)54f else 114f)-bottom,width-20f,46f,1f)
    }
}
