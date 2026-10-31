package io.github.huleixin.tingyu.lsp;

// android/app/src/main/java/io/github/huleixin/tingyu/lsp/RearLeaseView.java
/** Lyrics-lease evidence shared by every system_server-side guard; one source of truth. */
interface RearLeaseView {
    /** True while the rear lyric lease is live (panel carries our window). */
    boolean lyricsLeaseHeld();
    /** True while a camera has been on top of the leased rear display within the grace window. */
    boolean cameraRecentlyOnLeasedDisplay();
    /** The leased rear display id, or -1 when no lease is held. */
    int leasedDisplayId();
}
