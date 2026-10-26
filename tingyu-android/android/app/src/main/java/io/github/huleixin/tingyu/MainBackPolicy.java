package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/MainBackPolicy.java
// Conservative until JS reports a root page; stale bridge messages cannot enable fast Back.
final class MainBackPolicy {
    private long revision = -1;
    private volatile boolean handledInWeb = true;
    synchronized void update(boolean handled, long nextRevision) {
        if (nextRevision <= revision) return;
        revision = nextRevision;
        handledInWeb = handled;
    }
    boolean needsWebHandler() { return handledInWeb; }
}
