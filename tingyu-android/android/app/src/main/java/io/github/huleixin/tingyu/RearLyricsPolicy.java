package io.github.huleixin.tingyu;

/** Pure lifecycle decisions: persisted opt-in is not the same as a visible window. */
final class RearLyricsPolicy {
    static boolean shouldMaintain(boolean enabled, boolean playing, boolean manuallyStarted) {
        return enabled && (playing || manuallyStarted);
    }
    static boolean shouldAttempt(boolean enabled, boolean playing, boolean manual, boolean configured,
            boolean active, boolean pending, long now, long nextAttempt) {
        return shouldAttempt(enabled, playing, manual, configured, active, pending, now, nextAttempt, false);
    }
    static boolean shouldAttempt(boolean enabled, boolean playing, boolean manual, boolean configured,
            boolean active, boolean pending, long now, long nextAttempt, boolean lockRecovery) {
        return shouldMaintain(enabled, playing, manual) && configured && (!active || lockRecovery) && !pending && now >= nextAttempt;
    }
    static long retryDelay(int failures) {
        return Math.min(60_000L, 2_000L << Math.min(5, Math.max(0, failures)));
    }
}
