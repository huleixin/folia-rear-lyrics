package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import android.graphics.drawable.BitmapDrawable
import androidx.compose.foundation.Canvas
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.runtime.remember
import io.github.huleixin.tingyu.glass.GlassNavIcons
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kyant.backdrop.Backdrop

// The tablet rail is separate from the unchanged phone liquid-tab animation.
@Composable internal fun PadNavigation(s:ChromeSurface,backdrop:Backdrop,modifier:Modifier,action:(String,Double)->Unit){
    val palette=LocalInterfacePalette.current
    Column(modifier.chromeGlass(backdrop,s.light,24.dp,ChromeGlassPresets.active(),ChromeGlassPresets.NavFill).padding(horizontal=6.dp,vertical=22.dp),horizontalAlignment=Alignment.CenterHorizontally){
        Text("听屿",color=palette.ink,fontSize=22.sp,fontWeight=FontWeight.Bold)
        Text("TINGYU",color=palette.muted,fontSize=9.sp,letterSpacing=2.sp)
        Spacer(Modifier.height(36.dp))
        listOf("推荐","资料库","搜索","设置").forEachIndexed{index,title->
            Column(Modifier.fillMaxWidth().height(70.dp).clip(RoundedCornerShape(18.dp))
                .background(if(s.selected==index)palette.accent.copy(alpha=.16f)else androidx.compose.ui.graphics.Color.Transparent)
                .semantics{selected=s.selected==index}.chromeClickable(enabled=!s.disabled,role=Role.Tab,corner=18.dp){action("navigate",index.toDouble())},
                horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.Center){
                val context=LocalContext.current
                val px=with(LocalDensity.current){24.dp.roundToPx()}
                val bitmap=remember(index,s.light,s.selected==index,px){
                    (GlassNavIcons.load(context,listOf("recommend","library","search","settings")[index],s.selected==index,s.light,px) as BitmapDrawable).bitmap.asImageBitmap()
                }
                Canvas(Modifier.size(24.dp)){drawImage(bitmap)}
                Text(title,color=palette.ink,fontSize=12.sp,modifier=Modifier.padding(top=5.dp))
            }
            Spacer(Modifier.height(12.dp))
        }
    }
}
