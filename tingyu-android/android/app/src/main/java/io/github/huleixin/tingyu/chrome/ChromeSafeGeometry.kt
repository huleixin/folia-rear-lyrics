package io.github.huleixin.tingyu.chrome

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/ChromeSafeGeometry.kt
// A delayed CSS inset must not move native controls down into the gesture bar.
internal fun chromeSafeTop(top:Float,nativeBottom:Float,cssBottom:Float):Float = top-(nativeBottom-cssBottom).coerceAtLeast(0f)
