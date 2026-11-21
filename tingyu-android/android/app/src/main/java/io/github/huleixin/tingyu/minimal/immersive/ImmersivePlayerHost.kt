package io.github.huleixin.tingyu.minimal.immersive

import io.github.huleixin.tingyu.minimal.PlayerPanelState
import androidx.activity.compose.BackHandler
import androidx.compose.animation.SharedTransitionLayout
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.util.VelocityTracker
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.nestedscroll.*
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.Velocity
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.kyant.backdrop.backdrops.layerBackdrop
import com.kyant.backdrop.backdrops.rememberLayerBackdrop
import io.github.huleixin.tingyu.chrome.*
import io.github.huleixin.tingyu.minimal.*
import io.github.huleixin.tingyu.minimal.immersive.port.*
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.launch

// SPDX-License-Identifier: GPL-3.0-only
// Host adapted from MeloXIOSNowPlayingSharedHost, MeloX Android 0.7.3,
// c04f36b9af540806b3bb185b347572e9ca12d87d. Tingyu supplies all business state.

@Composable
internal fun ImmersivePlayerHost(
    snapshot: MinimalPlayerState,
    artwork: MinimalArtwork,
    commands: MinimalPlayerCommands,
    queue: MinimalQueue,
    active: Boolean,
    resetToken: Int,
    onCollapse: () -> Unit,
    onPageChanged: (Int) -> Unit,
    onShowActions: () -> Unit,
    onShowQuality: () -> Unit,
    modifier: Modifier = Modifier,
    preview: Boolean = false,
    initialPage: MeloXNowPlayingPage = MeloXNowPlayingPage.Artwork,
    safeTop: Float = 0f,
) {
    val appContext = androidx.compose.ui.platform.LocalContext.current.applicationContext
    ApplyImmersiveRenderPolicy(preview)
    val volume = if (preview) null else rememberImmersiveSystemVolume()
    val playback = snapshot.playback
    val document = remember(snapshot.lyrics, playback.track.key, playback.epoch) {
        snapshot.lyrics.toImmersiveDocument(playback.track.key, playback.epoch)
    }
    val loading = snapshot.lyrics.status == MinimalLyricsStatus.LOADING || snapshot.lyrics.status == MinimalLyricsStatus.STALE
    val state = MeloXPlaybackUiState(playback, document, loading,
        artwork.bitmap, { commands.seekTo(it / 1000.0) }, snapshot.controls, commands, queue, commands, volume)
    var page by remember(resetToken) { mutableStateOf(initialPage) }
    var sourcePage by remember(resetToken) { mutableStateOf(page) }
    fun select(target: MeloXNowPlayingPage) {
        val next = if (target == page) {
            if (page == MeloXNowPlayingPage.Queue) sourcePage else MeloXNowPlayingPage.Artwork
        } else target
        if (target == MeloXNowPlayingPage.Queue && page != MeloXNowPlayingPage.Queue) sourcePage = page
        page = next
    }
    LaunchedEffect(page) { if (!preview) onPageChanged(if (page == MeloXNowPlayingPage.Lyrics) 1 else 0) }
    DisposableEffect(page) {
        if (!preview && page == MeloXNowPlayingPage.Queue) commands.requestQueue()
        onDispose { if (!preview && page == MeloXNowPlayingPage.Queue) commands.closeQueue() }
    }
    val owner = LocalLifecycleOwner.current
    var foreground by remember(owner) { mutableStateOf(owner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) }
    DisposableEffect(owner) {
        val observer = LifecycleEventObserver { _, _ ->
            foreground = owner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)
            if (foreground) volume?.sync()
        }
        if (!preview) owner.lifecycle.addObserver(observer)
        onDispose { if (!preview) { owner.lifecycle.removeObserver(observer); MeloXAppVisibility.isForeground = false } }
    }
    DisposableEffect(active, foreground, preview) {
        val prefs = appContext.getSharedPreferences("player_style", android.content.Context.MODE_PRIVATE)
        if (!preview) prefs.edit().putBoolean("immersive_visible", active && foreground)
            .putLong("immersive_visible_since", System.currentTimeMillis()).apply()
        onDispose { if (!preview) prefs.edit().putBoolean("immersive_visible", false).apply() }
    }
    SideEffect { if (!preview) MeloXAppVisibility.isForeground = foreground && active && !snapshot.controls.detour }
    DisposableEffect(Unit) {
        onDispose {
            if (!preview) MeloXUiMotionRuntime.orientationTransition = false
            if (!preview) MeloXUiMotionRuntime.pageTransition = false
            if (!preview) MeloXUiMotionRuntime.shellTransition = false
        }
    }
    BackHandler(enabled = active && !preview) { if (page != MeloXNowPlayingPage.Artwork) select(page) else onCollapse() }
    val backdrop = rememberLayerBackdrop()
    val anchor = LocalPlayerArtworkAnchor.current
    val outer = LocalImmersiveMorph.current
    val shellTransitioning = remember(outer) { derivedStateOf { outer?.active() == true } }
    SideEffect { if (!preview) MeloXUiMotionRuntime.shellTransition = shellTransitioning.value }
    val closing = remember(outer) { derivedStateOf { outer?.exit?.active == true } }
    var ready by remember { mutableStateOf(false) }
    var queueReady by remember { mutableStateOf(false) }
    LaunchedEffect(shellTransitioning.value) {
        if (!shellTransitioning.value) {
            repeat(6) { withFrameNanos { } }; ready = true
            withFrameNanos { }; queueReady = true
        }
    }
    BoxWithConstraints(modifier) {
        val density = LocalDensity.current
        val pane = with(density) { IntSize(maxWidth.roundToPx(), maxHeight.roundToPx()) }
        CompositionLocalProvider(LocalMeloXPaneSize provides pane, LocalImmersiveBackdrop provides backdrop, LocalImmersiveSafeTop provides safeTop) {
            val window = rememberMeloXWindowInfo()
            var orientation by remember { mutableStateOf(window.isLandscape) }
            LaunchedEffect(window.isLandscape, closing.value) {
                if (!closing.value) repeat(2) { withFrameNanos { } }
                orientation = window.isLandscape
            }
            val orient = updateTransition(orientation, "immersive-orientation")
            SideEffect { if (!preview) MeloXUiMotionRuntime.orientationTransition = orient.isRunning }
            val center = remember { Animatable(if (window.supportsPlayerTwoPane && !window.ultrawidePlayer) 1f else 0f) }
            LaunchedEffect(window.supportsPlayerTwoPane, window.ultrawidePlayer, page) {
                center.animateTo(if (window.supportsPlayerTwoPane && !window.ultrawidePlayer && page == MeloXNowPlayingPage.Artwork) 1f else 0f,
                    tween(460, easing = CubicBezierEasing(.33f, 0f, .2f, 1f)))
            }
            // Mini and full-screen gestures catch the same timeline at its current position.
            // Lyrics/queue offer only unconsumed downward motion until the shell owns the drag.
            val dragRange = outer?.panel?.top?.takeIf { it > 0f } ?: pane.height * .86f
            val scope = rememberCoroutineScope()
            val localPanel = remember { PlayerPanelState(scope) }
            val panel = outer?.interactive ?: localPanel
            val latestPage by rememberUpdatedState(page)
            val latestCollapse by rememberUpdatedState(onCollapse)
            LaunchedEffect(localPanel.collapsePending) {
                if (outer?.interactive == null && localPanel.collapsePending) {
                    localPanel.consumeCollapse(); latestCollapse()
                }
            }
            fun beginDrag() {
                panel.adopt(outer?.fraction() ?: 1f)
                panel.beginDrag()
            }
            fun drag(delta: Float) {
                if (!panel.dragging) beginDrag()
                panel.dragBy(delta, dragRange)
            }
            fun settle(velocity: Float, canceled: Boolean = false) {
                panel.release(velocity, canceled, outer?.reduced == true)
            }
            val velocityTracker = remember { VelocityTracker() }
            val gestureEnabled = active && !preview && !orient.isRunning && !closing.value
            val allowScrollCollapse by rememberUpdatedState(gestureEnabled && !window.isLandscape)
            val grabber = Modifier.pointerInput(gestureEnabled, dragRange, outer) {
                if (gestureEnabled) detectVerticalDragGestures(
                    onDragStart = { beginDrag(); velocityTracker.resetTracking() },
                    onDragCancel = { settle(0f, canceled = true) },
                    onDragEnd = { settle(velocityTracker.calculateVelocity().y) },
                    onVerticalDrag = { change, dy ->
                        change.consume(); velocityTracker.addPosition(change.uptimeMillis, change.position); drag(dy)
                    })
            }
            val scroll = remember(dragRange, outer) {
                object : NestedScrollConnection {
                    override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset {
                        if (!allowScrollCollapse || source != NestedScrollSource.UserInput || latestPage == MeloXNowPlayingPage.Artwork || !panel.dragging) return Offset.Zero
                        drag(available.y); return Offset(0f, available.y)
                    }
                    override fun onPostScroll(consumed: Offset, available: Offset, source: NestedScrollSource): Offset {
                        if (!allowScrollCollapse || source != NestedScrollSource.UserInput || latestPage == MeloXNowPlayingPage.Artwork || available.y <= 0f) return Offset.Zero
                        drag(available.y); return Offset(0f, available.y)
                    }
                    override suspend fun onPreFling(available: Velocity): Velocity {
                        if (!allowScrollCollapse || !panel.dragging) return Velocity.Zero
                        settle(available.y); return available
                    }
                }
            }
            // Keep scene artwork and any internal shared elements inside the same clip.
            SharedTransitionLayout(Modifier.fillMaxSize().immersivePlayerContainer(outer)
                .graphicsLayer { alpha = outer?.shellAlpha() ?: 1f }
                .then(if (!window.isLandscape) Modifier.nestedScroll(scroll) else Modifier)
                .then(if (page == MeloXNowPlayingPage.Artwork && !window.isLandscape) grabber else Modifier)) {
                val shared = this
                val miniSurface = ChromeGlassPresets.active().surface(LocalInterfacePalette.current.light, ChromeGlassPresets.MiniFill)
                var paletteReady by remember { mutableStateOf(false) }
                val paletteVisibility by animateFloatAsState(if (paletteReady) 1f else 0f, tween(if (outer?.reduced == true) 0 else 220), label = "immersive-palette-ready")
                Box(Modifier.fillMaxSize()) {
                    Box(Modifier.fillMaxSize().background(miniSurface)) {
                        Box(Modifier.fillMaxSize().graphicsLayer {
                            alpha = (outer?.materialFraction() ?: 1f) * paletteVisibility
                        }.layerBackdrop(backdrop)) {
                            MeloXFlowingLightBackdrop(state.artworkUrl, state.artworkBitmap, state.isPlaying && active,
                                state.mediaId, Modifier.fillMaxSize(), onPaletteReady = { paletteReady = true })
                        }
                        CompositionLocalProvider(LocalMeloXPlayerControlsEnabled provides
                            (active && foreground && !preview && !shellTransitioning.value)) {
                            Box(Modifier.fillMaxSize().immersiveSceneReveal(outer)) {
                                MeloXIOSNowPlayingScene(state, page, sourcePage, onCollapse, ::select,
                                    onShowActions, onShowQuality, grabberDragModifier = grabber,
                                    // Keep the lyric renderer active through the pull; its own
                                    // scroll-follow pause is separate from drawing/geometry.
                                    lyricsActive = foreground && active, residentLayersReady = ready,
                                    residentQueueLayersReady = queueReady, orientTransition = orient,
                                    columnCenterProgress = { center.value }, shellTransitioning = shellTransitioning,
                                    closingPlayer = closing, sharedTransitionScope = shared, preview = preview)
                            }
                        }
                    }
                    SharedArtworkDestination(state, page, { select(MeloXNowPlayingPage.Lyrics) },
                        gesturesEnabled = foreground && active && !shellTransitioning.value,
                        orientTransition = orient, columnCenterProgress = { center.value },
                        playerMotion = outer,
                        movingArtwork = Modifier.immersiveMovingCover(anchor, outer),
                        onArtworkPositioned = anchor::artwork)
                }
            }
        }
    }
}
