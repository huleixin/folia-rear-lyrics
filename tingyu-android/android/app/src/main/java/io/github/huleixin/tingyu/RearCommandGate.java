package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/RearCommandGate.java
/**
 * The only place a rear-display command is allowed to leave the app.
 *
 * <p>The failure this exists to prevent: two controllers deciding at the same time. The old
 * engine ({@code RearHandoffState} + {@code RearCameraPolicy}) and plan A ({@link RearOccupancy})
 * both know how to yield and restore. Compiling both and letting them run is how the previous
 * revisions ended up waking, closing and restoring the panel from different call sites - a
 * camera exit could be answered twice, and the second answer rebuilt the window the first one
 * had just reused.
 *
 * <p>So the gate owns one {@link Source} at a time. A submission from any other source is
 * refused and counted, which is also what makes "the two engines never issue commands together"
 * a testable statement rather than a review habit.
 */
final class RearCommandGate {
    enum Source { LEGACY, PLAN_A }

    /** Effects that touch the rear display. Used for diagnostics and for the tests' vocabulary. */
    static final String YIELD = "yield";
    static final String RESTORE = "restore";
    static final String WAKE = "wake";
    static final String CLOSE = "close";

    private Source owner = Source.LEGACY;
    private long issued, refused, lastIssuedAt;
    private String last = "-";
    private Source lastSource = Source.LEGACY;

    /** Hands the panel's command channel to one engine; the other is refused from this instant. */
    void install(Source source) {
        if (source != null) owner = source;
    }

    Source owner() { return owner; }
    boolean owns(Source source) { return source == owner; }

    /**
     * Records a command if (and only if) {@code source} currently owns the channel.
     *
     * @return true when the caller may perform the effect
     */
    boolean submit(Source source, String effect, long now) {
        if (source != owner) { refused++; return false; }
        issued++;
        lastIssuedAt = now;
        last = effect;
        lastSource = source;
        return true;
    }

    long issued() { return issued; }
    long refused() { return refused; }
    String last() { return last; }

    String describe(long now) {
        return "engine=" + owner + ", commands=" + issued + ", refused=" + refused
            + ", last=" + last + "@" + lastSource
            + ", lastAge=" + (lastIssuedAt == 0 ? "-" : Math.max(0, now - lastIssuedAt) + "ms");
    }
}
