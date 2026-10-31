package io.github.huleixin.tingyu.lsp;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import org.junit.Test;

/**
 * {@code getAllRootTaskInfos()} 返回值解析的回归测试。
 *
 * <p>被覆盖的真实错误路径（v1.3.59 在真机上 100% 命中）：
 * {@code (Object[]) IActivityTaskManager.getAllRootTaskInfos().invoke(atm)} —— 该方法返回
 * {@code List<RootTaskInfo>}，强转数组抛 {@code ClassCastException}，被
 * {@code catch (Throwable ignored)} 吞掉后恒为 null，迁移拦截因此从未生效。
 *
 * <p>测试用的「任务信息」是普通 POJO（public 字段 {@code taskId} / {@code topActivity}），
 * 与 {@code ActivityTaskManager.RootTaskInfo} 的可见形态一致，因此这段断言在 JVM 上有意义：
 * 它验证的是容器形态与字段读取，而不是 Android 的实现细节。
 */
public class RootTaskLookupTest {

    /** 对应 {@code RootTaskInfo}：public int taskId + public ComponentName topActivity。 */
    public static final class FakeTaskInfo {
        public int taskId;
        public Object topActivity;

        FakeTaskInfo(int taskId, Object topActivity) {
            this.taskId = taskId;
            this.topActivity = topActivity;
        }
    }

    /** 对应 {@code ComponentName}：只需要 getPackageName()。 */
    public static final class FakeComponent {
        private final String pkg;

        FakeComponent(String pkg) { this.pkg = pkg; }

        public String getPackageName() { return pkg; }
    }

    private static List<Object> roots(Object... entries) {
        return new ArrayList<>(Arrays.asList(entries));
    }

    @Test
    public void aListResultResolvesTheTopPackage() {
        // 这条断言就是 v1.3.59 的死因：返回的是 List，不是数组。
        List<Object> list = roots(
            new FakeTaskInfo(12, new FakeComponent("com.miui.home")),
            new FakeTaskInfo(77, new FakeComponent("com.xiaomi.subscreencenter")));

        RootTaskLookup.Result result = RootTaskLookup.topPackageOf(list, 77);

        assertTrue(result.found());
        assertEquals(RootTaskLookup.Status.FOUND, result.status);
        assertEquals("com.xiaomi.subscreencenter", result.packageName);
    }

    @Test
    public void aLegacyArrayResultStillWorks() {
        Object[] array = new Object[] { new FakeTaskInfo(5, new FakeComponent("com.android.camera")) };

        RootTaskLookup.Result result = RootTaskLookup.topPackageOf(array, 5);

        assertTrue(result.found());
        assertEquals("com.android.camera", result.packageName);
    }

    @Test
    public void aStringComponentIsParsedByItsSlash() {
        RootTaskLookup.Result result = RootTaskLookup.topPackageOf(
            roots(new FakeTaskInfo(9, "com.xiaomi.subscreencenter/.SubScreenLauncher")), 9);

        assertTrue(result.found());
        assertEquals("com.xiaomi.subscreencenter", result.packageName);
    }

    @Test
    public void aMissingTaskIsAbsentNotUnreadable() {
        RootTaskLookup.Result result = RootTaskLookup.topPackageOf(
            roots(new FakeTaskInfo(1, new FakeComponent("com.miui.home"))), 99);

        assertEquals(RootTaskLookup.Status.ABSENT, result.status);
        assertFalse(result.found());
    }

    @Test
    public void anEmptyListIsAbsent() {
        assertEquals(RootTaskLookup.Status.ABSENT,
            RootTaskLookup.topPackageOf(Collections.emptyList(), 3).status);
    }

    @Test
    public void anUnreadableContainerIsNotTreatedAsAbsent() {
        // null / 非 List 也非数组：必须报「读不到」，而不是「确实没有」。
        assertEquals(RootTaskLookup.Status.UNREADABLE, RootTaskLookup.topPackageOf(null, 1).status);
        assertEquals(RootTaskLookup.Status.UNREADABLE, RootTaskLookup.topPackageOf("nonsense", 1).status);
        assertEquals(RootTaskLookup.Status.UNREADABLE, RootTaskLookup.topPackageOf(roots(), 0).status);
    }

    @Test
    public void elementsWithoutTaskIdsAreUnreadable() {
        // 字段名被 ROM 改掉时不能静默降级成「没有这个任务」——那会让拦截再次悄悄失效。
        assertEquals(RootTaskLookup.Status.UNREADABLE,
            RootTaskLookup.topPackageOf(roots(new Object(), new Object()), 7).status);
    }

    @Test
    public void aTaskWithNoTopActivityIsUnreadable() {
        assertEquals(RootTaskLookup.Status.UNREADABLE,
            RootTaskLookup.topPackageOf(roots(new FakeTaskInfo(4, null)), 4).status);
    }

    @Test
    public void theContainerIsDescribedForDiagnostics() {
        String described = RootTaskLookup.describeContainer(
            roots(new FakeTaskInfo(2, new FakeComponent("a.b"))));
        assertTrue(described, described.contains("size=1"));
        assertTrue(described, described.contains(FakeTaskInfo.class.getName()));
        assertEquals("null", RootTaskLookup.describeContainer(null));
    }
}
