package io.github.huleixin.tingyu;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Inspect only the requested rear display; Activity.onStart alone cannot prove it is uncovered. */
final class RearLyricsTaskList {
    private static final Pattern ROOT = Pattern.compile("^(?:RootTask|Stack) id=\\d+ .*\\bdisplayId=(\\d+)\\b");
    private static final Pattern TASK = Pattern.compile("^\\s+taskId=(\\d+): ([^\\s]+)");
    static String front(String listing, int rearDisplay) {
        int display = -1;
        for (String line : listing.split("\\r?\\n")) {
            Matcher root = ROOT.matcher(line);
            if (root.find()) { display = Integer.parseInt(root.group(1)); continue; }
            if (display != rearDisplay) continue;
            Matcher task = TASK.matcher(line);
            if (task.find()) return task.group(1) + " " + task.group(2);
        }
        return "-1 unknown";
    }
    static int taskId(String summary) {
        try { return Integer.parseInt(summary.split(" ")[0]); } catch (Exception ignored) { return -1; }
    }
    /** "12 com.android.camera/.Camera" or "12 com.android.camera" -> "com.android.camera"; null when unknown. */
    static String packageName(String summary) {
        try {
            String component = summary.split(" ")[1];
            int slash = component.indexOf('/');
            return slash > 0 ? component.substring(0, slash) : component;
        } catch (Exception ignored) { return null; }
    }
}
