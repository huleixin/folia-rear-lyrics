package io.github.huleixin.tingyu.chrome

import org.json.JSONObject

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/StageSubtitleLayout.kt
internal const val STAGE_CONTROLS_MOTION_MS=240
/** 从实际原生播放条的上沿算净空；收起后只留系统安全区和 4dp 间距。 */
internal fun stageSubtitleLayout(width:Float,height:Float,safeBottom:Float,rect:ChromeRect,shown:Boolean,reduced:Boolean)=
    JSONObject().put("width",width).put("height",height).put("safeBottom",safeBottom)
        .put("shown",shown).put("shownBottom",height-rect.top+4f).put("hiddenBottom",safeBottom+4f)
        .put("durationMs",if(reduced)0 else STAGE_CONTROLS_MOTION_MS)
