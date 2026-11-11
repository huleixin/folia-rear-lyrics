package io.github.huleixin.tingyu.chrome;

import java.util.Arrays;
import org.json.JSONObject;

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/FrameWindowStats.java
/** Bounded opt-in app-frame evidence; budget overruns are not physical display jank. */
final class FrameWindowStats {
    private static final int CAPACITY = 4096;
    private final long[] total = new long[CAPACITY], budget = new long[CAPACITY],
        layout = new long[CAPACITY], draw = new long[CAPACITY];
    private int cursor, size;
    private long observed, lost;

    synchronized void add(long duration, long deadline, int dropped, long layoutNs, long drawNs) {
        lost += Math.max(0, dropped);
        if (duration < 0 || deadline <= 0) return;
        total[cursor] = duration; budget[cursor] = deadline;
        layout[cursor] = Math.max(0, layoutNs); draw[cursor] = Math.max(0, drawNs);
        cursor = (cursor + 1) % CAPACITY; size = Math.min(CAPACITY, size + 1); observed++;
    }

    synchronized JSONObject snapshot() {
        JSONObject result = new JSONObject();
        try {
            long[] sorted = Arrays.copyOf(total, size); Arrays.sort(sorted);
            double sum = 0, layoutSum = 0, drawSum = 0;
            int over = 0, severe = 0;
            long minBudget = Long.MAX_VALUE, maxBudget = 0;
            for (int i = 0; i < size; i++) {
                sum += total[i]; layoutSum += layout[i]; drawSum += draw[i];
                if (total[i] > budget[i]) over++;
                if (total[i] > budget[i] * 2) severe++;
                minBudget = Math.min(minBudget, budget[i]); maxBudget = Math.max(maxBudget, budget[i]);
            }
            result.put("observedFrames", observed).put("retainedFrames", size).put("capacity", CAPACITY)
                .put("callbackReportsLost", lost).put("completeWindow", observed <= CAPACITY && lost == 0)
                .put("budgetOverruns", over).put("overTwoBudgets", severe)
                .put("budgetOverrunRatio", size == 0 ? 0 : (double) over / size)
                .put("meanMs", size == 0 ? 0 : sum / size / 1e6)
                .put("layoutMeasureMeanMs", size == 0 ? 0 : layoutSum / size / 1e6)
                .put("drawMeanMs", size == 0 ? 0 : drawSum / size / 1e6)
                .put("p50Ms", percentile(sorted, .50)).put("p90Ms", percentile(sorted, .90))
                .put("p95Ms", percentile(sorted, .95)).put("p99Ms", percentile(sorted, .99))
                .put("maxMs", size == 0 ? 0 : sorted[size - 1] / 1e6)
                .put("budgetMinMs", size == 0 ? 0 : minBudget / 1e6).put("budgetMaxMs", maxBudget / 1e6)
                .put("scope", "recent completed app frames; nearest-rank percentiles; not display presentation");
        } catch (Exception ignored) { }
        return result;
    }

    private static double percentile(long[] sorted, double fraction) {
        return sorted.length == 0 ? 0 : sorted[(int) Math.ceil(sorted.length * fraction) - 1] / 1e6;
    }
}
