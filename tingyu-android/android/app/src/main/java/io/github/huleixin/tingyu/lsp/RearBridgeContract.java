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
    public static final int VERSION = 5;
    public static final int HOLD_POWER = android.os.IBinder.FIRST_CALL_TRANSACTION + 6;
    public static final int RELEASE_POWER = android.os.IBinder.FIRST_CALL_TRANSACTION + 7;
    private RearBridgeContract() {}

    public static boolean isRearSize(int width, int height) {
        int shortSide = Math.min(width, height), longSide = Math.max(width, height);
        return (shortSide == 572 && longSide == 904) || (shortSide == 596 && longSide == 976);
    }

    public static boolean validSession(String session) {
        return session != null && session.length() > 0 && session.length() <= 160
            && session.matches("[A-Za-z0-9_-]+" );
    }

    /**
     * A camera on the rear display outranks every lease. Package-name based on purpose: the
     * check runs inside system_server, where resolving activities is both slow and unsafe.
     */
    public static boolean isCameraPackage(String pkg) {
        return pkg != null && pkg.toLowerCase(java.util.Locale.ROOT).contains("camera");
    }

    /**
     * Components that legitimately sit above a rear lyric window: the keyguard layers that
     * appear when the main display locks, and the OEM rear-screen host itself. Their presence
     * on top must not be read as "another app took the screen".
     */
    public static boolean isSystemOverlay(String pkg) {
        if (pkg == null) return false;
        String normalized = pkg.toLowerCase(java.util.Locale.ROOT);
        return normalized.equals("android")
            || normalized.equals("com.android.systemui")
            || normalized.startsWith("com.miui.keyguard")
            || normalized.startsWith("com.miui.aod")
            || normalized.contains("miui.rearscreen")
            || normalized.contains("backscreen");
    }
}
