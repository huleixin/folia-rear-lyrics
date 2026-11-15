package io.github.huleixin.tingyu.minimal.immersive

import androidx.activity.compose.BackHandler
import androidx.compose.animation.SharedTransitionLayout
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.util.VelocityTracker
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.nestedscroll.*
import androidx.compose.ui.layout.onGloballyPositioned
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
import kotlinx.coroutines.Job
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
            if (!preview) MeloXUiMotionRuntime.anyPlayerMotion = false
        }
    }
    BackHandler(enabled = active && !preview) { if (page != MeloXNowPlayingPage.Artwork) select(page) else onCollapse() }
    val backdrop = rememberLayerBackdrop()
    val anchor = LocalPlayerArtworkAnchor.current
    val outer = LocalImmersiveMorph.current
    val expanded = remember(outer) { { outer?.fraction() ?: 1f } }
    val shellTransitioning = remember(outer) { derivedStateOf { outer?.active() == true } }
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
        CompositionLocalProvider(LocalMeloXPaneSize provides pane, LocalImmersiveBackdrop provides backdrop) {
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
            // The upstream 0.86-screen drag range, 42% / 1200px/s release thresholds.
            // Scrollable pages offer only unconsumed downward motion to the shell.
            val dragRange = pane.height * .86f
            val rebound = remember { Animatable(0f) }
            var dragFraction by remember { mutableFloatStateOf(0f) }
            val scope = rememberCoroutineScope()
            var dragJob by remember { mutableStateOf<Job?>(null) }
            DisposableEffect(outer, active) {
                onDispose { dragJob?.cancel(); outer?.drag = 0f }
            }
            val latestPage by rememberUpdatedState(page)
            val latestCollapse by rememberUpdatedState(onCollapse)
            fun drag(delta: Float) {
                dragFraction = (dragFraction + delta / dragRange.coerceAtLeast(1f)).coerceIn(0f, .999f)
                dragJob?.cancel()
                outer?.drag = dragFraction
            }
            fun settle(velocity: Float, canceled: Boolean = false) {
                val dismiss = !canceled && (dragFraction >= .42f || velocity >= 1200f)
                dragJob?.cancel()
                if (dismiss) { latestCollapse(); return }
                dragJob = scope.launch {
                    rebound.snapTo(dragFraction)
                    rebound.animateTo(0f, immersiveSettleSpec()) {
                        dragFraction = value
                        outer?.drag = value
                    }
                }
            }
            val velocityTracker = remember { VelocityTracker() }
            val entering = outer != null && !outer.reduced && outer.entry.value < .9999f
            val gestureEnabled = active && !preview && !orient.isRunning && !closing.value && !entering
            val allowScrollCollapse by rememberUpdatedState(gestureEnabled && !window.isLandscape)
            val grabber = Modifier.pointerInput(gestureEnabled, dragRange, outer) {
                if (gestureEnabled) detectVerticalDragGestures(
                    onDragStart = { dragJob?.cancel(); dragFraction = outer?.drag ?: 0f; velocityTracker.resetTracking() },
                    onDragCancel = { settle(0f, canceled = true) },
                    onDragEnd = { settle(velocityTracker.calculateVelocity().y) },
                    onVerticalDrag = { change, dy ->
                        change.consume(); velocityTracker.addPosition(change.uptimeMillis, change.position); drag(dy)
                    })
            }
            val scroll = remember(dragRange, outer) {
                object : NestedScrollConnection {
                    override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset {
                        if (!allowScrollCollapse || source != NestedScrollSource.UserInput || latestPage == MeloXNowPlayingPage.Artwork || dragFraction <= 0f) return Offset.Zero
                        drag(available.y); return Offset(0f, available.y)
                    }
                    override fun onPostScroll(consumed: Offset, available: Offset, source: NestedScrollSource): Offset {
                        if (!allowScrollCollapse || source != NestedScrollSource.UserInput || latestPage == MeloXNowPlayingPage.Artwork || available.y <= 0f) return Offset.Zero
                        drag(available.y); return Offset(0f, available.y)
                    }
                    override suspend fun onPreFling(available: Velocity): Velocity {
                        if (!allowScrollCollapse || dragFraction <= 0f) return Velocity.Zero
                        settle(available.y); return available
                    }
                }
            }
            SharedTransitionLayout(Modifier.fillMaxSize().then(if (!window.isLandscape) Modifier.nestedScroll(scroll) else Modifier).then(if (page == MeloXNowPlayingPage.Artwork && !window.isLandscape) grabber else Modifier)) {
                val shared = this
                Box(Modifier.fillMaxSize().immersivePlayerContainer(outer).background(Color.Black)
                    .pointerInput(entering, closing.value) {
                        // Block taps during shell entry/exit without canceling a live downward drag.
                        if (entering || closing.value) awaitPointerEventScope {
                            while (true) awaitPointerEvent(PointerEventPass.Initial).changes.forEach { it.consume() }
                        }
                    }) {
                    Box(Modifier.fillMaxSize().layerBackdrop(backdrop)) {
                        MeloXFlowingLightBackdrop(state.artworkUrl, state.artworkBitmap, state.isPlaying && active,
                            state.mediaId, Modifier.fillMaxSize())
                    }
                    CompositionLocalProvider(LocalMeloXPlayerControlsEnabled provides
                        (active && foreground && !preview && !shellTransitioning.value)) {
                        Box(Modifier.fillMaxSize().immersiveSceneReveal(outer)) {
                            MeloXIOSNowPlayingScene(state, page, sourcePage, onCollapse, ::select,
                                onShowActions, onShowQuality, grabberDragModifier = grabber,
                                lyricsActive = foreground && active && !shellTransitioning.value, residentLayersReady = ready,
                                residentQueueLayersReady = queueReady, orientTransition = orient,
                                columnCenterProgress = { center.value }, shellTransitioning = shellTransitioning,
                                closingPlayer = closing, sharedTransitionScope = shared, preview = preview)
                        }
                    }
                }
                SharedArtworkDestination(state, page, { select(MeloXNowPlayingPage.Lyrics) }, expanded,
                    gesturesEnabled = foreground && active && !shellTransitioning.value,
                    orientTransition = orient, columnCenterProgress = { center.value },
                    closingIntent = closing.value,
                    movingArtwork = Modifier.onGloballyPositioned { anchor.artwork(it) }
                        .immersiveMovingCover(anchor, active))
            }
        }
    }
}
