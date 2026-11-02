package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/RearHostPolicy.java
/** No other player's clock, controls or native card may enter a Tingyu takeover. */
final class RearHostPolicy {
    static boolean eligible(String mediaPackage,boolean requested,boolean camera,boolean attached,int display) {
        return RearHostContract.APP.equals(mediaPackage) && requested && !camera && attached && display>0;
    }
    static boolean validSession(String value) { return value!=null && value.matches("[a-zA-Z0-9-]{16,80}"); }
    static boolean userExit(boolean wasOwned,boolean paused,boolean aod,long gestureAt,long now) {
        return wasOwned && paused && !aod && gestureAt>=0 && now>=gestureAt && now-gestureAt<=1500;
    }
}
