package io.github.huleixin.tingyu.chrome

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import io.github.huleixin.tingyu.minimal.MinimalPlayerCommands
import io.github.huleixin.tingyu.minimal.MinimalQueue
import io.github.huleixin.tingyu.minimal.MinimalPlayerRuntime
import io.github.huleixin.tingyu.minimal.ui.MinimalPlayerScreen

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/MinimalPlayerPage.kt
//
// 极简播放页的宿主壳：只在这里订阅运行时，场景（WebView、导航、其他页面）不跟着每秒的状态帧重组。
//
// 页面本体在 `minimal/ui`：第一阶段留下的"数据验证面"已经被真正的封面页 / 歌词页取代。

@Composable
fun MinimalPlayerSurface(
    runtime: MinimalPlayerRuntime,
    commands: MinimalPlayerCommands,
    /** 队列投影由宿主收集后传进来：抽屉归宿主，页面只负责画按钮。 */
    queue: MinimalQueue,
    onOpenQueue: () -> Unit,
    light: Boolean,
    safeTop: Float,
    safeBottom: Float,
    onCollapse: () -> Unit,
    onOpenStage: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val state by runtime.state.collectAsState()
    val artwork by runtime.artwork.collectAsState()
    MinimalPlayerScreen(
        state = state,
        artwork = artwork,
        commands = commands,
        queue = queue,
        onOpenQueue = onOpenQueue,
        light = light,
        safeTop = safeTop,
        safeBottom = safeBottom,
        detour = state.controls.detour,
        onCollapse = onCollapse,
        onOpenStage = onOpenStage,
        modifier = modifier,
    )
}
