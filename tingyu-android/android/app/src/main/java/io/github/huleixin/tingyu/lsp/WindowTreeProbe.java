package io.github.huleixin.tingyu.lsp;

import java.util.ArrayDeque;
import java.util.Collections;
import java.util.Deque;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Set;

// android/app/src/main/java/io/github/huleixin/tingyu/lsp/WindowTreeProbe.java
/**
 * 窗口树探测：这个显示上还有没有属于本应用的窗口。
 *
 * <p>v1.3.59 的缺陷：备用路径只扫 {@code DisplayContent.mChildren} 的<b>第一层</b>。
 * AOSP 11 起窗口树的真实层次是
 *
 * <pre>
 * DisplayContent → DisplayArea(TaskDisplayArea/…) → Task → TaskFragment → ActivityRecord → WindowState
 * </pre>
 *
 * 也就是说 {@code DisplayContent.mChildren} 里装的是 {@code DisplayArea}，不是
 * {@code WindowState}：第一层的每个元素都没有 {@code mAttrs}，{@code OWN_WINDOW} 谓词必然
 * 返回 false，于是「读得到但没有匹配」被当成确定的 ABSENT。后果是
 * {@code RearDisplayLease.renewForWindow()} 永远不被调用 —— 租约在锁屏 60 秒后自然到期，
 * 背屏随之熄屏。这正是「LSP 模式锁屏背屏无法稳定显示」的直接原因。
 *
 * <p>三条结论必须分开（调用方据此分别处理，见 {@link RearWindowRenewPolicy}）：
 * <ul>
 *   <li>{@link Presence#PRESENT} —— 遍历完成并找到本应用窗口；</li>
 *   <li>{@link Presence#ABSENT} —— 遍历完成、树形结构可读、没有本应用窗口；</li>
 *   <li>{@link Presence#UNKNOWN} —— 结构读不全/层数或节点数被截断，<b>不能</b>当作「没有」。</li>
 * </ul>
 *
 * <p>为了让遍历本身可被 JVM 单测（多层嵌套、环形引用、超深树），这里不接触 Android 或
 * Xposed 的反射细节，而是只依赖 {@link Node} 抽象；真实反射在 {@link XposedWindowNode}。
 */
final class WindowTreeProbe {

    enum Presence { PRESENT, ABSENT, UNKNOWN }

    /** 深度上限：真实层次最深约 8 层（Display → Area → Task → Fragment → Activity → Window）。 */
    static final int MAX_DEPTH = 16;
    /** 节点上限：600 个窗口的显示远小于这个数；超限即视为「读不完」，不当作 ABSENT。 */
    static final int MAX_NODES = 4096;

    /** 被测节点。实现方负责所有反射/异常处理，`null` 表示「读不到」。 */
    interface Node {
        /** 是否是一个窗口（有 layout params）。 */
        boolean isWindow();
        /** 窗口所属包名；非窗口或读不到返回 null。 */
        String packageName();
        /** 子容器；读不到返回 null（与「空列表」不同）。 */
        List<? extends Node> children();
    }

    static final class Outcome {
        final Presence presence;
        final String reason;
        final int nodes;
        final int windows;

        Outcome(Presence presence, String reason, int nodes, int windows) {
            this.presence = presence;
            this.reason = reason;
            this.nodes = nodes;
            this.windows = windows;
        }

        @Override public String toString() {
            return presence + "(" + reason + ", nodes=" + nodes + ", windows=" + windows + ")";
        }
    }

    /**
     * 从 {@code root}（通常是 {@code DisplayContent}）向下遍历，判断是否存在 {@code pkg} 的窗口。
     *
     * <p>截断（深度/节点上限）与结构不可读都返回 UNKNOWN：宁可让调用方保留保守行为，
     * 也不要把「我没读完」谎报成「确实没有」。
     */
    static Outcome probe(Node root, String pkg) {
        if (root == null) return new Outcome(Presence.UNKNOWN, "no-root", 0, 0);
        if (pkg == null || pkg.isEmpty()) return new Outcome(Presence.UNKNOWN, "no-package", 0, 0);
        Set<Object> visited = Collections.newSetFromMap(new IdentityHashMap<>());
        Deque<Frame> stack = new ArrayDeque<>();
        stack.push(new Frame(root, 0));
        int nodes = 0, windows = 0, unreadable = 0;
        boolean truncated = false;
        while (!stack.isEmpty()) {
            Frame frame = stack.pop();
            if (!visited.add(frame.node)) continue; // 环形/重复引用：跳过，不算截断。
            if (++nodes > MAX_NODES) { truncated = true; break; }
            if (frame.node.isWindow()) {
                windows++;
                if (pkg.equals(frame.node.packageName())) {
                    return new Outcome(Presence.PRESENT, "own-window", nodes, windows);
                }
                continue; // 窗口的下级不会再挂窗口。
            }
            List<? extends Node> children = frame.node.children();
            if (children == null) { unreadable++; continue; }
            if (children.isEmpty()) continue;
            if (frame.depth >= MAX_DEPTH) { truncated = true; continue; }
            for (Object child : children) {
                if (child == null) { unreadable++; continue; } // 空元素 = 结构异常，不是「没有窗口」
                if (child instanceof Node) stack.push(new Frame((Node) child, frame.depth + 1));
                else unreadable++;
            }
        }
        if (truncated) return new Outcome(Presence.UNKNOWN, "truncated", nodes, windows);
        if (unreadable > 0) return new Outcome(Presence.UNKNOWN, "unreadable-nodes", nodes, windows);
        // 走完整棵树、每层容器都可读，且没有本应用窗口：这才是确定的 ABSENT。
        return new Outcome(Presence.ABSENT, windows == 0 ? "empty-tree" : "other-windows", nodes, windows);
    }

    private static final class Frame {
        final Node node;
        final int depth;

        Frame(Node node, int depth) {
            this.node = node;
            this.depth = depth;
        }
    }

    private WindowTreeProbe() {}
}
