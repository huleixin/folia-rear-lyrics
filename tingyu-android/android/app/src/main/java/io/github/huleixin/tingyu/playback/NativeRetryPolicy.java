package io.github.huleixin.tingyu.playback;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/NativeRetryPolicy.java
/** Preserve decoder ownership on transient connections, never retry auth/HTTP/format failures blindly. */
final class NativeRetryPolicy {
    static boolean canRetry(int code,int attempts){return attempts<2&&(code==2001||code==2002);}
    private NativeRetryPolicy(){}
}
