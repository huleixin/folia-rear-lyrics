package io.github.huleixin.tingyu;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Reads the rear (and main) display's foreground task out of an {@code am stack list} dump.
 *
 * <p>Only the requested rear display decides occlusion; the main display is read from the same
 * dump at no extra cost because the camera app lives there, and "the camera is in front on the
 * main screen" is the only evidence that survives a ROM which draws the rear preview without
 * ever marking a rear task as a camera.
 *
 * <p>Two listing shapes are understood: the classic {@code RootTask id=..displayId=..} block
 * with {@code taskId=N: pkg/.Act} children, and the newer {@code * Task{...#N}} block with an
 * {@code mResumedActivity: ActivityRecord{... pkg/.Act tN}} line. A listing that matches
 * neither is reported as unreadable, never as "no camera": an unparsed dump must not be
 * mistaken for proof that the panel is free.
 */
final class RearLyricsTaskList {
    private static final Pattern ROOT = Pattern.compile("^(?:RootTask|Stack|Task) id=#?(\\d+) .*\\bdisplayId=(\\d+)\\b");
    private static final Pattern TASK = Pattern.compile("^\\s+taskId=#?(\\d+): ([^\\s]+)");
    private static final Pattern TASK_BLOCK = Pattern.compile("^\\s*\\* Task\\{[^}]*#(\\d+)\\b");
    private static final Pattern RESUMED = Pattern.compile(
        "(?:mResumedActivity|topResumedActivity)[:=].*?([A-Za-z][\\w]*(?:\\.[\\w]+)+/[\\w.$]+)");
    private static final Pattern COMPACT = Pattern.compile("^(-?\\d+) ([^\\s]+)$");

    private RearLyricsTaskList() {}

    /** Result of one listing read; immutable and safe to hand to the coordinator. */
    static final class Evidence {
        final int taskId, mainTaskId;
        final String component, mainComponent;
        final boolean readable;
        Evidence(int taskId, String component, int mainTaskId, String mainComponent, boolean readable) {
            this.taskId = taskId; this.component = component;
            this.mainTaskId = mainTaskId; this.mainComponent = mainComponent;
            this.readable = readable;
        }
        boolean rearCameraTask() { return RearCameraPolicy.isCameraTask(component); }
        boolean mainCameraTask() { return RearCameraPolicy.isCameraTask(mainComponent); }
        String rearPackage() { return packageOf(component); }
        String describe() {
            return "rear=" + taskId + " " + (component == null ? "?" : component)
                + ", main=" + mainTaskId + " " + (mainComponent == null ? "?" : componentOrUnknown())
                + ", readable=" + readable;
        }
        private String componentOrUnknown() { return mainComponent == null ? "?" : mainComponent; }
    }

    static Evidence parse(String listing, int rearDisplay) {
        if (listing == null) return new Evidence(-1, null, -1, null, false);
        String trimmed = listing.trim();
        if (trimmed.isEmpty()) return new Evidence(-1, null, -1, null, false);
        // Compact form emitted by the LSP module: "<taskId> <pkg/.Activity>".
        Matcher compact = COMPACT.matcher(trimmed);
        if (compact.find() && !trimmed.contains("\n")) {
            int id = number(compact.group(1));
            return new Evidence(id, compact.group(2), -1, null, id >= 0);
        }
        int display = Integer.MIN_VALUE, roots = 0;
        int rearTask = -1, mainTask = -1;
        String rearComponent = null, mainComponent = null;
        boolean rearDone = false, mainDone = false;
        for (String line : trimmed.split("\\r?\\n")) {
            Matcher root = ROOT.matcher(line);
            if (root.find()) { display = number(root.group(2)); roots++; continue; }
            Matcher block = TASK_BLOCK.matcher(line);
            if (block.find()) {
                if (!rearDone && display == rearDisplay) { rearTask = number(block.group(1)); rearDone = true; }
                else if (!mainDone && display == 0) { mainTask = number(block.group(1)); mainDone = true; }
                continue;
            }
            Matcher task = TASK.matcher(line);
            if (task.find()) {
                int id = number(task.group(1));
                String component = task.group(2);
                if (!rearDone && display == rearDisplay) { rearTask = id; rearComponent = component; rearDone = true; }
                else if (!mainDone && display == 0) { mainTask = id; mainComponent = component; mainDone = true; }
                continue;
            }
            Matcher resumed = RESUMED.matcher(line);
            if (resumed.find()) {
                String component = resumed.group(1);
                if (display == rearDisplay && rearComponent == null) rearComponent = component;
                else if (display == 0 && mainComponent == null) mainComponent = component;
            }
        }
        return new Evidence(rearTask, rearComponent, mainTask, mainComponent, roots > 0);
    }

    /** Legacy helper: the rear display's front task as "id component". */
    static String front(String listing, int rearDisplay) {
        Evidence evidence = parse(listing, rearDisplay);
        if (!evidence.readable || evidence.taskId < 0 || evidence.component == null) return "-1 unknown";
        return evidence.taskId + " " + evidence.component;
    }
    static int taskId(String summary) {
        if (summary == null) return -1;
        try { return Integer.parseInt(summary.split(" ")[0]); } catch (Exception ignored) { return -1; }
    }
    /** "12 com.android.camera/.Camera" or "12 com.android.camera" -> "com.android.camera"; null when unknown. */
    static String packageName(String summary) { return summary == null ? null : packageOf(split(summary)); }
    static boolean isReadable(String summary) {
        return summary != null && !summary.contains("unavailable") && !"-1 unknown".equals(summary.trim());
    }
    private static String split(String summary) {
        try { return summary.split(" ")[1]; } catch (Exception ignored) { return null; }
    }
    private static String packageOf(String component) {
        if (component == null) return null;
        int slash = component.indexOf('/');
        return slash > 0 ? component.substring(0, slash) : component;
    }
    private static int number(String value) {
        try { return Integer.parseInt(value); } catch (Exception ignored) { return -1; }
    }
}
