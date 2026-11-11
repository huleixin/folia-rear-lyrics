package io.github.huleixin.tingyu.chrome

import org.json.JSONObject

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/StageSettingsHandoff.kt
/** 目标文档与导航代际同时匹配后才交接；加载占位不能撤掉旧舞台。 */
internal class StageSettingsHandoff(val shell:JSONObject, private val onComplete:(()->Unit)?) {
    private var completed=false
    private var drawPosted=false
    fun accepts(page:NativePage, packetNavigation:String):Boolean =
        pageBelongsToRoute(page,"settings",shell.optInt("selectedTab"),shell.optString("pageTarget"),
            packetNavigation,shell.optString("navigation")) && nativePageReady(page)

    fun pageDrawn(page:NativePage, presented:NativePage?, packetNavigation:String, post:(()->Unit)->Unit) {
        // A same-key page from an older composition cannot acknowledge the new frame.
        if(page===presented&&accepts(page,packetNavigation))afterDraw(post)
    }

    /** Called after drawContent, including the opaque native error panel on timeout. */
    fun afterDraw(post:(()->Unit)->Unit) {
        if(completed||drawPosted)return
        drawPosted=true
        post { complete() }
    }

    fun complete() {
        if(completed)return
        completed=true
        onComplete?.invoke()
    }
}

/** Saved preference and the visible surface differ during a temporary stage visit. */
internal fun shellStageVisible(shell:JSONObject)=shell.optBoolean("stageVisible",shell.optString("playerPresentation")!="minimal")

internal fun needsStageSettingsHandoff(route:String,stageVisible:Boolean,next:String,awaitingDraw:Boolean)=
    next=="settings"&&((route=="stage"&&stageVisible)||awaitingDraw)
