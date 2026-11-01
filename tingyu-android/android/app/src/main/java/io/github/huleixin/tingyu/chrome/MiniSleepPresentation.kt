package io.github.huleixin.tingyu.chrome

import org.json.JSONObject
import kotlin.math.max

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/MiniSleepPresentation.kt
/** Presentation only. Never expires or rearms the native timer. */
internal data class MiniSleepSnapshot(val generation:Long=0,val active:Boolean=false,val mode:String="deadline",
    val waiting:Boolean=false,val duration:Long=0,val remaining:Long=0,val sampledAt:Long=0) {
    fun remainingAt(now:Long)=if(active&&!waiting)max(0,remaining-max(0,now-sampledAt))else 0
    fun minutesAt(now:Long)=if(!active||waiting)"" else if(remainingAt(now)==0L)"即将" else "${max(1,remainingAt(now)/60000)}′"
    fun clockAt(now:Long):String {
        val seconds=(remainingAt(now)+999)/1000
        return if(seconds>=3600)"%d:%02d:%02d".format(seconds/3600,seconds/60%60,seconds%60)else"%02d:%02d".format(seconds/60,seconds%60)
    }
    companion object {
        fun from(value:JSONObject,now:Long)=MiniSleepSnapshot(value.optLong("generation"),value.optBoolean("active"),value.optString("mode","deadline"),
            value.optBoolean("waiting"),value.optLong("durationMs"),value.optLong("remainingMs"),now)
    }
}
internal data class MiniPlayerSpacing(val quality:Float,val moon:Float,val play:Float=42f,val queue:Float,val art:Float=34f,val gap:Float=6f) {
    fun textWidth(width:Float)=width-12-quality-moon-play-queue-art-gap
}
internal fun miniPlayerSpacing(width:Float)=if(width<340f)MiniPlayerSpacing(30f,40f,queue=38f)else MiniPlayerSpacing(36f,42f,queue=42f)
internal data class SleepMenuPlacement(val left:Int,val top:Int,val width:Int,val maxHeight:Int,val arrowLeft:Int,val arrowTop:Int)
internal fun sleepMenuPlacement(width:Int,height:Int,top:Int,anchorX:Int,anchorTop:Int,advanced:Boolean,measuredHeight:Int=0,scale:Float=1f):SleepMenuPlacement {
    val inset=(16*scale).toInt();val gap=(14*scale).toInt();val arrow=(8*scale).toInt()
    val w=minOf(width-inset*2,((if(advanced)352 else 320)*scale).toInt()).coerceAtLeast(1)
    val bottom=anchorTop.coerceIn((top+gap).coerceAtMost(height),height)-gap
    val available=(bottom-top-(8*scale).toInt()).coerceAtLeast(1)
    val left=(anchorX-w/2).coerceIn(inset.coerceAtMost(width-w),(width-inset-w).coerceAtLeast(inset.coerceAtMost(width-w)))
    val y=(bottom-measuredHeight).coerceAtLeast(top+(8*scale).toInt())
    return SleepMenuPlacement(left,y,w,available,(anchorX-arrow).coerceIn(left+arrow,left+w-arrow*3),bottom)
}
