package io.github.huleixin.tingyu;

// Main-activity-only, transient orientation policy. No preferences or playback state live here.
final class StageOrientation {
    interface Host {
        int requestedOrientation();
        int preferredOrientation();
        int poseOrientation();
        boolean isLandscape();
        void requestOrientation(int orientation);
        void requestLandscape();
        void schedule(Runnable task, long delayMs);
        void cancel(Runnable task);
        void changed(State state);
    }

    static final class State {
        final String session;
        final boolean active, landscape, pending;
        final long revision;
        final String error, reason;
        State(String session, boolean active, boolean landscape, boolean pending,
              long revision, String error, String reason) {
            this.session = session; this.active = active; this.landscape = landscape;
            this.pending = pending; this.revision = revision; this.error = error; this.reason = reason;
        }
    }

    private final Host host;
    private String session = "";
    private boolean surfaceVisible = true;
    private boolean active, landscape, pending, stopped, holdingEntryPose, restoreOutstanding;
    private int entryOrientation, entryPreference, entryPose;
    private long revision;
    private String error, reason = "initial";
    private Runnable timeout;
    private long timeoutGeneration;

    StageOrientation(Host host) { this.host = host; }

    State state() { return new State(session, active, landscape, pending, revision, error, reason); }
    boolean overridesPhoneFit() { return landscape; }

    void setSurfaceVisible(boolean visible) {
        if (surfaceVisible == visible) return;
        surfaceVisible = visible;
        if (!visible) reset("page-hidden", false);
    }

    boolean applyPhoneFitOverride() {
        if (!surfaceVisible) { host.requestOrientation(7); return true; }
        if (landscape) { host.requestLandscape(); return true; }
        if (holdingEntryPose && host.preferredOrientation() == entryPreference) {
            host.requestOrientation(entryPose); return true;
        }
        holdingEntryPose = false;
        return false;
    }

    void activate(String id) {
        if (id == null || id.isEmpty()) throw new IllegalArgumentException("Stage session is required");
        if (stopped) throw new IllegalStateException("主屏当前不可见，无法旋转舞台");
        if (active && session.equals(id)) return;
        reset("replaced", true);
        if (restoreOutstanding) throw new IllegalStateException(error);
        session = id; active = true; error = null;
        entryOrientation = host.requestedOrientation();
        entryPreference = host.preferredOrientation();
        entryPose = host.poseOrientation();
        publish("activated");
    }

    void setLandscape(String id, boolean value) {
        setLandscape(id, value, -1L);
    }

    void setLandscape(String id, boolean value, long expectedRevision) {
        if (!active || !session.equals(id)) throw new IllegalStateException("Stage session has ended");
        // Back/reset may run before a previously submitted bridge command reaches the UI thread.
        if (expectedRevision >= 0 && expectedRevision != revision) return;
        if (stopped) throw new IllegalStateException("主屏当前不可见，无法旋转舞台");
        if (!value) { reset("button", false); return; }
        if (!surfaceVisible) return;
        if (landscape) return;
        error = null; landscape = true; holdingEntryPose = false;
        try {
            host.requestLandscape();
            pending = !host.isLandscape();
            publish("button");
            if (pending) {
                long generation = timeoutGeneration;
                // A vendor/multi-window policy can silently ignore setRequestedOrientation.
                timeout = () -> {
                    if (generation != timeoutGeneration) return;
                    timeout = null;
                    if (!landscape || !pending) return;
                    if (host.isLandscape()) { configurationChanged(); return; }
                    error = "系统未允许舞台横屏，请稍后重试";
                    reset("rotation-failed", false);
                };
                host.schedule(timeout, 4000L);
            }
        } catch (RuntimeException failure) {
            error = "无法旋转舞台：" + failure.getMessage();
            reset("rotation-failed", false);
        }
    }

    void deactivate(String id) {
        // A late cleanup from the previous React mount must not unlock a new stage.
        if (active && session.equals(id)) reset("deactivated", true);
    }

    boolean handleBack() {
        if (!landscape) return false;
        error = null;
        reset("back", false);
        return true;
    }

    void configurationChanged() {
        if (landscape && pending && host.isLandscape()) {
            cancelTimeout(); pending = false; publish("configuration");
        }
    }

    void resume() { stopped = false; }
    void stop() { stopped = true; reset("stop", false); }

    /** Button/Back restore the entry pose; hidden pages always use sensor portrait. */
    void reset(String cause, boolean endSession) {
        cancelTimeout();
        boolean restore = !surfaceVisible || landscape || holdingEntryPose || restoreOutstanding;
        landscape = false; pending = false;
        holdingEntryPose = false;
        if (endSession) active = false;
        if (restore) {
            try {
                int preferred = host.preferredOrientation();
                int target = !surfaceVisible ? 7 : preferred == entryPreference ? entryOrientation : preferred;
                if (surfaceVisible && !endSession && preferred == entryPreference && ("button".equals(cause) || "back".equals(cause))) {
                    // Auto-rotate would otherwise leave the phone landscape after the restore button.
                    target = entryPose; holdingEntryPose = target != entryOrientation;
                }
                host.requestOrientation(target);
                restoreOutstanding = false;
            } catch (RuntimeException failure) {
                // Retry transient restoration failures on cleanup/stop/destroy rather than losing them.
                restoreOutstanding = true;
                error = "无法恢复屏幕方向：" + failure.getMessage();
            }
        }
        publish(cause);
    }

    private void cancelTimeout() {
        timeoutGeneration++;
        if (timeout != null) { host.cancel(timeout); timeout = null; }
    }

    private void publish(String cause) { reason = cause; revision++; host.changed(state()); }
}
