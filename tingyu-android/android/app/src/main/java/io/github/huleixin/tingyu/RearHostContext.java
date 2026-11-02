package io.github.huleixin.tingyu;

import android.content.Context;

// android/app/src/main/java/io/github/huleixin/tingyu/RearHostContext.java
/** Application.attach has a usable base context before LoadedApk exposes its Application. */
final class RearHostContext {
    static Context resolve(Context attached) {
        java.util.Objects.requireNonNull(attached, "Host attach context missing");
        return select(attached.getApplicationContext(), attached);
    }
    static <T> T select(T application, T attached) {
        return application != null ? application : java.util.Objects.requireNonNull(attached, "Host context missing");
    }
    private RearHostContext() {}
}
