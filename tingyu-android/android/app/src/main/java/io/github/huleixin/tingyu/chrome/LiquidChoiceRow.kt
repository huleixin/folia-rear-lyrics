package io.github.huleixin.tingyu.chrome

import androidx.compose.animation.core.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.*
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.*

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/LiquidChoiceRow.kt
/** One moving selection surface for equal-width choices, with stable hit targets. */
@Composable internal fun LiquidChoiceRow(labels: List<String>, selected: Int, theme: TyPanelTheme, onPick: (Int)->Unit) {
    val reduced = LocalLiquidReduced.current
    val position = animateFloatAsState(selected.toFloat(), if(reduced)snap() else spring(dampingRatio=1f,stiffness=520f),label="choice-position")
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(theme.card).padding(3.dp).drawBehind {
        if(labels.isNotEmpty()) {
            val width=size.width/labels.size;val origin=Offset(position.value*width,0f)
            drawRoundRect(theme.accent.copy(alpha=.16f),origin,Size(width,size.height),CornerRadius(10.dp.toPx()))
            drawRoundRect(theme.accent.copy(alpha=.45f),origin,Size(width,size.height),CornerRadius(10.dp.toPx()),style=Stroke(1.dp.toPx()))
        }
    }) {
        labels.forEachIndexed { index,label ->
            Box(Modifier.weight(1f).chromeClickable(corner=10.dp){onPick(index)}.padding(vertical=9.dp),contentAlignment=Alignment.Center) {
                Text(label,color=if(index==selected)theme.accent else theme.muted,fontSize=13.sp,fontWeight=FontWeight.Medium)
            }
        }
    }
}
