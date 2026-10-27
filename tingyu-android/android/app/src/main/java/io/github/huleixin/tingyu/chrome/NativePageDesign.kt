package io.github.huleixin.tingyu.chrome

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativePageDesign.kt
// Pinned to the pre-migration mobileRecommendations/mobileLibraryPage/mobileSettings CSS.
internal object NativePageDesign {
    const val HomeInset=22f
    const val DirectoryRow=68
    const val DirectoryArt=56
    const val LibraryFilter=40
    const val SearchField=46
    const val SettingsRowTitle=13
    const val SettingsGroupTitle=13
    fun heroWidth(viewport:Float,wide:Boolean,short:Boolean)=
        if(short)440f else (viewport*if(wide).46f else .73f).coerceAtMost(440f)
    fun heroHeight(width:Float,short:Boolean)=if(short)240f else width*6f/7f
    fun recentWidth(viewport:Float,wide:Boolean)=if(wide)150f else (viewport-HomeInset*2)*.29f
}
