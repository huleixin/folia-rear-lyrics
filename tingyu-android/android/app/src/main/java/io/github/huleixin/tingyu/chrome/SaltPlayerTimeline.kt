package io.github.huleixin.tingyu.chrome

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/SaltPlayerTimeline.kt
// Measured from video(13).mp4: 305x664 analysis viewport, opening #2 and closing #1.
// Tail shell bounds converge to the measured mini bounds where material crossfade obscures edges.
// Channels: ms, shell top/left/right/bottom, cover center X/Y and side. Values are endpoint-relative.
internal object SaltPlayerTimeline {
    const val EnterMs = 980
    const val ExitMs = 500
    private val opening = arrayOf(
        floatArrayOf(0.000000f, 0.000000f, 0.000000f, 0.000000f, 0.000000f, 0.000000f, 0.000000f, 0.000000f),
        floatArrayOf(34.000000f, 0.158940f, 0.153846f, 0.153846f, 0.095238f, 0.383260f, 0.097046f, 0.275109f),
        floatArrayOf(67.000000f, 0.389073f, 0.384615f, 0.384615f, 0.333333f, 0.762115f, 0.268636f, 0.615721f),
        floatArrayOf(100.000000f, 0.584437f, 0.615385f, 0.615385f, 0.571429f, 0.920705f, 0.448664f, 0.825328f),
        floatArrayOf(133.000000f, 0.728477f, 0.769231f, 0.769231f, 0.714286f, 0.977974f, 0.607595f, 0.925764f),
        floatArrayOf(167.000000f, 0.822848f, 0.846154f, 0.846154f, 0.809524f, 0.991189f, 0.732771f, 0.965066f),
        floatArrayOf(200.000000f, 0.885762f, 0.923077f, 0.923077f, 0.857143f, 0.995595f, 0.818565f, 0.986900f),
        floatArrayOf(233.000000f, 0.925497f, 0.923077f, 0.923077f, 0.904762f, 0.995595f, 0.880450f, 0.995633f),
        floatArrayOf(268.000000f, 0.947020f, 0.923077f, 1.000000f, 0.952381f, 0.995595f, 0.914205f, 0.995633f),
        floatArrayOf(301.000000f, 0.966887f, 1.000000f, 1.000000f, 0.952381f, 1.000000f, 0.943741f, 1.000000f),
        floatArrayOf(333.000000f, 0.978477f, 1.000000f, 1.000000f, 0.952381f, 1.000000f, 0.963432f, 1.000000f),
        floatArrayOf(367.000000f, 0.986755f, 1.000000f, 1.000000f, 1.000000f, 1.000000f, 0.977496f, 1.000000f),
        floatArrayOf(401.000000f, 0.991722f, 1.000000f, 1.000000f, 1.000000f, 1.000000f, 0.985935f, 1.000000f),
        floatArrayOf(434.000000f, 0.995033f, 1.000000f, 1.000000f, 1.000000f, 1.000000f, 0.991561f, 1.000000f),
        floatArrayOf(467.000000f, 0.995033f, 1.000000f, 1.000000f, 1.000000f, 1.000000f, 0.994374f, 1.000000f),
        floatArrayOf(499.000000f, 0.996689f, 1.000000f, 1.000000f, 1.000000f, 1.000000f, 0.997187f, 1.000000f),
        floatArrayOf(533.000000f, 0.998344f, 1.000000f, 1.000000f, 1.000000f, 1.000000f, 0.997187f, 1.000000f),
        floatArrayOf(566.000000f, 1.000000f, 1.000000f, 1.000000f, 1.000000f, 1.000000f, 1.000000f, 1.000000f),
        floatArrayOf(600.000000f, 1.000000f, 1.000000f, 1.000000f, 1.000000f, 1.000000f, 1.000000f, 1.000000f),
        floatArrayOf(980.000000f, 1.000000f, 1.000000f, 1.000000f, 1.000000f, 1.000000f, 1.000000f, 1.000000f)
    )
    private val closing = arrayOf(
        floatArrayOf(0.000000f, 1.000000f, 1.000000f, 1.000000f, 1.000000f, 1.000000f, 1.000000f, 1.000000f),
        floatArrayOf(24.000000f, 0.956954f, 1.000000f, 1.000000f, 0.952381f, 0.995595f, 0.928270f, 0.995633f),
        floatArrayOf(57.000000f, 0.741722f, 0.769231f, 0.769231f, 0.714286f, 0.977974f, 0.624473f, 0.934498f),
        floatArrayOf(90.000000f, 0.516556f, 0.538462f, 0.538462f, 0.476190f, 0.881057f, 0.382560f, 0.759825f),
        floatArrayOf(123.000000f, 0.350993f, 0.384615f, 0.384615f, 0.285714f, 0.713656f, 0.239100f, 0.567686f),
        floatArrayOf(155.000000f, 0.235099f, 0.230769f, 0.230769f, 0.190476f, 0.533040f, 0.150492f, 0.397380f),
        floatArrayOf(188.000000f, 0.157285f, 0.153846f, 0.153846f, 0.095238f, 0.378855f, 0.095640f, 0.270742f),
        floatArrayOf(221.000000f, 0.105960f, 0.076923f, 0.076923f, 0.047619f, 0.255507f, 0.059072f, 0.183406f),
        floatArrayOf(255.000000f, 0.072848f, 0.072848f, 0.072848f, 0.072848f, 0.171806f, 0.037975f, 0.117904f),
        floatArrayOf(288.000000f, 0.043046f, 0.043046f, 0.043046f, 0.043046f, 0.114537f, 0.025316f, 0.078603f),
        floatArrayOf(321.000000f, 0.023179f, 0.023179f, 0.023179f, 0.023179f, 0.074890f, 0.015471f, 0.048035f),
        floatArrayOf(354.000000f, 0.011589f, 0.011589f, 0.011589f, 0.011589f, 0.048458f, 0.009845f, 0.030568f),
        floatArrayOf(386.000000f, 0.006623f, 0.006623f, 0.006623f, 0.006623f, 0.030837f, 0.007032f, 0.021834f),
        floatArrayOf(420.000000f, 0.003311f, 0.003311f, 0.003311f, 0.003311f, 0.022026f, 0.004219f, 0.013100f),
        floatArrayOf(500.000000f, 0.000000f, 0.000000f, 0.000000f, 0.000000f, 0.000000f, 0.000000f, 0.000000f)
    )
    /** Monotone Hermite interpolation keeps recorded frames exact while supporting 60/90/120 Hz. */
    fun sample(ms: Float, exit: Boolean = false): FloatArray {
        val rows = if(exit)closing else opening
        if(ms <= 0f)return rows.first().copyOfRange(1,8)
        if(ms >= rows.last()[0])return rows.last().copyOfRange(1,8)
        val index=(0 until rows.lastIndex).first { ms <= rows[it+1][0] }
        val left=rows[index];val right=rows[index+1];val duration=right[0]-left[0]
        val u=(ms-left[0])/duration
        fun slope(at: Int, channel: Int): Float {
            if(at==0 || at==rows.lastIndex)return 0f
            val a=rows[at];val before=rows[at-1];val after=rows[at+1]
            val h0=a[0]-before[0];val h1=after[0]-a[0]
            val d0=(a[channel]-before[channel])/h0;val d1=(after[channel]-a[channel])/h1
            if(d0*d1<=0f)return 0f
            val w0=2f*h1+h0;val w1=h1+2f*h0
            return (w0+w1)/(w0/d0+w1/d1)
        }
        return FloatArray(7) { c ->
            val channel=c+1;val a=left[channel];val b=right[channel]
            val value=(2*u*u*u-3*u*u+1)*a+(u*u*u-2*u*u+u)*duration*slope(index,channel)+
                (-2*u*u*u+3*u*u)*b+(u*u*u-u*u)*duration*slope(index+1,channel)
            value.coerceIn(minOf(a,b),maxOf(a,b))
        }
    }
}
