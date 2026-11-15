package io.github.huleixin.tingyu.chrome;

import android.content.ContentResolver;
import android.database.ContentObserver;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import java.util.function.Consumer;

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/SystemMotionPreference.java
/** Observe the same Android animation setting formerly read independently by the player. */
final class SystemMotionPreference implements AutoCloseable {
    private final ContentResolver resolver;
    private final ContentObserver observer;

    SystemMotionPreference(ContentResolver resolver, Consumer<Boolean> changed) {
        this.resolver = resolver;
        observer = new ContentObserver(new Handler(Looper.getMainLooper())) {
            @Override public void onChange(boolean selfChange) { changed.accept(read(resolver)); }
        };
        resolver.registerContentObserver(Settings.Global.getUriFor(Settings.Global.ANIMATOR_DURATION_SCALE), false, observer);
    }

    static boolean read(ContentResolver resolver) {
        try { return Settings.Global.getFloat(resolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f; }
        catch (SecurityException error) { return false; }
    }

    @Override public void close() { resolver.unregisterContentObserver(observer); }
}
