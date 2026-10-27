package io.github.huleixin.tingyu.lsp;

import java.lang.reflect.Field;
import java.util.List;

// android/app/src/main/java/io/github/huleixin/tingyu/lsp/RearTaskMetadata.java
/** RootTaskInfo and RunningTaskInfo are siblings on modern Android, not cast-compatible. */
final class RearTaskMetadata {
    private RearTaskMetadata() {}
    private static Object field(Object value, String name) throws ReflectiveOperationException {
        return value.getClass().getField(name).get(value);
    }
    private static boolean ownComponent(Object value) throws ReflectiveOperationException {
        return value != null && RearBridgeContract.PACKAGE.equals(value.getClass().getMethod("getPackageName").invoke(value))
            && RearBridgeContract.ACTIVITY.equals(value.getClass().getMethod("getClassName").invoke(value));
    }
    /** Move only a root containing our one rear task; never reparent other apps in a shared root. */
    static int ownedRoot(List<?> roots, int task, int user) throws ReflectiveOperationException {
        for (Object root : roots) {
            if (((Number) field(root, "userId")).intValue() != user || !ownComponent(field(root, "baseActivity"))) continue;
            int rootId = ((Number) field(root, "taskId")).intValue();
            int[] children = (int[]) field(root, "childTaskIds");
            if (children == null || children.length == 0) { if (rootId == task) return rootId; continue; }
            if (children.length == 1 && (children[0] == task || rootId == task)) return rootId;
        }
        throw new SecurityException("Rear task is missing or shares a root with another task");
    }
    static String front(List<?> roots) throws ReflectiveOperationException {
        for (Object root : roots) {
            if (!Boolean.TRUE.equals(field(root, "visible"))) continue;
            Object top = field(root, "topActivity");
            if (top == null) continue;
            int task = ((Number) field(root, "taskId")).intValue();
            int[] children = (int[]) field(root, "childTaskIds");
            if (ownComponent(top) && children != null && children.length == 1) task = children[0];
            return task + " " + top.getClass().getMethod("flattenToShortString").invoke(top);
        }
        return "-1 unknown";
    }
}
