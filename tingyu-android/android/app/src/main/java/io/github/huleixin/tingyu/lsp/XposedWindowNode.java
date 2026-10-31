package io.github.huleixin.tingyu.lsp;

import java.util.List;
import de.robv.android.xposed.XposedHelpers;

// android/app/src/main/java/io/github/huleixin/tingyu/lsp/XposedWindowNode.java
/**
 * {@link WindowTreeProbe.Node} 在 system_server 里的真实实现。
 *
 * <p>只用 XposedHelpers 读两个字段（它在内部绕过 hidden-API 限制，这是普通
 * {@code Field.setAccessible} 在部分 ROM 上做不到的）：
 * <ul>
 *   <li>{@code mChildren} —— {@code WindowContainer} 的子容器表（{@code WindowList}，
 *       本身是 {@code ArrayList}）；</li>
 *   <li>{@code mAttrs} —— 只有 {@code WindowState} 才有，因此它同时是「这是不是窗口」的判据。</li>
 * </ul>
 * 任何一次读取失败都返回 {@code null}，由 {@link WindowTreeProbe} 判为不可读（UNKNOWN），
 * 绝不当成「没有窗口」。
 */
final class XposedWindowNode implements WindowTreeProbe.Node {

    private final Object target;
    private WindowTreeProbe.Presence windowPresence; // 惰性判定，避免重复反射

    XposedWindowNode(Object target) {
        this.target = target;
    }

    static WindowTreeProbe.Node of(Object target) {
        return target == null ? null : new XposedWindowNode(target);
    }

    @Override public boolean isWindow() {
        return attrs() != null;
    }

    @Override public String packageName() {
        Object attrs = attrs();
        if (attrs == null) return null;
        try {
            Object pkg = XposedHelpers.getObjectField(attrs, "packageName");
            return pkg instanceof String && !((String) pkg).isEmpty() ? (String) pkg : null;
        } catch (Throwable ignored) {
            return null;
        }
    }

    @Override public List<? extends WindowTreeProbe.Node> children() {
        Object children;
        try {
            children = XposedHelpers.getObjectField(target, "mChildren");
        } catch (Throwable ignored) {
            return null; // 字段名不同/被裁剪：不可读，而不是「没有子节点」。
        }
        if (!(children instanceof List)) return null;
        List<?> raw = (List<?>) children;
        java.util.ArrayList<WindowTreeProbe.Node> nodes = new java.util.ArrayList<>(raw.size());
        for (Object child : raw) nodes.add(child == null ? null : new XposedWindowNode(child));
        return nodes;
    }

    private Object attrs() {
        try {
            return XposedHelpers.getObjectField(target, "mAttrs");
        } catch (Throwable ignored) {
            return null;
        }
    }
}
