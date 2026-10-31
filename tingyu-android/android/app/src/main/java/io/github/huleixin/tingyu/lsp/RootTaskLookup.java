package io.github.huleixin.tingyu.lsp;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.List;

// android/app/src/main/java/io/github/huleixin/tingyu/lsp/RootTaskLookup.java
/**
 * {@code IActivityTaskManager.getAllRootTaskInfos()} 结果的解析。
 *
 * <p>v1.3.59 的缺陷（真机必然命中，且被静默吞掉）：
 *
 * <pre>
 * Object[] roots = (Object[]) IActivityTaskManager.getAllRootTaskInfos().invoke(atm);
 * </pre>
 *
 * 该方法在 AOSP 10 起的签名是 {@code List<RootTaskInfo> getAllRootTaskInfos()}，返回的是
 * {@link java.util.List}，强转 {@code Object[]} 会抛 {@code ClassCastException}；异常被
 * {@code catch (Throwable ignored)} 吞掉后返回 {@code null}，而判定层把 {@code null} 当作
 * 「身份未知，放行」。于是 {@code moveRootTaskToDisplay} 这条拦截在真机上<b>从未生效过</b>：
 * 计数里只有 moveConsulted 在涨，moveBlocked 永远是 0。
 *
 * <p>这里把「容器形态」与「元素读取」分开处理，并显式区分三种结论：
 * <ul>
 *   <li>{@link Status#FOUND} —— 找到该任务并读出了顶层包名；</li>
 *   <li>{@link Status#ABSENT} —— 列表读得到，但没有这个 taskId；</li>
 *   <li>{@link Status#UNREADABLE} —— 列表读不到 / 元素字段读不出 / 顶层 Activity 为空。</li>
 * </ul>
 * 只有 {@code FOUND} 才允许拦截；后两者一律放行，但会被分别计数，诊断里能一眼区分
 * 「本来就不该拦」和「我们读不出来」。
 *
 * <p>无 Android 依赖：只用 {@code java.lang.reflect} 与 {@link List}，因此可在 JVM 上断言。
 */
final class RootTaskLookup {

    enum Status { FOUND, ABSENT, UNREADABLE }

    static final class Result {
        final Status status;
        final String packageName;

        Result(Status status, String packageName) {
            this.status = status;
            this.packageName = packageName;
        }

        static final Result UNREADABLE = new Result(Status.UNREADABLE, null);
        static final Result ABSENT = new Result(Status.ABSENT, null);

        boolean found() { return status == Status.FOUND; }

        @Override public String toString() {
            return status + (packageName == null ? "" : ":" + packageName);
        }
    }

    /** 容器形态：AOSP 10+ 是 List，更老的版本才是数组；两者都接受。 */
    static List<?> asList(Object rootInfos) {
        if (rootInfos instanceof List) return (List<?>) rootInfos;
        if (rootInfos instanceof Object[]) return java.util.Arrays.asList((Object[]) rootInfos);
        return null;
    }

    /**
     * 在 {@code getAllRootTaskInfos()} 的返回值里查一个 taskId 的顶层包名。
     *
     * @param rootInfos 反射调用的原始返回值（List / Object[] / null）
     * @param taskId    目标任务；&lt;= 0 直接判为不可读（调用方本来也不该问）
     */
    static Result topPackageOf(Object rootInfos, int taskId) {
        if (taskId <= 0) return Result.UNREADABLE;
        List<?> roots = asList(rootInfos);
        if (roots == null) return Result.UNREADABLE;
        boolean sawElement = false;
        boolean sawTaskId = false;
        for (Object root : roots) {
            if (root == null) continue;
            sawElement = true;
            Integer id = intField(root, "taskId");
            if (id == null) continue;
            sawTaskId = true;
            if (id != taskId) continue;
            String pkg = packageOfFirstComponent(root);
            return pkg == null ? Result.UNREADABLE : new Result(Status.FOUND, pkg);
        }
        // 列表可读、元素也可读，但没有这个任务：确定不存在。
        if (sawElement && sawTaskId) return Result.ABSENT;
        // 空列表是确定的「没有」；非空但读不出 taskId 则属于不可读。
        if (!sawElement && roots.isEmpty()) return Result.ABSENT;
        return Result.UNREADABLE;
    }

    /** 诊断用：这次拿到的容器长什么样，避免「到底是 List 还是数组」再靠猜。 */
    static String describeContainer(Object rootInfos) {
        if (rootInfos == null) return "null";
        List<?> roots = asList(rootInfos);
        String type = rootInfos.getClass().getName();
        if (roots == null) return type + " (unsupported)";
        String element = "none";
        for (Object root : roots) {
            if (root != null) { element = root.getClass().getName(); break; }
        }
        return type + " size=" + roots.size() + " element=" + element;
    }

    /** 顶层 Activity 的包名：优先 {@code topActivity}，退回 {@code origActivity}。 */
    private static String packageOfFirstComponent(Object taskInfo) {
        String pkg = packageOfComponent(field(taskInfo, "topActivity"));
        if (pkg != null) return pkg;
        return packageOfComponent(field(taskInfo, "origActivity"));
    }

    /**
     * {@code ComponentName} → 包名。为了能在 JVM 上测，这里不引用 Android 类型：
     * 字符串按 {@code pkg/cls} 切，其它对象调用其 {@code getPackageName()}。
     */
    static String packageOfComponent(Object component) {
        if (component == null) return null;
        if (component instanceof CharSequence) {
            String text = component.toString().trim();
            if (text.isEmpty()) return null;
            int slash = text.indexOf('/');
            return slash > 0 ? text.substring(0, slash) : text;
        }
        try {
            Method method = component.getClass().getMethod("getPackageName");
            Object value = method.invoke(component);
            if (value instanceof String && !((String) value).isEmpty()) return (String) value;
        } catch (Throwable ignored) { /* Not a ComponentName-like object. */ }
        Object field = field(component, "packageName");
        return field instanceof String && !((String) field).isEmpty() ? (String) field : null;
    }

    private static Integer intField(Object owner, String name) {
        Object value = field(owner, name);
        return value instanceof Number ? ((Number) value).intValue() : null;
    }

    /**
     * 读字段：先 public（{@code RootTaskInfo.taskId} 是 public 的），再 declared+accessible
     * （部分 ROM 把字段挪进了内部类）。两次都失败返回 null，由调用方判为不可读。
     */
    private static Object field(Object owner, String name) {
        if (owner == null) return null;
        Class<?> type = owner.getClass();
        try {
            Field declared = type.getField(name);
            return declared.get(owner);
        } catch (Throwable ignored) { /* fall through */ }
        try {
            Field declared = type.getDeclaredField(name);
            declared.setAccessible(true);
            return declared.get(owner);
        } catch (Throwable ignored) {
            return null;
        }
    }

    private RootTaskLookup() {}
}
