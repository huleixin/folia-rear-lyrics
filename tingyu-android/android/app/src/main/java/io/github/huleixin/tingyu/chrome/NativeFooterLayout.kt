package io.github.huleixin.tingyu.chrome

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeFooterLayout.kt
// Footer placement is route state, never a measured pose of an invisible HTML animation.
internal object NativeFooterLayout {
    fun visible(id:String,route:String,playlist:Boolean,width:Float):Boolean = when(id){
        "stage"->route=="stage"
        "nav"->route in setOf("home","collection")&&(!playlist||width>=840f)
        else->route in setOf("home","collection")
    }
    fun rect(id:String,width:Float,height:Float,top:Float,bottom:Float,playlist:Boolean):ChromeRect {
        val wide=width>=840f;val short=wide&&height<=600f
        if(id=="stage"){
            val stageWidth=minOf(width-32f,if(wide)600f else width-32f)
            val stageHeight=136f
            return ChromeRect((width-stageWidth)/2,height-stageHeight-bottom-10f,stageWidth,stageHeight,1f)
        }
        return if(id=="nav"){
            if(wide)ChromeRect(if(short)8f else 12f,16f+top,80f,height-32f-top,1f)
            else ChromeRect(10f,height-62f-bottom,width-20f,54f,1f)
        }else if(wide)ChromeRect(if(short)108f else 116f,height-(if(short)72f else 76f),width-(if(short)128f else 148f),if(short)64f else 62f,1f)
        else ChromeRect(10f,height-(if(playlist)54f else 114f)-bottom,width-20f,46f,1f)
    }
}
