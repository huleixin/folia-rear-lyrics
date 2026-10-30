package io.github.huleixin.tingyu.playback;

import android.os.SystemClock;

import com.getcapacitor.JSObject;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/PlaybackLifecycle.java
/**
 * The four independent signals behind "the WebView stopped answering".
 *
 * <p>{@code jsSilentMs} on its own proves nothing: a renderer frozen by the OS, a renderer
 * destroyed by the OS, an Activity destroyed by the OS, and a WebView that is alive but has
 * nothing to say all produce the same number. This holder keeps the four signals separate so a
 * report can correlate them instead of asserting a conclusion:
 *
 * <ol>
 *   <li>Activity lifecycle - is the host component still alive, and when did it last change?</li>
 *   <li>Renderer state - did Chromium's renderer actually die, and did it crash?</li>
 *   <li>Bridge listener state - does the engine still have a listener to deliver events to?</li>
 *   <li>Command record - how many commands crossed the bridge, and how long ago was the last?</li>
 * </ol>
 *
 * <p>Deliberately does not compute a verdict. Deciding "JS is dead" from a single counter is
 * exactly the mistake that made earlier rounds unreviewable.
 */
public final class PlaybackLifecycle {
    private static volatile String activityState = "none";
    private static volatile long activityStateAtWall = 0L;
    private static volatile boolean activityAlive = false;

    private static volatile boolean rendererGone = false;
    private static volatile long rendererGoneAtWall = 0L;
    private static volatile int rendererGoneCount = 0;
    private static volatile boolean rendererCrashed = false;

    private static volatile boolean bridgeAttached = false;
    private static volatile long bridgeAttachedAtWall = 0L;
    private static volatile long bridgeDetachedAtWall = 0L;

    private static volatile int jsCommands = 0;
    private static volatile long lastJsCommandAtElapsed = 0L;
    private static volatile long lastJsCommandAtWall = 0L;

    private static volatile int droppedAsks = 0;
    private static volatile long lastDroppedAskAtWall = 0L;
    private static volatile String lastDroppedAskType = "";

    private PlaybackLifecycle() {}

    public static void noteActivity(String state, boolean alive) {
        if (state == null) return;
        activityState = state;
        activityAlive = alive;
        activityStateAtWall = System.currentTimeMillis();
    }

    public static void noteRendererGone(boolean didCrash) {
        rendererGone = true;
        rendererCrashed = didCrash;
        rendererGoneCount++;
        rendererGoneAtWall = System.currentTimeMillis();
    }

    /** The engine's only delivery path to JS. Losing it silences both reported bugs at once. */
    public static void noteBridge(boolean attached) {
        if (attached == bridgeAttached) return;
        bridgeAttached = attached;
        long now = System.currentTimeMillis();
        if (attached) bridgeAttachedAtWall = now;
        else bridgeDetachedAtWall = now;
    }

    /** Every command that crosses the bridge is proof JS ran at that instant. */
    public static void noteJsCommand() {
        jsCommands++;
        lastJsCommandAtElapsed = SystemClock.elapsedRealtime();
        lastJsCommandAtWall = System.currentTimeMillis();
    }

    /**
     * The engine asked JS for something and had nowhere to send it. Unlike {@code jsSilentMs}
     * this is a positive observation: the ask existed, the listener did not.
     */
    public static void noteDroppedAsk(String type) {
        droppedAsks++;
        lastDroppedAskAtWall = System.currentTimeMillis();
        lastDroppedAskType = type == null ? "" : type;
    }

    /** -1 = no command has ever crossed the bridge in this process. */
    public static long jsSilentMs() {
        if (lastJsCommandAtElapsed == 0L) return -1L;
        return SystemClock.elapsedRealtime() - lastJsCommandAtElapsed;
    }

    /** Raw signals only; interpretation belongs in the report, next to the trail. */
    public static JSObject snapshot() {
        long nowWall = System.currentTimeMillis();
        long nowElapsed = SystemClock.elapsedRealtime();
        return new JSObject()
            .put("activityState", activityState)
            .put("activityAlive", activityAlive)
            .put("activityStateAt", activityStateAtWall)
            .put("activityStateForMs", activityStateAtWall == 0L ? -1L : nowWall - activityStateAtWall)
            .put("rendererGone", rendererGone)
            .put("rendererGoneCount", rendererGoneCount)
            .put("rendererCrashed", rendererCrashed)
            .put("rendererGoneAt", rendererGoneAtWall)
            .put("rendererGoneForMs", rendererGoneAtWall == 0L ? -1L : nowWall - rendererGoneAtWall)
            .put("bridgeAttached", bridgeAttached)
            .put("bridgeAttachedAt", bridgeAttachedAtWall)
            .put("bridgeDetachedAt", bridgeDetachedAtWall)
            .put("bridgeDetachedForMs", bridgeDetachedAtWall == 0L ? -1L : nowWall - bridgeDetachedAtWall)
            .put("jsCommands", jsCommands)
            .put("lastJsCommandAt", lastJsCommandAtWall)
            .put("jsSilentMs", lastJsCommandAtElapsed == 0L ? -1L : nowElapsed - lastJsCommandAtElapsed)
            .put("droppedAsks", droppedAsks)
            .put("lastDroppedAskAt", lastDroppedAskAtWall)
            .put("lastDroppedAskType", lastDroppedAskType)
            .put("uptimeMs", nowElapsed);
    }
}
