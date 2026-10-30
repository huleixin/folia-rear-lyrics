package io.github.huleixin.tingyu;

import android.app.KeyguardManager;
import android.content.Context;
import android.os.SystemClock;
import rikka.shizuku.Shizuku;

/** Retains the lock transition after the user unlocks to read diagnostics. No audio/lyrics are logged.
 *
 * <p>Visible outside the package on purpose: the song identity chain crosses three owners
 * (Media3 in {@code playback}, the native lyric cache, the rear renderer), and only one trace
 * file can tell whether a stuck lyric line came from a missing event, a missing lyric or a
 * renderer that never switched.
 */
public final class RearLyricsTrace {
    public static synchronized void record(Context context, String event, String message) {
        try {
        android.content.SharedPreferences prefs = context.getSharedPreferences("rear_lyrics", 0);
        KeyguardManager keyguard = (KeyguardManager) context.getSystemService(Context.KEYGUARD_SERVICE);
        int rear = RearLyricsCoordinator.findRearDisplayId(context);
        String entry = SystemClock.elapsedRealtime() + " " + event + " locked=" + (keyguard != null && keyguard.isKeyguardLocked())
            + " mainPower=" + RearLyricsLauncher.displayState(context, 0)
            + " rearPower=" + RearLyricsLauncher.displayState(context, rear)
            + " shizuku=" + Shizuku.pingBinder() + " " + message;
        String history = prefs.getString("lock_trace", "") + entry + "\n";
        String[] lines = history.split("\n");
        StringBuilder bounded = new StringBuilder();
        for (int index = Math.max(0, lines.length - 40); index < lines.length; index++) bounded.append(lines[index]).append('\n');
        prefs.edit().putString("lock_trace", bounded.toString()).apply();
        } catch (Exception ignored) { /* Diagnostics must not interrupt a window/power transition. */ }
    }
    static String read(Context context) { return context.getSharedPreferences("rear_lyrics", 0).getString("lock_trace", ""); }
}
