package io.github.huleixin.tingyu.minimal.ui

import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import kotlin.math.roundToInt

// MinimalMoreMenuPosition.kt: position in the player's own pixel space, bounded by current window safety.
internal fun minimalMoreMenuPosition(anchor:Rect,panel:IntSize,viewport:IntSize,top:Int,bottom:Int,margin:Int,gap:Int):IntOffset{
    val left=margin.coerceAtMost((viewport.width-panel.width).coerceAtLeast(0))
    val right=(viewport.width-margin-panel.width).coerceAtLeast(left)
    val minY=(top+margin).coerceAtMost((viewport.height-bottom-panel.height).coerceAtLeast(0))
    val maxY=(viewport.height-bottom-margin-panel.height).coerceAtLeast(minY)
    val above=anchor.top.roundToInt()-gap-panel.height
    val y=if(above>=minY)above else anchor.bottom.roundToInt()+gap
    return IntOffset((anchor.right.roundToInt()-panel.width).coerceIn(left,right),y.coerceIn(minY,maxY))
}
