package io.github.huleixin.tingyu.chrome

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeFooterLayout.kt
// Footer placement is route state, never a measured pose of an invisible HTML animation.
// `detail` = 集合详情（非歌手）按页面层级判定：隐藏一级导航、迷你条上提；宽屏（≥840dp）保留侧边导航。
internal object NativeFooterLayout {
    fun visible(id:String,route:String,detail:Boolean,width:Float,artist:Boolean=false):Boolean = when {
        route=="collection"&&artist -> false
        else -> when(id){
        "stage"->route=="stage"
        "nav"->route in setOf("home","collection")&&(!detail||width>=840f)
        else->route in setOf("home","collection")
        }
    }
    fun rect(id:String,width:Float,height:Float,top:Float,bottom:Float,detail:Boolean):ChromeRect {
        val wide=width>=840f;val short=wide&&height<=600f
        if(id=="stage"){
            // 舞台播放胶囊：与首页迷你播放器同一条安全边距（手机左右各 10dp），
            // 平板按迷你条宽度收窄并居中。高度 96dp = 14 padding + 46 控制行 + 6 间隙 + 30 进度区。
            val stageWidth=if(wide)minOf(width-148f,600f) else width-20f
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
