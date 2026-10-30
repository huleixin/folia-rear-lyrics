package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/RearLend.java
/**
 * One loan of the rear display to another app - in practice Xiaomi Camera showing its rear
 * preview. Modelled after Mi Back Screen's {@code Lend} (MIT): the point is not the fields but
 * the id. Every camera episode looks identical (same package, unknown task), so a late callback
 * from an old episode would otherwise be able to end a newer one.
 *
 * <p>{@link #id} is monotonic per process and is the only thing callbacks may quote back.
 */
final class RearLend {
    enum Reason {
        /** A camera owns the rear panel. The only reason this app yields to today. */
        CAMERA,
        /** Another app was moved there deliberately. Kept for wiring, not used yet. */
        APP
    }

    final Reason reason;
    final String packageName;
    /** Task id on the rear display, or -1 while the camera has not been listed yet. */
    final int taskId;
    final long id;

    RearLend(Reason reason, String packageName, int taskId, long id) {
        this.reason = reason;
        this.packageName = packageName == null ? "" : packageName;
        this.taskId = taskId;
        this.id = id;
    }

    boolean matches(RearLend other) {
        return other != null && other.id == id;
    }

    @Override public String toString() {
        return reason + "(" + packageName + ", task=" + taskId + ", id=" + id + ")";
    }
}
