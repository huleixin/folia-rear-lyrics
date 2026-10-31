package io.github.huleixin.tingyu.lsp;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import org.junit.Test;

/**
 * 窗口树探测的回归测试。
 *
 * <p>被覆盖的真实错误路径：{@code DisplayContent.mChildren} 的第一层装的是
 * {@code DisplayArea}（AOSP 11+），不是 {@code WindowState}。v1.3.59 只扫这一层，
 * 于是「读得到但没有匹配」被当成确定的 ABSENT，{@code renewForWindow()} 从不被调用，
 * 租约在锁屏 60 秒后自然到期、背屏熄屏。
 */
public class WindowTreeProbeTest {

    private static final String PKG = "io.github.huleixin.tingyu";

    /** 用普通对象搭出与 AOSP 同形的层次：Display → Area → Task → Fragment → Activity → Window。 */
    private static final class FakeNode implements WindowTreeProbe.Node {
        final boolean window;
        final String pkg;
        List<WindowTreeProbe.Node> children;
        /** true 表示 children() 读不到（字段被裁剪），与「空列表」语义不同。 */
        boolean unreadable;

        private FakeNode(boolean window, String pkg) {
            this.window = window;
            this.pkg = pkg;
        }

        static FakeNode container(FakeNode... children) {
            FakeNode node = new FakeNode(false, null);
            node.children = new ArrayList<>();
            Collections.addAll(node.children, children);
            return node;
        }

        static FakeNode unreadable() {
            FakeNode node = new FakeNode(false, null);
            node.unreadable = true;
            return node;
        }

        static FakeNode window(String pkg) {
            return new FakeNode(true, pkg);
        }

        @Override public boolean isWindow() { return window; }
        @Override public String packageName() { return pkg; }
        @Override public List<? extends WindowTreeProbe.Node> children() {
            return unreadable ? null : children;
        }
    }

    @Test
    public void findsOurWindowFourLevelsBelowTheDisplay() {
        FakeNode display = FakeNode.container(
            FakeNode.container(                                  // DisplayArea
                FakeNode.container(                              // Task
                    FakeNode.container(                          // TaskFragment
                        FakeNode.container(FakeNode.window(PKG)))))); // ActivityRecord → WindowState

        WindowTreeProbe.Outcome outcome = WindowTreeProbe.probe(display, PKG);

        assertEquals(outcome.toString(), WindowTreeProbe.Presence.PRESENT, outcome.presence);
    }

    @Test
    public void theFirstLevelAloneWouldReportAbsent() {
        // 复刻 v1.3.59 的判定方式：只看第一层、只认「有 mAttrs 的节点」。
        List<WindowTreeProbe.Node> firstLevel = new ArrayList<>();
        FakeNode display = FakeNode.container(
            FakeNode.container(FakeNode.container(FakeNode.window(PKG))));
        firstLevel.addAll(display.children());
        boolean firstLevelHit = false;
        for (WindowTreeProbe.Node node : firstLevel) {
            if (node.isWindow() && PKG.equals(node.packageName())) firstLevelHit = true;
        }
        assertFalse("第一层必须扫不到，这正是 v1.3.59 的缺陷形态", firstLevelHit);

        // 深度遍历必须找到它。
        assertEquals(WindowTreeProbe.Presence.PRESENT, WindowTreeProbe.probe(display, PKG).presence);
    }

    @Test
    public void otherWindowsOnlyIsAbsent() {
        FakeNode display = FakeNode.container(
            FakeNode.container(FakeNode.window("com.miui.home")),
            FakeNode.container(FakeNode.window("com.android.systemui")));

        assertEquals(WindowTreeProbe.Presence.ABSENT, WindowTreeProbe.probe(display, PKG).presence);
    }

    @Test
    public void anEmptyDisplayIsAbsentNotUnknown() {
        WindowTreeProbe.Outcome outcome = WindowTreeProbe.probe(FakeNode.container(), PKG);
        assertEquals(WindowTreeProbe.Presence.ABSENT, outcome.presence);
        assertEquals("empty-tree", outcome.reason);
    }

    @Test
    public void unreadableStructureIsUnknown() {
        // 容器读不到子节点：不能断言「没有窗口」。
        FakeNode display = FakeNode.container(FakeNode.unreadable());
        assertEquals(WindowTreeProbe.Presence.UNKNOWN, WindowTreeProbe.probe(display, PKG).presence);
        // 根节点本身就读不到。
        assertEquals(WindowTreeProbe.Presence.UNKNOWN, WindowTreeProbe.probe(FakeNode.unreadable(), PKG).presence);
    }

    @Test
    public void aNullRootIsUnknown() {
        assertEquals(WindowTreeProbe.Presence.UNKNOWN, WindowTreeProbe.probe(null, PKG).presence);
        assertEquals(WindowTreeProbe.Presence.UNKNOWN, WindowTreeProbe.probe(FakeNode.container(), null).presence);
    }

    @Test
    public void aTreeDeeperThanTheDepthLimitIsUnknownNotAbsent() {
        FakeNode node = FakeNode.window(PKG);
        for (int i = 0; i < WindowTreeProbe.MAX_DEPTH + 4; i++) node = FakeNode.container(node);

        WindowTreeProbe.Outcome outcome = WindowTreeProbe.probe(node, PKG);
        assertEquals(outcome.toString(), WindowTreeProbe.Presence.UNKNOWN, outcome.presence);
        assertEquals("truncated", outcome.reason);
    }

    @Test
    public void aCycleDoesNotHangAndDoesNotFakePresence() {
        FakeNode a = FakeNode.container();
        FakeNode b = FakeNode.container();
        a.children.add(b);
        b.children.add(a);

        WindowTreeProbe.Outcome outcome = WindowTreeProbe.probe(a, PKG);
        assertEquals(WindowTreeProbe.Presence.ABSENT, outcome.presence);
    }

    @Test
    public void presenceWinsOverUnreadableSiblings() {
        // 只要有一条路径真的看到本应用窗口，就足以判定 PRESENT，不必因为别处读不到而退回 UNKNOWN。
        FakeNode display = FakeNode.container(
            FakeNode.unreadable(),
            FakeNode.container(FakeNode.window(PKG)));

        assertEquals(WindowTreeProbe.Presence.PRESENT, WindowTreeProbe.probe(display, PKG).presence);
    }

    @Test
    public void aNullChildIsCountedAsUnreadableNotSkipped() {
        FakeNode display = new FakeNode(false, null);
        display.children = new ArrayList<>();
        display.children.add(null);
        display.children.add(FakeNode.window("com.miui.home"));

        WindowTreeProbe.Outcome outcome = WindowTreeProbe.probe(display, PKG);
        assertEquals(WindowTreeProbe.Presence.UNKNOWN, outcome.presence);
        assertTrue(outcome.toString(), outcome.nodes >= 2);
    }
}
