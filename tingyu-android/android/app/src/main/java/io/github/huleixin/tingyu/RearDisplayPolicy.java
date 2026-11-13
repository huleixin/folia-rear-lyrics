package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/RearDisplayPolicy.java
/** Pure guards; intent/session ownership remains in the existing coordinator and Activity. */
final class RearDisplayPolicy {
    static boolean targetDisplay(int actual, int expected) { return expected > 0 && actual == expected; }
    static boolean wanted(boolean existingIntent, boolean dismissed, boolean rendererFailed) {
        return existingIntent && !dismissed && !rendererFailed;
    }
    static boolean matching(String requested, String owner) {
        return requested!=null && !requested.isEmpty() && requested.equals(owner);
    }
    static boolean render(boolean validSession, boolean wanted, boolean camera, boolean sleeping, int displayState) {
        return validSession && wanted && !camera && !sleeping && displayState==2;
    }
    static boolean closeCallback(int callback, int current, boolean closing) { return closing && callback==current; }
}
