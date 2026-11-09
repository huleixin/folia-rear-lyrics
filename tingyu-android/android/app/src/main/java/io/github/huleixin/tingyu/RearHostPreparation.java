package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/RearHostPreparation.java
/** One bounded asset/config preparation window. Never authorizes card acquisition or visibility. */
final class RearHostPreparation {
    static final long LIMIT_MS=4500;
    static boolean allowed(long now,long started,boolean lease,boolean identity,boolean attached,boolean follow,int power) {
        return lease&&identity&&attached&&now>=started&&now-started<LIMIT_MS
            &&(power==2||follow&&(power==3||power==4));
    }
}
