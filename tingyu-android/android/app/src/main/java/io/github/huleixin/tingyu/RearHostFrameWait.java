package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/RearHostFrameWait.java
/** A visible native card has a bounded first-frame budget; a collapsed card has none. */
final class RearHostFrameWait {
    static final long LIMIT_MS=4500;
    private long deadline=-1;
    long start(long now){if(deadline<0)deadline=now+LIMIT_MS;return Math.max(0,deadline-now);}
    void stop(){deadline=-1;}
    boolean expired(long now){return deadline>=0&&now>=deadline;}
}
