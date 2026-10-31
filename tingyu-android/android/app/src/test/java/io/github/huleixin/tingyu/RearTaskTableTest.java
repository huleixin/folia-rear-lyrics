package io.github.huleixin.tingyu;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * {@code am stack list} 解析的三态测试。
 *
 * <p>被覆盖的真实错误：1.3.62 的服务端解析器在真机上一行都没匹配上，却把结果写成
 * {@code before=task-not-listed / front=-1 unknown}，调用方据此判定「任务不存在」。
 * 一次**查询失败**被当成了**事实结论**，于是恢复路径朝着「重建」而不是「换机制」走。
 *
 * <p>这里钉住的正是这条线：解析不出任何行必须是 UNREADABLE，只有「表读得出来、
 * 但确实没有这个任务」才是 TASK_ABSENT。
 */
public class RearTaskTableTest {

    private static final int REAR = 1;
    private static final int TASK = 56964;

    /** AOSP 13+ 的形状：RootTask 头 + * Task{hash #id} + ActivityRecord … tN。 */
    private static final String MODERN =
        "RootTask id=1 bounds=[0,0][1220,2656] displayId=0\n"
        + "  * Task{aa11bb #56961 type=standard A=10456:io.github.huleixin.tingyu U=0 visible=true}\n"
        + "    * ActivityRecord{1f2e3d u0 io.github.huleixin.tingyu/.MainActivity t56961}\n"
        + "    mResumedActivity: ActivityRecord{1f2e3d u0 io.github.huleixin.tingyu/.MainActivity t56961}\n"
        + "RootTask id=4 bounds=[0,0][904,572] displayId=1\n"
        + "  * Task{bb22cc #4 type=home A=1000:com.xiaomi.subscreencenter U=0 visible=true}\n"
        + "    * ActivityRecord{2a3b4c u0 com.xiaomi.subscreencenter/.SubScreenLauncher t4}\n"
        + "  * Task{cc33dd #56964 type=standard A=10456:io.github.huleixin.tingyu U=0 visible=false}\n"
        + "    * ActivityRecord{3b4c5d u0 io.github.huleixin.tingyu/.RearLyricsActivity t56964}\n";

    /** 旧形状：Stack 头 + taskId=N: component。 */
    private static final String LEGACY =
        "Stack id=0 bounds=[0,0][1220,2656] displayId=0\n"
        + "  taskId=56961: io.github.huleixin.tingyu/.MainActivity\n"
        + "Stack id=1 bounds=[0,0][904,572] displayId=1\n"
        + "  taskId=4: com.xiaomi.subscreencenter/.SubScreenLauncher\n"
        + "  taskId=56964: io.github.huleixin.tingyu/.RearLyricsActivity\n";

    /** 任务块自带 displayId、没有 root 头的形状。 */
    private static final String INLINE_DISPLAY =
        "* Task{aa11bb #56961 displayId=0 A=10456:io.github.huleixin.tingyu}\n"
        + "* Task{cc33dd #56964 displayId=1 A=10456:io.github.huleixin.tingyu}\n";

    @Test
    public void theModernShapeLocatesTheTaskAndTheRearFront() {
        RearTaskTable.Lookup lookup = RearTaskTable.parse(MODERN, TASK, REAR);
        assertEquals(RearTaskTable.Status.OK, lookup.status);
        assertNotNull(lookup.task);
        assertEquals(56964, lookup.task.task);
        assertEquals(REAR, lookup.task.display);
        assertEquals(4, lookup.task.root);
        assertEquals("io.github.huleixin.tingyu/.RearLyricsActivity", lookup.task.component);
        assertNotNull("背屏前台是背屏桌面", lookup.front);
        assertEquals(4, lookup.front.task);
        assertEquals("com.xiaomi.subscreencenter", RearTaskTable.packageOf(lookup.front.component));
    }

    @Test
    public void theLegacyShapeStillWorks() {
        RearTaskTable.Lookup lookup = RearTaskTable.parse(LEGACY, TASK, REAR);
        assertEquals(RearTaskTable.Status.OK, lookup.status);
        assertEquals(56964, lookup.task.task);
        assertEquals(REAR, lookup.task.display);
        assertEquals("io.github.huleixin.tingyu/.RearLyricsActivity", lookup.task.component);
        assertEquals(4, lookup.front.task);
    }

    @Test
    public void aTaskLineCarryingItsOwnDisplayIsEnough() {
        RearTaskTable.Lookup lookup = RearTaskTable.parse(INLINE_DISPLAY, TASK, REAR);
        assertEquals(RearTaskTable.Status.OK, lookup.status);
        assertEquals(REAR, lookup.task.display);
        assertEquals(TASK, lookup.front.task);
    }

    @Test
    public void nothingParsedIsUnreadableNotTaskAbsent() {
        // 这正是 1.3.62 的真机输出：命令退出码 0，但没有一行是已知格式。
        for (String listing : new String[] {
                "", "Error: Unknown command 'stack'", "some unrelated dump without tasks",
                "{\"tasks\":[]}" }) {
            RearTaskTable.Lookup lookup = RearTaskTable.parse(listing, TASK, REAR);
            assertEquals("listing=" + listing, RearTaskTable.Status.UNREADABLE, lookup.status);
            assertFalse("读不出来绝不能说任务不存在", lookup.status == RearTaskTable.Status.TASK_ABSENT);
            assertNull(lookup.task);
        }
        assertEquals(RearTaskTable.Status.UNREADABLE, RearTaskTable.parse(null, TASK, REAR).status);
    }

    @Test
    public void aReadableTableWithoutTheTaskIsTaskAbsent() {
        String listing = MODERN.replace("56964", "57000");
        RearTaskTable.Lookup lookup = RearTaskTable.parse(listing, TASK, REAR);
        assertEquals(RearTaskTable.Status.TASK_ABSENT, lookup.status);
        assertNull(lookup.task);
        // 表本身是可读的，前台仍然能读到 —— 「任务没了」与「前台是谁」是两件事。
        assertEquals(4, lookup.front.task);
    }

    @Test
    public void aTableWithoutTheRearDisplayHasNoFrontButIsReadable() {
        String listing = MODERN.substring(0, MODERN.indexOf("RootTask id=4"));
        RearTaskTable.Lookup lookup = RearTaskTable.parse(listing, TASK, REAR);
        assertEquals(RearTaskTable.Status.TASK_ABSENT, lookup.status);
        assertNull(lookup.front);
        assertTrue(lookup.rows > 0);
    }

    @Test
    public void theFrontOnlyLookupDoesNotRequireATaskId() {
        RearTaskTable.Lookup lookup = RearTaskTable.front(MODERN, REAR);
        assertEquals(RearTaskTable.Status.OK, lookup.status);
        assertEquals(4, lookup.front.task);
        assertNull(lookup.task);
    }
}
