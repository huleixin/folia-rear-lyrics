package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativePageFallbackPanel.kt
// 页面接管失败时的原生错误状态。
//
// 背景：Android 正式包里旧 WebView 页面已经不再渲染（唯一 UI = Compose）。这意味着
// 「probe 失败 / 页面包持续被拒 / 首页包从未到达」不会再以旧页面兜底 —— 如果不给
// 可视状态，用户看到的就是一块空白，也没有任何恢复入口。这里提供唯一的失败面：
// 原生绘制、说明当前页面未能接管、并给出重试（走 __refresh 让 JS 重新发布模型）。
//
// 设计约束：
//  · 不复用任何旧 React WebView UI，避免"接管失败时旧页面复活"；
//  · 不用红屏/异常弹窗 —— 这是可恢复的瞬时状态，语气克制；
//  · 只覆盖页面区域，不接管 chrome（迷你条/底栏仍由宿主绘制）。
@Composable
internal fun NativePageFallbackPanel(
    route: String,
    light: Boolean,
    modifier: Modifier = Modifier,
    onRetry: () -> Unit,
) {
    val palette=LocalInterfacePalette.current
    val background = Brush.verticalGradient(palette.fallbackBackgrounds)
    val ink = palette.fallbackInk
    val muted = palette.fallbackMuted
    val accent = palette.fallbackAccent
    val title = when (route) {
        "home" -> "首页没有完成加载"
        "collection" -> "这个歌单没有完成加载"
        "search" -> "搜索页没有完成加载"
        "settings" -> "设置页没有完成加载"
        else -> "页面没有完成加载"
    }
    Box(modifier.background(background)) {
        Column(
            modifier = Modifier.align(Alignment.Center).padding(horizontal = 36.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(title, color = ink, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
            Text(
                "原生页面暂时没有接管成功。可以重试一次；如果反复出现，请在设置里反馈当前页面名称。",
                color = muted, fontSize = 13.sp, lineHeight = 19.sp,
            )
            Box(
                Modifier
                    .height(42.dp)
                    .background(accent.copy(alpha = 0.16f), RoundedCornerShape(21.dp))
                    .chromeClickable(corner=21.dp) { onRetry() }
                    .padding(horizontal = 26.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text("重试", color = accent, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}
