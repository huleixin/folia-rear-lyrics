package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/RearTaskTable.java
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * {@code am stack list} 的行式解析：把「某个显示上的前台任务」变成结构化结果。
 *
 * <h3>为什么重写</h3>
 * 1.3.62 在 {@code ShellUserService} 里内联了一套正则，真机（API 37）上
 * {@code SHELL_REFRONT} 返回：
 * <pre>
 * listing[before]=exit=0 ok  before=task-not-listed  front=-1 unknown
 * note=task-not-found-in-listing
 * </pre>
 * 也就是说解析器**一行都没匹配上**，而代码把它当成了「这个任务不存在」——
 * 一个查询失败被当成了事实结论。这是本类存在的唯一理由：三态必须分开。
 *
 * <h3>三态而不是两态</h3>
 * <ul>
 *   <li>{@link Status#OK}：解析出至少一个 root/task，且目标任务在表里；</li>
 *   <li>{@link Status#TASK_ABSENT}：表解析成功，但**确实没有**这个任务 id；</li>
 *   <li>{@link Status#UNREADABLE}：一行都没解析出来 —— 命令不支持、输出为空、
 *       或格式与已知几种都不同。**绝不能**把它当成「任务不存在」。</li>
 * </ul>
 *
 * <p>只做文本解析，不碰 Android API，可在 JVM 上直接断言（见 {@code RearTaskTableTest}）。
 */
final class RearTaskTable {

    enum Status { OK, TASK_ABSENT, UNREADABLE }

    /** 一行任务的归属：root task、display、task、组件（组件可能为空）。 */
    static final class Row {
        int root = -1, display = -1, task = -1;
        String component;

        String describe() {
            return "root=" + root + ", display=" + display + ", task=" + task
                + ", component=" + (component == null ? "?" : component);
        }
    }

    static final class Lookup {
        final Status status;
        final Row task;
        final Row front;
        final int rows;
        final String reason;

        Lookup(Status status, Row task, Row front, int rows, String reason) {
            this.status = status; this.task = task; this.front = front;
            this.rows = rows; this.reason = reason == null ? "" : reason;
        }

        boolean found() { return status == Status.OK; }

        String describe() {
            return status + "(rows=" + rows + ", task=" + (task == null ? "-" : task.describe())
                + ", front=" + (front == null ? "-" : front.task + " " + front.component)
                + (reason.isEmpty() ? "" : ", why=" + reason) + ")";
        }
    }

    private static final Pattern ROOT_LINE =
        Pattern.compile("^\\s*(?:RootTask|Stack|Task)\\s+id=#?(\\d+)\\b[^\\n]*?\\bdisplayId=(\\d+)\\b");
    /**
     * 任务块行。真机上见过三种写法：{@code * Task{hash #12 …}}、{@code Task{hash #12 …}}、
     * 以及把 {@code displayId=} 直接写在任务块里的变体 —— 后者的显示归属以本行为准，
     * 因为这时根本没有可用的 root 头。
     */
    private static final Pattern TASK_BLOCK =
        Pattern.compile("^\\s*(?:\\*\\s*)?Task\\{[^}]*?#(\\d+)\\b");
    private static final Pattern TASK_DISPLAY =
        Pattern.compile("^\\s*(?:\\*\\s*)?Task\\{[^}]*?\\bdisplayId=(\\d+)\\b");
    /** 旧格式：{@code taskId=12: com.pkg/.Act} */
    private static final Pattern TASK_LEGACY =
        Pattern.compile("^\\s*taskId=#?(\\d+):\\s*([^\\s]+)");
    /** 任何形如 {@code pkg/.Act t12} 的组件行，用来给当前 task 补 component。 */
    private static final Pattern ACTIVITY =
        Pattern.compile("([A-Za-z][\\w]*(?:\\.[\\w]+)+/[\\w.$]+)\\s+t(\\d+)\\b");
    private static final Pattern RESUMED =
        Pattern.compile("(?:mResumedActivity|topResumedActivity)[:=].*?([A-Za-z][\\w]*(?:\\.[\\w]+)+/[\\w.$]+)");

    private RearTaskTable() {}

    /**
     * @param listing   {@code am stack list} 的原始输出
     * @param taskId    要定位的任务 id（&lt;=0 表示只查前台）
     * @param rearDisplay 背屏 display id
     */
    static Lookup parse(String listing, int taskId, int rearDisplay) {
        List<Row> rows = rows(listing);
        if (rows.isEmpty()) {
            return new Lookup(Status.UNREADABLE, null, null, 0, "no root/task line matched");
        }
        Row front = null;
        for (Row row : rows) if (row.display == rearDisplay) { front = row; break; }
        Row target = null;
        for (Row row : rows) if (row.task == taskId) { target = row; break; }
        if (taskId <= 0) {
            return new Lookup(front == null ? Status.TASK_ABSENT : Status.OK, null, front, rows.size(),
                front == null ? "no row on display " + rearDisplay : "");
        }
        return new Lookup(target == null ? Status.TASK_ABSENT : Status.OK, target, front, rows.size(),
            target == null ? "task " + taskId + " not in a readable table" : "");
    }

    /** 只取前台（判定「系统是否又抢回去了」用）。 */
    static Lookup front(String listing, int rearDisplay) { return parse(listing, -1, rearDisplay); }

    /** 把一个 dump 解析成若干行；任何一行都没解析出来时返回空表（调用方据此判 UNREADABLE）。 */
    static List<Row> rows(String listing) {
        List<Row> rows = new ArrayList<>();
        if (listing == null) return rows;
        int display = -1, root = -1;
        Row current = null;
        String resumed = null;
        for (String line : listing.split("\\r?\\n")) {
            Matcher rootMatch = ROOT_LINE.matcher(line);
            if (rootMatch.find()) {
                root = number(rootMatch.group(1));
                display = number(rootMatch.group(2));
                current = null;
                continue;
            }
            if (resumed == null) {
                Matcher resumedMatch = RESUMED.matcher(line);
                if (resumedMatch.find()) resumed = resumedMatch.group(1);
            }
            Matcher block = TASK_BLOCK.matcher(line);
            if (block.find()) {
                current = new Row();
                current.root = root;
                Matcher inline = TASK_DISPLAY.matcher(line);
                current.display = inline.find() ? number(inline.group(1)) : display;
                current.task = number(block.group(1));
                rows.add(current);
                continue;
            }
            Matcher legacy = TASK_LEGACY.matcher(line);
            if (legacy.find()) {
                current = new Row();
                current.root = root; current.display = display; current.task = number(legacy.group(1));
                current.component = legacy.group(2);
                rows.add(current);
                continue;
            }
            if (current != null && current.component == null) {
                Matcher activity = ACTIVITY.matcher(line);
                while (activity.find()) {
                    if (number(activity.group(2)) == current.task) { current.component = activity.group(1); break; }
                }
            }
        }
        // 有的固件把组件只写在顶层 mResumedActivity 行里，没有 t<id> 关联：补给最上面那一行。
        if (resumed != null) {
            for (Row row : rows) {
                if (row.component == null) { row.component = resumed; break; }
            }
        }
        return rows;
    }

    /** 只取包名；{@code null} 表示未知。 */
    static String packageOf(String component) {
        if (component == null) return null;
        int slash = component.indexOf('/');
        return slash > 0 ? component.substring(0, slash) : component;
    }

    private static int number(String value) {
        try { return Integer.parseInt(value); } catch (RuntimeException ignored) { return -1; }
    }
}
