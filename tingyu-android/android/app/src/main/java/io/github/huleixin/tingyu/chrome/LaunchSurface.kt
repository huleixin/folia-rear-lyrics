package io.github.huleixin.tingyu.chrome

import androidx.compose.ui.graphics.toArgb

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/LaunchSurface.kt
// 启动窗口底色必须等于原生首页首帧的渐变首色，否则「窗口已起、内容未绘」的那 0.3~0.5s
// 会显示一块与页面不同色的空窗 —— 深色模式下就是录屏 68723 里那块「纯黑色圆角窗口」。
//
// 颜色取自 NativePageView 的首页渐变（深色 #102D25 → #010D0C，浅色 #E3EDE2 → #F4F5EE）。
// 窗口是纯色，因此取首色：窗口消失的那一帧换成页面渐变，上半屏完全同色、下半屏自然变深。
// res/values-night/interface_appearance.xml 的 interfaceLaunchBackground 必须与之相同
// （那就是同一个窗口在启动主题阶段用的颜色）。
internal object LaunchSurface {
    val Dark get()=InterfacePalette(false).launch.toArgb()
    val Light get()=InterfacePalette(true).launch.toArgb()
    @JvmOverloads fun color(light:Boolean,style:String="classic")=InterfacePalette(light,style).launch.toArgb()
}
