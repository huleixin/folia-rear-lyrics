package io.github.huleixin.tingyu.lsp;

// android/app/src/main/java/io/github/huleixin/tingyu/lsp/RearBridgeContract.java
/** A deliberately small protocol: no arbitrary shell, package, intent or display commands. */
public final class RearBridgeContract {
    public static final String PACKAGE = "io.github.huleixin.tingyu";
    public static final String ACTIVITY = PACKAGE + ".RearLyricsActivity";
    public static final String AUTHORITY = PACKAGE + ".lsp";
    public static final String REQUEST = PACKAGE + ".LSP_CONNECT";
    public static final String PERMISSION = PACKAGE + ".permission.LSP_CONNECT";
    public static final String DESCRIPTOR = PACKAGE + ".REAR_LYRICS_V2";
    public static final int VERSION = 1;
    private RearBridgeContract() {}

    public static boolean isRearSize(int width, int height) {
        int shortSide = Math.min(width, height), longSide = Math.max(width, height);
        return (shortSide == 572 && longSide == 904) || (shortSide == 596 && longSide == 976);
    }

    public static boolean validSession(String session) {
        return session != null && session.length() > 0 && session.length() <= 160
            && session.matches("[A-Za-z0-9_-]+" );
    }
}
