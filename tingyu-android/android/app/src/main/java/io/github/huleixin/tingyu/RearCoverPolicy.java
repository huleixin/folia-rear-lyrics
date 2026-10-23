package io.github.huleixin.tingyu;

import java.util.Locale;

// android/app/src/main/java/top/izuna/foliamajor/RearCoverPolicy.java
final class RearCoverPolicy {
    private RearCoverPolicy() { }
    static boolean rearSensor(String name) {
        String normalized = name.toLowerCase(Locale.ROOT);
        return normalized.contains("rear") || normalized.contains("back") || normalized.contains("后置") || normalized.contains("背部");
    }
    static boolean tabletop(float x, float y, float z, float motion, boolean sampled) {
        return sampled && motion < .8f && z > 8.5f && Math.abs(x) < 3f && Math.abs(y) < 3f;
    }
    static boolean mayRecoverWindow(boolean sleeping, boolean powerBusy) { return !sleeping && !powerBusy; }
}
