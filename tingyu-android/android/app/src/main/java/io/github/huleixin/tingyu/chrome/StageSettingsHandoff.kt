package io.github.huleixin.tingyu.chrome

import org.json.JSONObject

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/StageSettingsHandoff.kt
/** 目标文档与导航代际同时匹配后才交接；加载占位不能撤掉旧舞台。 */
internal class StageSettingsHandoff(val shell:JSONObject, val complete:(()->Unit)?) {
    fun accepts(page:NativePage, packetNavigation:String):Boolean =
        pageBelongsToRoute(page,"settings",shell.optInt("selectedTab"),shell.optString("pageTarget"),
            packetNavigation,shell.optString("navigation")) && nativePageReady(page)
}
